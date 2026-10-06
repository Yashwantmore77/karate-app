import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'
import { TMS_COLLECTIONS } from '@kumite/shared/tms.js'

// One document store, two backends, chosen the same way the user store already
// chooses: MONGODB_URI present means Mongo, absent means memory. Routes are
// handed a collection and never learn which one they got.

const nowIso = () => new Date().toISOString()

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
    async get(id) {
      return rows.get(id) ?? null
    },
    async insert(doc) {
      const row = { ...doc, id: doc.id ?? randomUUID(), createdAt: nowIso() }
      rows.set(row.id, row)
      return row
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
    async get(id) {
      return (await collection()).findOne({ id }, withoutInternalId)
    },
    async insert(doc) {
      const row = { ...doc, id: doc.id ?? randomUUID(), createdAt: nowIso() }
      await (await collection()).insertOne({ ...row })
      return row
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
  matches: [[{ categoryId: 1 }]],
  ageGroups: [[{ tournamentId: 1 }]],
  weightCategories: [[{ tournamentId: 1, ageGroupId: 1 }]],
  teams: [[{ tournamentId: 1 }]],
  players: [[{ tournamentId: 1, teamId: 1 }], [{ tournamentId: 1, registrationStatus: 1 }]],
  pools: [[{ tournamentId: 1, divisionKey: 1 }]],
  brackets: [[{ tournamentId: 1, divisionKey: 1 }]],
  medals: [[{ tournamentId: 1 }]],
  certificates: [[{ tournamentId: 1 }], [{ certificateId: 1 }, { unique: true, sparse: true }]],
  registrationLinks: [[{ token: 1 }], [{ tournamentId: 1 }]],
  notifications: [[{ tournamentId: 1, audience: 1 }]],
  auditLog: [[{ tournamentId: 1, at: -1 }], [{ entity: 1, entityId: 1 }]],
  files: [[{ tournamentId: 1 }]],
}

export async function ensureIndexes(collection, name) {
  await collection.createIndex({ id: 1 }, { unique: true })
  for (const [keys, options = {}] of INDEXES[name] || []) await collection.createIndex(keys, options)
}

export const COLLECTIONS = ['tournaments', 'categories', 'competitors', 'matches', 'display', ...TMS_COLLECTIONS]

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
