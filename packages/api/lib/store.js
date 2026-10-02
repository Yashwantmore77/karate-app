import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// One document store, two backends, chosen the same way the user store already
// chooses: MONGODB_URI present means Mongo, absent means memory. Routes are
// handed a collection and never learn which one they got.

const nowIso = () => new Date().toISOString()

/**
 * Stamps a batch with creation times one millisecond apart.
 *
 * Pages are sorted by createdAt. Rows written in the same instant would share
 * one, fall back to their random ids, and lose the order they were given in
 * — which for a drawn round robin is the order a mat works through them.
 */
const stampBatch = (docs) => {
  const start = Date.now()
  return docs.map((doc, i) => ({
    ...doc,
    id: doc.id ?? randomUUID(),
    createdAt: new Date(start + i).toISOString(),
  }))
}

const matchesFilter = (row, filter) =>
  Object.entries(filter).every(([field, value]) => row[field] === value)

// A search term goes into a regex on the Mongo side, so every character that
// means something to a regex engine is neutered first. Without this, a search
// for "(a+)+b" is a denial of service that needs no credentials.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const matchesSearch = (row, q, fields) => {
  if (!q || fields.length === 0) return true
  const needle = q.toLowerCase()
  return fields.some((field) => String(row[field] ?? '').toLowerCase().includes(needle))
}

/**
 * Whether a match belongs to one official.
 *
 * A bout nobody has been put on counts as everyone's: schedules are built
 * before panels are, and excluding unassigned bouts would hide most of the day
 * from the very people working it.
 */
const assignedTo = (row, uid) => {
  if (!uid) return true
  const panel = [row.refereeId, ...(row.judgeIds || [])].filter(Boolean)
  return panel.length === 0 || panel.includes(uid)
}

function memoryCollection(name) {
  const rows = new Map()

  return {
    name,
    async list(filter = {}) {
      return [...rows.values()].filter((row) => matchesFilter(row, filter))
    },
    async paginate(filter = {}, { q = '', searchFields = [], page = 1, limit = 25, official = null } = {}) {
      const found = [...rows.values()]
        .filter((row) => matchesFilter(row, filter))
        .filter((row) => assignedTo(row, official))
        .filter((row) => matchesSearch(row, q, searchFields))
      const start = (page - 1) * limit
      // Total counts everything the search matched, not the page — the caller
      // needs it to know how many pages there are.
      return { rows: found.slice(start, start + limit), total: found.length }
    },
    async overlapping({ startsAt, endsAt, excludeId = null, excludeStatus = [] }) {
      return [...rows.values()].filter((row) => (
        row.id !== excludeId
        && !excludeStatus.includes(row.status)
        // An unscheduled bout occupies nobody: it has no window to clash with.
        && typeof row.scheduledAt === 'string'
        && typeof row.endsAt === 'string'
        && row.scheduledAt < endsAt
        && row.endsAt > startsAt
      ))
    },
    async get(id) {
      return rows.get(id) ?? null
    },
    async insert(doc) {
      const row = { ...doc, id: doc.id ?? randomUUID(), createdAt: nowIso() }
      rows.set(row.id, row)
      return row
    },
    async insertMany(docs) {
      const batch = stampBatch(docs)
      for (const row of batch) rows.set(row.id, row)
      return batch
    },
    async update(id, patch) {
      const current = rows.get(id)
      if (!current) return null
      const next = { ...current, ...patch, updatedAt: nowIso() }
      rows.set(id, next)
      return next
    },
    async remove(id) {
      return rows.delete(id)
    },
    async removeWhere(filter) {
      let removed = 0
      for (const [id, row] of rows) {
        if (matchesFilter(row, filter)) {
          rows.delete(id)
          removed += 1
        }
      }
      return removed
    },
  }
}

function mongoCollection(name) {
  // Mongo's own `_id` is never exposed: `id` is the only identifier the rest of
  // the system knows, and leaking a second one invites call sites to pick the
  // wrong one.
  const withoutInternalId = { projection: { _id: 0 } }
  const collection = async () => (await getDb()).collection(name)

  return {
    name,
    async list(filter = {}) {
      return (await collection()).find(filter, withoutInternalId).toArray()
    },
    async paginate(filter = {}, { q = '', searchFields = [], page = 1, limit = 25, official = null } = {}) {
      const query = { ...filter }
      // Both of these are ORs, so they are combined under $and rather than
      // written to query.$or, where the second would overwrite the first.
      const conditions = []

      if (q && searchFields.length) {
        const pattern = new RegExp(escapeRegex(q), 'i')
        conditions.push({ $or: searchFields.map((field) => ({ [field]: pattern })) })
      }

      if (official) {
        const unassigned = {
          $and: [
            { $or: [{ refereeId: null }, { refereeId: { $exists: false } }] },
            { $or: [{ judgeIds: { $size: 0 } }, { judgeIds: { $exists: false } }] },
          ],
        }
        conditions.push({
          // judgeIds is an array, and Mongo matches an array field against a
          // scalar by testing its elements, which is exactly what is wanted.
          $or: [{ refereeId: official }, { judgeIds: official }, unassigned],
        })
      }

      if (conditions.length) query.$and = conditions
      const col = await collection()
      // Ordered so paging is stable: without a sort, skip/limit can repeat or
      // drop rows between pages as the storage engine pleases.
      const [rows, total] = await Promise.all([
        col.find(query, withoutInternalId)
          .sort({ createdAt: 1, id: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        col.countDocuments(query),
      ])
      return { rows, total }
    },
    async overlapping({ startsAt, endsAt, excludeId = null, excludeStatus = [] }) {
      // $type pins these to strings before comparing. Mongo orders null ahead
      // of every string, so a bare $lt would match every unscheduled bout and
      // report the whole collection as clashing.
      const query = {
        scheduledAt: { $type: 'string', $lt: endsAt },
        endsAt: { $type: 'string', $gt: startsAt },
      }
      if (excludeId) query.id = { $ne: excludeId }
      if (excludeStatus.length) query.status = { $nin: excludeStatus }
      return (await collection()).find(query, withoutInternalId).toArray()
    },
    async get(id) {
      return (await collection()).findOne({ id }, withoutInternalId)
    },
    async insert(doc) {
      const row = { ...doc, id: doc.id ?? randomUUID(), createdAt: nowIso() }
      await (await collection()).insertOne({ ...row })
      return row
    },
    async insertMany(docs) {
      const batch = stampBatch(docs)
      // Copies go to the driver, which adds _id to whatever it is handed.
      if (batch.length) await (await collection()).insertMany(batch.map((row) => ({ ...row })))
      return batch
    },
    async update(id, patch) {
      const result = await (await collection()).findOneAndUpdate(
        { id },
        { $set: { ...patch, updatedAt: nowIso() } },
        { returnDocument: 'after', ...withoutInternalId }
      )
      return result ?? null
    },
    async remove(id) {
      const { deletedCount } = await (await collection()).deleteOne({ id })
      return deletedCount > 0
    },
    async removeWhere(filter) {
      const { deletedCount } = await (await collection()).deleteMany(filter)
      return deletedCount
    },
  }
}

export const COLLECTIONS = ['tournaments', 'categories', 'competitors', 'matches', 'display']

/**
 * Builds the stores for one application instance.
 *
 * Per-instance rather than module-global on purpose: each createApp() in the
 * test suite then starts from an empty store, so tests cannot leak state into
 * one another through a shared module.
 */
export function createStores() {
  const build = isMongoConfigured() ? mongoCollection : memoryCollection
  return Object.fromEntries(COLLECTIONS.map((name) => [name, build(name)]))
}
