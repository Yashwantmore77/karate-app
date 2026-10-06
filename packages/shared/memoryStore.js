// The store contract over a Map. Used by the tests here and by any caller that
// needs a throwaway store; the API keeps its own (with Mongo beside it).

const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v)
let counter = 0

export function memoryCollection() {
  const rows = new Map()
  return {
    async list(filter = {}) { return [...rows.values()].filter((r) => matches(r, filter)).map((r) => ({ ...r })) },
    async get(id) { const r = rows.get(id); return r ? { ...r } : null },
    async insert(doc) {
      counter += 1
      const row = { ...doc, id: doc.id ?? `id${counter}`, createdAt: new Date().toISOString() }
      rows.set(row.id, row)
      return { ...row }
    },
    async update(id, patch) {
      const cur = rows.get(id)
      if (!cur) return null
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
      rows.set(id, next)
      return { ...next }
    },
    async remove(id) { return rows.delete(id) },
    async removeWhere(filter) {
      let n = 0
      for (const [id, r] of rows) if (matches(r, filter)) { rows.delete(id); n += 1 }
      return n
    },
  }
}

export const memoryStores = (names) => Object.fromEntries(names.map((n) => [n, memoryCollection()]))
