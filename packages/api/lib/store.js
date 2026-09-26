import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// One document store, two backends, chosen the same way the user store already
// chooses: MONGODB_URI present means Mongo, absent means memory. Routes are
// handed a collection and never learn which one they got.

const nowIso = () => new Date().toISOString()

const matchesFilter = (row, filter) =>
  Object.entries(filter).every(([field, value]) => row[field] === value)

function memoryCollection(name) {
  const rows = new Map()

  return {
    name,
    async list(filter = {}) {
      return [...rows.values()].filter((row) => matchesFilter(row, filter))
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
  const collection = async () => (await getDb()).collection(name)

  return {
    name,
    async list(filter = {}) {
      return (await collection()).find(filter, withoutInternalId).toArray()
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
