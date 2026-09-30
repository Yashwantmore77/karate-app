import { httpGet, httpPost, httpPatch, httpDelete } from '../http'

/**
 * A missing row reads as null, matching the local implementation.
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

// The same surface as the local implementation, over REST. Parent ids that the
// local keys need (a category's tournament, a competitor's category) are taken
// and ignored where the server addresses the row directly by id — keeping one
// signature means no call site has to know which implementation it is talking to.

// Page and search arrive as query parameters; the server answers with the rows
// plus how many there are in total, which is what a pager needs to draw itself.
const pageQuery = ({ page = 1, limit = 25, q = '' } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (q) params.set('q', q)
  return `?${params}`
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
    return (await httpGet(`/tournaments${pageQuery({ limit: 100 })}`)).tournaments
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
  async list(tournamentId) {
    return (await httpGet(`/tournaments/${tournamentId}/categories${pageQuery({ limit: 100 })}`)).categories
  },
  async page(tournamentId, options) {
    return pageOf(await httpGet(`/tournaments/${tournamentId}/categories${pageQuery(options)}`), 'categories')
  },
  async get(_tournamentId, id) {
    const res = await orNull(httpGet(`/categories/${id}`))
    return res && res.category
  },
  async find(id) {
    const res = await orNull(httpGet(`/categories/${id}`))
    return res && res.category
  },
  async create(tournamentId, doc) {
    return (await httpPost(`/tournaments/${tournamentId}/categories`, doc)).category
  },
  async update(_tournamentId, id, patch) {
    return (await httpPatch(`/categories/${id}`, patch)).category
  },
  async remove(_tournamentId, id) {
    await httpDelete(`/categories/${id}`)
  },
}

export const competitors = {
  async list(categoryId) {
    return (await httpGet(`/categories/${categoryId}/competitors${pageQuery({ limit: 100 })}`)).competitors
  },
  async page(categoryId, options) {
    return pageOf(await httpGet(`/categories/${categoryId}/competitors${pageQuery(options)}`), 'competitors')
  },
  async create(categoryId, doc) {
    return (await httpPost(`/categories/${categoryId}/competitors`, doc)).competitor
  },
  async update(_categoryId, id, patch) {
    return (await httpPatch(`/competitors/${id}`, patch)).competitor
  },
  async remove(_categoryId, id) {
    await httpDelete(`/competitors/${id}`)
  },
}

export const matches = {
  async list(categoryId) {
    return (await httpGet(`/categories/${categoryId}/matches${pageQuery({ limit: 100 })}`)).matches
  },
  async page(categoryId, options) {
    return pageOf(await httpGet(`/categories/${categoryId}/matches${pageQuery(options)}`), 'matches')
  },
  async get(_categoryId, id) {
    const res = await orNull(httpGet(`/matches/${id}`))
    return res && res.match
  },
  async find(id) {
    const res = await orNull(httpGet(`/matches/${id}`))
    return res && res.match
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
  async update(_categoryId, id, patch) {
    return (await httpPatch(`/matches/${id}`, patch)).match
  },
  async remove(_categoryId, id) {
    await httpDelete(`/matches/${id}`)
  },
}
