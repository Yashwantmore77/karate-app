/**
 * An in-memory stand-in for data/domain, for page tests.
 *
 * Same methods and signatures as data/domain/api.js, so a page under test
 * cannot tell the difference. It is deliberately not a second server: it keeps
 * rows and pages them, and does none of the API's validation. A test that is
 * about what the server refuses should make the call reject with an HttpError
 * instead of expecting this to know.
 *
 *   vi.mock('../../data/domain', () => import('../../test/fakeDomain'))
 *   import * as fake from '../../test/fakeDomain'
 *
 *   beforeEach(() => fake.reset())
 *   fake.seed({ tournaments: [...], categories: [...], ... })
 *   expect(fake.rows('matches')).toHaveLength(1)
 */

const COLLECTIONS = ['tournaments', 'categories', 'competitors', 'matches']

let db
let seq
let currentUser

/** Empties every collection. Call in beforeEach. */
export function reset() {
  db = Object.fromEntries(COLLECTIONS.map((name) => [name, []]))
  seq = 0
  currentUser = null
}
reset()

const clone = (row) => (row ? structuredClone(row) : row)
const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, seq)).toISOString()

/** Puts rows in place as given, ids and all. */
export function seed(data = {}) {
  for (const name of COLLECTIONS) {
    for (const row of data[name] || []) {
      seq += 1
      db[name].push({ createdAt: stamp(), ...structuredClone(row) })
    }
  }
}

/** A copy of what a collection holds now, for assertions. */
export const rows = (name) => db[name].map(clone)

/** Who `feed({ mine: true })` answers for — the server reads it off the token. */
export const setCurrentUser = (uid) => { currentUser = uid }

// --- shared plumbing --------------------------------------------------------

const insert = (name, doc) => {
  seq += 1
  const row = { ...structuredClone(doc), id: doc.id ?? `${name}-${seq}`, createdAt: stamp() }
  db[name].push(row)
  return clone(row)
}

const patch = (name, id, changes) => {
  const row = db[name].find((r) => r.id === id)
  if (!row) return null
  Object.assign(row, structuredClone(changes), { updatedAt: stamp() })
  return clone(row)
}

const drop = (name, keep) => { db[name] = db[name].filter(keep) }

const byId = (name, id) => clone(db[name].find((r) => r.id === id) ?? null)

/** One page, searched the way the server searches: a substring, any case. */
const pageOf = (all, { page = 1, limit = 25, q = '' } = {}, fields = []) => {
  const needle = q.trim().toLowerCase()
  const found = needle
    ? all.filter((row) => fields.some((f) => String(row[f] ?? '').toLowerCase().includes(needle)))
    : all
  const start = (page - 1) * limit
  return {
    rows: found.slice(start, start + limit).map(clone),
    total: found.length,
    pages: Math.max(1, Math.ceil(found.length / limit)),
    page,
  }
}

const removeCategory = (id) => {
  drop('competitors', (c) => c.categoryId !== id)
  drop('matches', (m) => m.categoryId !== id)
  drop('categories', (c) => c.id !== id)
}

// --- the domain -------------------------------------------------------------

export const tournaments = {
  async list() { return db.tournaments.map(clone) },
  async page(options) { return pageOf(db.tournaments, options, ['name', 'location']) },
  async get(id) { return byId('tournaments', id) },
  async create(doc) { return insert('tournaments', { status: 'draft', ...doc }) },
  async update(id, changes) { return patch('tournaments', id, changes) },
  async remove(id) {
    db.categories.filter((c) => c.tournamentId === id).forEach((c) => removeCategory(c.id))
    drop('tournaments', (t) => t.id !== id)
  },
}

export const categories = {
  async list(tournamentId) { return db.categories.filter((c) => c.tournamentId === tournamentId).map(clone) },
  async page(tournamentId, options) {
    return pageOf(db.categories.filter((c) => c.tournamentId === tournamentId), options, ['name', 'ageGroup', 'division'])
  },
  async get(_tournamentId, id) { return byId('categories', id) },
  async find(id) { return byId('categories', id) },
  async create(tournamentId, doc) { return insert('categories', { ...doc, tournamentId }) },
  async update(_tournamentId, id, changes) { return patch('categories', id, changes) },
  async remove(_tournamentId, id) { removeCategory(id) },
}

export const competitors = {
  async list(categoryId) { return db.competitors.filter((c) => c.categoryId === categoryId).map(clone) },
  async page(categoryId, options) {
    return pageOf(db.competitors.filter((c) => c.categoryId === categoryId), options, ['name', 'bib'])
  },
  async create(categoryId, doc) { return insert('competitors', { ...doc, categoryId }) },
  async update(_categoryId, id, changes) { return patch('competitors', id, changes) },
  async remove(_categoryId, id) { drop('competitors', (c) => c.id !== id) },
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export const matches = {
  async list(categoryId) { return db.matches.filter((m) => m.categoryId === categoryId).map(clone) },
  async page(categoryId, options) {
    return pageOf(db.matches.filter((m) => m.categoryId === categoryId), options, ['status', 'winner'])
  },
  async get(_categoryId, id) { return byId('matches', id) },
  async find(id) { return byId('matches', id) },
  async create(categoryId, doc) { return insert('matches', { status: 'open', ...doc, categoryId }) },
  async update(_categoryId, id, changes) { return patch('matches', id, changes) },
  async remove(_categoryId, id) { drop('matches', (m) => m.id !== id) },

  /** Every missing pair, in entry order. The ordering rules live on the server. */
  async draw(categoryId) {
    const entrants = db.competitors.filter((c) => c.categoryId === categoryId)
    const drawn = new Set(
      db.matches.filter((m) => m.categoryId === categoryId && m.redId && m.blueId)
        .map((m) => pairKey(m.redId, m.blueId))
    )
    let created = 0
    let total = 0
    for (let i = 0; i < entrants.length; i += 1) {
      for (let j = i + 1; j < entrants.length; j += 1) {
        total += 1
        if (drawn.has(pairKey(entrants[i].id, entrants[j].id))) continue
        insert('matches', { redId: entrants[i].id, blueId: entrants[j].id, status: 'open', categoryId })
        created += 1
      }
    }
    return { created, skipped: total - created, total }
  },

  async feed({ status, mine, categoryId, ...options } = {}) {
    const assignedToMe = (m) => {
      const panel = [m.refereeId, ...(m.judgeIds || [])].filter(Boolean)
      return panel.length === 0 || panel.includes(currentUser)
    }
    const found = db.matches
      .filter((m) => !status || m.status === status)
      .filter((m) => !categoryId || m.categoryId === categoryId)
      .filter((m) => !mine || assignedToMe(m))
      .map((m) => {
        const category = db.categories.find((c) => c.id === m.categoryId)
        const tournament = category && db.tournaments.find((t) => t.id === category.tournamentId)
        return {
          ...m,
          category: category?.name ?? null,
          tournament: tournament?.name ?? null,
          tournamentId: category?.tournamentId ?? null,
          tournamentDate: tournament?.date ?? null,
        }
      })
    return pageOf(found, options, ['status', 'winner'])
  },
}
