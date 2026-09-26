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

export const tournaments = {
  async list() {
    return (await httpGet('/tournaments')).tournaments
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
    return (await httpGet(`/tournaments/${tournamentId}/categories`)).categories
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
    return (await httpGet(`/categories/${categoryId}/competitors`)).competitors
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
    return (await httpGet(`/categories/${categoryId}/matches`)).matches
  },
  async get(_categoryId, id) {
    const res = await orNull(httpGet(`/matches/${id}`))
    return res && res.match
  },
  async find(id) {
    const res = await orNull(httpGet(`/matches/${id}`))
    return res && res.match
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
