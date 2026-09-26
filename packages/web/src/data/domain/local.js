// The offline implementation, on the keys this app has always used:
// `tournaments`, `categories-<tournamentId>`, `competitors-<categoryId>`,
// `matches-<categoryId>`. Those key names are the storage format of every
// installation already out there, so they are kept exactly as they were rather
// than migrated to something tidier.

const read = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    // A corrupted value reads as empty rather than taking the screen down.
    return []
  }
}

const write = (key, rows) => localStorage.setItem(key, JSON.stringify(rows))
const drop = (key) => localStorage.removeItem(key)

const TOURNAMENTS = 'tournaments'
const categoriesKey = (tournamentId) => `categories-${tournamentId}`
const competitorsKey = (categoryId) => `competitors-${categoryId}`
const matchesKey = (categoryId) => `matches-${categoryId}`

// Ids are generated here rather than by a store, and keep the human-readable
// prefixes the existing data uses.
const newId = (prefix) => `${prefix}-${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const insertInto = (key, doc, prefix) => {
  const row = { ...doc, id: doc.id || newId(prefix), createdAt: doc.createdAt || new Date().toISOString() }
  write(key, [...read(key), row])
  return row
}

const patchIn = (key, id, patch) => {
  const rows = read(key)
  const next = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
  write(key, next)
  return next.find((row) => row.id === id) || null
}

const removeFrom = (key, id) => write(key, read(key).filter((row) => row.id !== id))

export const tournaments = {
  async list() {
    return read(TOURNAMENTS)
  },
  async get(id) {
    return read(TOURNAMENTS).find((row) => row.id === id) || null
  },
  async create(doc) {
    return insertInto(TOURNAMENTS, { status: 'draft', ...doc }, 'tournament')
  },
  async update(id, patch) {
    return patchIn(TOURNAMENTS, id, patch)
  },
  async remove(id) {
    // Cascade, so deleting a tournament does not leave categories and their
    // competitors behind under keys nothing will ever read again.
    for (const category of read(categoriesKey(id))) {
      drop(competitorsKey(category.id))
      drop(matchesKey(category.id))
    }
    drop(categoriesKey(id))
    removeFrom(TOURNAMENTS, id)
  },
}

export const categories = {
  async list(tournamentId) {
    return read(categoriesKey(tournamentId))
  },
  async get(tournamentId, id) {
    return read(categoriesKey(tournamentId)).find((row) => row.id === id) || null
  },
  /**
   * Finds a category when only its own id is known.
   *
   * Screens reached straight from a match link have a category id and nothing
   * else, and the local keys are grouped by tournament, so there is no way to
   * reach one without walking them. The API implementation addresses it
   * directly; this is the cost of the key layout, kept behind the interface.
   */
  async find(id) {
    for (const tournament of read(TOURNAMENTS)) {
      const hit = read(categoriesKey(tournament.id)).find((row) => row.id === id)
      if (hit) return hit
    }
    return null
  },
  async create(tournamentId, doc) {
    return insertInto(categoriesKey(tournamentId), { ...doc, tournamentId }, 'cat')
  },
  async update(tournamentId, id, patch) {
    return patchIn(categoriesKey(tournamentId), id, patch)
  },
  async remove(tournamentId, id) {
    drop(competitorsKey(id))
    drop(matchesKey(id))
    removeFrom(categoriesKey(tournamentId), id)
  },
}

export const competitors = {
  async list(categoryId) {
    return read(competitorsKey(categoryId))
  },
  async create(categoryId, doc) {
    return insertInto(competitorsKey(categoryId), { ...doc, categoryId }, 'comp')
  },
  async update(categoryId, id, patch) {
    return patchIn(competitorsKey(categoryId), id, patch)
  },
  async remove(categoryId, id) {
    removeFrom(competitorsKey(categoryId), id)
  },
}

export const matches = {
  async list(categoryId) {
    return read(matchesKey(categoryId))
  },
  async get(categoryId, id) {
    return read(matchesKey(categoryId)).find((row) => row.id === id) || null
  },
  /**
   * Finds a match from its id alone, which is all a link into a live bout
   * carries. Walks the tree because the keys are grouped by category; the API
   * implementation asks for it directly.
   */
  async find(id) {
    for (const tournament of read(TOURNAMENTS)) {
      for (const category of read(categoriesKey(tournament.id))) {
        const hit = read(matchesKey(category.id)).find((row) => row.id === id)
        if (hit) return { ...hit, categoryId: hit.categoryId || category.id }
      }
    }
    return null
  },
  async create(categoryId, doc) {
    return insertInto(matchesKey(categoryId), { ...doc, categoryId }, 'match')
  },
  async update(categoryId, id, patch) {
    return patchIn(matchesKey(categoryId), id, patch)
  },
  async remove(categoryId, id) {
    removeFrom(matchesKey(categoryId), id)
  },
}
