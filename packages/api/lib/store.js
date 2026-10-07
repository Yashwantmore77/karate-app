import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'
import { TMS_COLLECTIONS } from '@kumite/shared/tms.js'
import { searchRows, toMongo } from '@kumite/shared/query.js'

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
    createdAt: doc.createdAt ?? new Date(start + i).toISOString(),
  }))
}

const matchesFilter = (row, filter) =>
  Object.entries(filter).every(([field, value]) => row[field] === value)

// Optional list options shared by both backends: { sort: { field: 1 | -1 },
// skip, limit }. Without them a list is every match, as before.
const applyOptions = (list, { sort, skip = 0, limit } = {}) => {
  let out = list
  if (sort) {
    const [[field, dir]] = Object.entries(sort)
    out = [...out].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (dir < 0 ? -1 : 1))
  }
  return limit ? out.slice(skip, skip + limit) : out.slice(skip)
}

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
    async list(filter = {}, options) {
      const found = [...rows.values()].filter((row) => matchesFilter(row, filter))
      return options ? applyOptions(found, options) : found
    },
    async count(filter = {}) {
      return [...rows.values()].filter((row) => matchesFilter(row, filter)).length
    },
    // The portable query of shared/query.js (filters, sort, page).
    async search(query = {}, options = {}) {
      return searchRows([...rows.values()], query, options)
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
  let indexed = null
  // Indexes are created once per collection, on first use (PRD section 62):
  // every PRD query is scoped by tournament, and the hot lookups by parent.
  const collection = async () => {
    const c = (await getDb()).collection(name)
    if (!indexed) indexed = ensureIndexes(c, name).catch((err) => { indexed = null; throw err })
    await indexed
    return c
  }

  return {
    name,
    async list(filter = {}, options) {
      let cursor = (await collection()).find(filter, withoutInternalId)
      if (options?.sort) cursor = cursor.sort(options.sort)
      if (options?.skip) cursor = cursor.skip(options.skip)
      if (options?.limit) cursor = cursor.limit(options.limit)
      return cursor.toArray()
    },
    async count(filter = {}) {
      return (await collection()).countDocuments(filter)
    },
    // The same query run by the database: only the page travels, and an
    // index on the filter fields does the work (PRD section 62).
    async search(query = {}, { sort = null, skip = 0, limit = null } = {}) {
      const col = await collection()
      const filter = toMongo(query)
      // Case-insensitive, number-aware ordering, matching the memory stores.
      let cursor = col.find(filter, withoutInternalId).collation({ locale: 'en', strength: 2, numericOrdering: true })
      if (sort) cursor = cursor.sort({ ...sort, id: 1 })
      if (skip) cursor = cursor.skip(skip)
      if (limit) cursor = cursor.limit(limit)
      const [rows, total] = await Promise.all([cursor.toArray(), col.countDocuments(filter)])
      return { rows, total }
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

// The scoring app's own collections, then the PRD's tournament-management ones.
export const INDEXES = {
  tournaments: [[{ slug: 1 }, { sparse: true }]],
  categories: [[{ tournamentId: 1 }], [{ tournamentId: 1, divisionKey: 1 }]],
  competitors: [[{ categoryId: 1 }]],
  matches: [[{ categoryId: 1 }], [{ scheduledAt: 1, endsAt: 1 }, { sparse: true }]],
  ageGroups: [[{ tournamentId: 1 }]],
  weightCategories: [[{ tournamentId: 1, ageGroupId: 1 }]],
  teams: [[{ tournamentId: 1 }]],
  players: [[{ tournamentId: 1, teamId: 1 }], [{ tournamentId: 1, registrationStatus: 1 }], [{ tournamentId: 1, name: 1 }, { collation: { locale: 'en', strength: 2, numericOrdering: true } }], [{ tournamentId: 1, playerNumber: 1 }]],
  pools: [[{ tournamentId: 1, divisionKey: 1 }]],
  brackets: [[{ tournamentId: 1, divisionKey: 1 }]],
  medals: [[{ tournamentId: 1 }]],
  certificates: [[{ tournamentId: 1 }], [{ certificateId: 1 }, { unique: true, sparse: true }]],
  registrationLinks: [[{ token: 1 }], [{ tournamentId: 1 }]],
  notifications: [[{ tournamentId: 1, audience: 1 }]],
  auditLog: [[{ tournamentId: 1, at: -1 }], [{ entity: 1, entityId: 1 }]],
  files: [[{ tournamentId: 1 }]],
  kataRounds: [[{ tournamentId: 1, divisionKey: 1 }]],
  kataScores: [[{ roundId: 1, playerId: 1, seat: 1 }], [{ roundId: 1, submissionId: 1 }, { sparse: true }]],
  medalOverrides: [[{ tournamentId: 1, divisionKey: 1 }]],
  matchEvents: [[{ tournamentId: 1, matchId: 1, seq: 1 }]],
  organizations: [[{ slug: 1 }, { unique: true, sparse: true }]],
  rulesets: [[{ family: 1, version: 1 }]],
  divisionResults: [[{ tournamentId: 1, divisionKey: 1 }]],
  apiKeys: [[{ tournamentId: 1 }]],
  passes: [[{ tournamentId: 1, code: 1 }], [{ tournamentId: 1, refKey: 1 }]],
}

export async function ensureIndexes(collection, name) {
  await collection.createIndex({ id: 1 }, { unique: true })
  for (const [keys, options = {}] of INDEXES[name] || []) await collection.createIndex(keys, options)
}

export const COLLECTIONS = ['tournaments', 'categories', 'competitors', 'matches', 'display', 'apiKeys', ...TMS_COLLECTIONS]

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
