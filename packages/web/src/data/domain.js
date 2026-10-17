import { httpGet, httpPost, httpPatch, httpDelete } from './http'

/**
 * A missing row reads as null.
 *
 * A 404 on a single-document read is an answer ("there is no such category"),
 * not a failure, and every call site already handles an absent row.
 */
const orNull = async (promise) => {
  try {
    return await promise
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

// The competition data over REST. A row that the server addresses by its own
// id is asked for by that id alone; only a listing needs its parent.

// Page and search arrive as query parameters; the server answers with the rows
// plus how many there are in total, which is what a pager needs to draw itself.
const pageQuery = ({ page = 1, limit = 25, q = '' } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (q) params.set('q', q)
  return `?${params}`
}

// The server caps a page at 100 rows, and nothing stops a collection growing
// past that. Asking for one big page used to drop the rest without a word.
const MAX_PAGE = 100
// A ceiling on the walk, so a server that misreports its total cannot keep
// this looping. 500 pages of 100 is far past any one tournament.
const MAX_PAGES = 500

/**
 * Every row of a listing, read page by page.
 *
 * For callers that need the whole set rather than a screenful: standings,
 * exports, rosters behind a picker. A table should use page() instead.
 */
const everyRow = async (path, key) => {
  const rows = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await httpGet(`${path}${pageQuery({ page, limit: MAX_PAGE })}`)
    const batch = payload[key] || []
    rows.push(...batch)
    // Stop on a short or empty page as well as on the total: either means
    // there is nothing further to read.
    if (batch.length < MAX_PAGE || rows.length >= (payload.total ?? 0)) break
  }
  return rows
}

const pageOf = (payload, key) => ({
  rows: payload[key],
  total: payload.total,
  pages: payload.pages,
  page: payload.page,
})

export const tournaments = {
  async list() {
    // Everything, for callers that walk the tree rather than show a table.
    return everyRow('/tournaments', 'tournaments')
  },
  async page(options) {
    return pageOf(await httpGet(`/tournaments${pageQuery(options)}`), 'tournaments')
  },
  async get(id) {
    const res = await orNull(httpGet(`/tournaments/${id}`))
    return res && res.tournament
  },
  async create(doc) {
    return (await httpPost('/tournaments', doc)).tournament
  },
  async update(id, patch) {
    return (await httpPatch(`/tournaments/${id}`, patch)).tournament
  },
  async remove(id) {
    // The server cascades to categories, competitors and matches.
    await httpDelete(`/tournaments/${id}`)
  },
}

export const categories = {
  async page(tournamentId, options) {
    return pageOf(await httpGet(`/tournaments/${tournamentId}/categories${pageQuery(options)}`), 'categories')
  },
  async find(id) {
    const res = await orNull(httpGet(`/categories/${id}`))
    return res && res.category
  },
}

export const competitors = {
  async list(categoryId) {
    return everyRow(`/categories/${categoryId}/competitors`, 'competitors')
  },
  async page(categoryId, options) {
    return pageOf(await httpGet(`/categories/${categoryId}/competitors${pageQuery(options)}`), 'competitors')
  },
  async create(categoryId, doc) {
    return (await httpPost(`/categories/${categoryId}/competitors`, doc)).competitor
  },
  async update(id, patch) {
    return (await httpPatch(`/competitors/${id}`, patch)).competitor
  },
  async remove(id) {
    await httpDelete(`/competitors/${id}`)
  },
}

export const matches = {
  async list(categoryId) {
    return everyRow(`/categories/${categoryId}/matches`, 'matches')
  },
  async page(categoryId, options) {
    return pageOf(await httpGet(`/categories/${categoryId}/matches${pageQuery(options)}`), 'matches')
  },
  async find(id) {
    const res = await orNull(httpGet(`/matches/${id}`))
    return res && res.match
  },
  /**
   * Draws a round robin for the category: a bout for every pair of entrants
   * that does not have one yet. Resolves { created, skipped, total }.
   */
  async draw(categoryId) {
    return httpPost(`/categories/${categoryId}/matches/draw`, {})
  },
  /**
   * Matches across the whole event, filtered and paged by the server.
   *
   * `mine` asks for the caller's own assignments; it is a flag rather than an
   * id, so there is no way to ask after somebody else's.
   */
  async feed({ status, mine, categoryId, ...options } = {}) {
    const params = new URLSearchParams(pageQuery(options).slice(1))
    if (status) params.set('status', status)
    if (mine) params.set('mine', 'true')
    if (categoryId) params.set('categoryId', categoryId)
    return pageOf(await httpGet(`/matches?${params}`), 'matches')
  },
  async create(categoryId, doc) {
    return (await httpPost(`/categories/${categoryId}/matches`, doc)).match
  },
  async update(id, patch) {
    return (await httpPatch(`/matches/${id}`, patch)).match
  },
  async remove(id, reason = null) {
    await httpDelete(`/matches/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`)
  },
}
