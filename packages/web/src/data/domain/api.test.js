import { describe, it, expect, beforeEach, vi } from 'vitest'

// The suite otherwise runs with no server configured, which is what keeps every
// other test on local storage. This file is about the other half of the switch,
// so the session is stubbed into API mode.
vi.mock('../session', () => ({
  apiUrl: (path) => `http://api.test/api/v1${path}`,
  getToken: () => 'test-token',
  clearSession: vi.fn(),
  serverUrl: () => 'http://api.test',
}))

const { tournaments, categories, competitors, matches } = await import('./api')
const { HttpError } = await import('../http')

let calls

// Answers with the envelope the real API uses, so the assertions below are
// about how this layer unwraps it.
const respondWith = (payload, { status = 200 } = {}) => {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    }
  })
}

const lastCall = () => calls[calls.length - 1]

beforeEach(() => {
  calls = []
})

describe('api domain adapter', () => {
  it('sends the bearer token on every request', async () => {
    respondWith({ tournaments: [] })
    await tournaments.list()
    expect(lastCall().headers.authorization).toBe('Bearer test-token')
  })

  it('unwraps the collection envelope on a list', async () => {
    respondWith({ tournaments: [{ id: 't1', name: 'Spring Cup' }] })
    expect(await tournaments.list()).toEqual([{ id: 't1', name: 'Spring Cup' }])
    expect(lastCall().url).toBe('http://api.test/api/v1/tournaments?page=1&limit=100')
  })

  it('creates a tournament with POST and unwraps the single document', async () => {
    respondWith({ tournament: { id: 't1', name: 'Spring Cup' } })
    const created = await tournaments.create({ name: 'Spring Cup' })

    expect(created).toEqual({ id: 't1', name: 'Spring Cup' })
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/api/v1/tournaments',
      method: 'POST',
      body: { name: 'Spring Cup' },
    })
  })

  it('patches and deletes a tournament at its own address', async () => {
    respondWith({ tournament: { id: 't1', status: 'active' } })
    await tournaments.update('t1', { status: 'active' })
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/api/v1/tournaments/t1', method: 'PATCH', body: { status: 'active' },
    })

    respondWith(null, { status: 204 })
    await tournaments.remove('t1')
    expect(lastCall()).toMatchObject({ url: 'http://api.test/api/v1/tournaments/t1', method: 'DELETE' })
  })

  it('reads a missing document as null rather than throwing', async () => {
    // A 404 on a single read is an answer, and every call site handles an
    // absent row already.
    respondWith({ error: 'not_found' }, { status: 404 })
    expect(await tournaments.get('nope')).toBeNull()
    expect(await categories.find('nope')).toBeNull()
    expect(await matches.find('nope')).toBeNull()
  })

  it('still raises anything that is not a 404', async () => {
    respondWith({ error: 'forbidden' }, { status: 403 })
    await expect(tournaments.get('t1')).rejects.toBeInstanceOf(HttpError)
  })

  it('carries the server error code through for callers to branch on', async () => {
    respondWith({ error: 'invalid_name' }, { status: 400 })
    await expect(tournaments.create({ name: 'ab' })).rejects.toMatchObject({
      status: 400, code: 'invalid_name',
    })
  })

  it('nests categories under their tournament for listing and creating', async () => {
    respondWith({ categories: [] })
    await categories.list('t1')
    expect(lastCall().url).toBe('http://api.test/api/v1/tournaments/t1/categories?page=1&limit=100')

    respondWith({ category: { id: 'c1' } })
    await categories.create('t1', { name: 'U14 Boys' })
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/api/v1/tournaments/t1/categories', method: 'POST',
    })
  })

  it('addresses a category directly by id, ignoring the parent the local keys need', async () => {
    respondWith({ category: { id: 'c1', name: 'U14 Boys' } })
    expect(await categories.get('t1', 'c1')).toMatchObject({ name: 'U14 Boys' })
    expect(lastCall().url).toBe('http://api.test/api/v1/categories/c1')

    respondWith(null, { status: 204 })
    await categories.remove('t1', 'c1')
    expect(lastCall()).toMatchObject({ url: 'http://api.test/api/v1/categories/c1', method: 'DELETE' })
  })

  it('nests competitors under their category', async () => {
    respondWith({ competitors: [] })
    await competitors.list('c1')
    expect(lastCall().url).toBe('http://api.test/api/v1/categories/c1/competitors?page=1&limit=100')

    respondWith({ competitor: { id: 'p1' } })
    await competitors.create('c1', { name: 'Aiden Parker', bib: '101', age: 13 })
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/api/v1/categories/c1/competitors',
      method: 'POST',
      body: { name: 'Aiden Parker', bib: '101', age: 13 },
    })
  })

  it('nests matches under their category and patches them by id', async () => {
    respondWith({ matches: [] })
    await matches.list('c1')
    expect(lastCall().url).toBe('http://api.test/api/v1/categories/c1/matches?page=1&limit=100')

    respondWith({ match: { id: 'm1', winner: 'aka' } })
    await matches.update('c1', 'm1', { winner: 'aka' })
    expect(lastCall()).toMatchObject({
      url: 'http://api.test/api/v1/matches/m1', method: 'PATCH', body: { winner: 'aka' },
    })
  })

  it('asks for a page and hands back the counts a pager needs', async () => {
    respondWith({ tournaments: [{ id: 't1' }], page: 2, limit: 10, total: 31, pages: 4 })
    const result = await tournaments.page({ page: 2, limit: 10 })

    expect(lastCall().url).toBe('http://api.test/api/v1/tournaments?page=2&limit=10')
    expect(result).toEqual({ rows: [{ id: 't1' }], total: 31, pages: 4, page: 2 })
  })

  it('passes a search term through, and omits it when empty', async () => {
    respondWith({ tournaments: [], page: 1, limit: 25, total: 0, pages: 1 })
    await tournaments.page({ q: 'spring cup' })
    expect(lastCall().url).toContain('q=spring+cup')

    await tournaments.page({ q: '' })
    expect(lastCall().url).not.toContain('q=')
  })

  it('pages the nested collections under their parent', async () => {
    respondWith({ competitors: [], page: 1, limit: 25, total: 0, pages: 1 })
    await competitors.page('c1', { page: 3, q: 'aarav' })
    expect(lastCall().url).toBe('http://api.test/api/v1/categories/c1/competitors?page=3&limit=25&q=aarav')

    respondWith({ categories: [], page: 1, limit: 25, total: 0, pages: 1 })
    await categories.page('t1', {})
    expect(lastCall().url).toBe('http://api.test/api/v1/tournaments/t1/categories?page=1&limit=25')
  })

  it('sends no content-type on a request with no body', async () => {
    respondWith({ tournaments: [] })
    await tournaments.list()
    expect(lastCall().headers['content-type']).toBeUndefined()
  })
})

describe('reading a whole collection', () => {
  // Serves `total` rows in pages of whatever size was asked for, the way the
  // server does, and records each page requested.
  const serveRows = (key, total) => {
    globalThis.fetch = vi.fn(async (url) => {
      calls.push({ url, method: 'GET' })
      const params = new URL(url).searchParams
      const page = Number(params.get('page'))
      const limit = Number(params.get('limit'))
      const start = (page - 1) * limit
      const rows = Array.from(
        { length: Math.max(0, Math.min(limit, total - start)) },
        (_, i) => ({ id: `r${start + i}` })
      )
      return { ok: true, status: 200, json: async () => ({ [key]: rows, total, page, pages: Math.ceil(total / limit) }) }
    })
  }

  it('keeps reading past the first hundred rows', async () => {
    // A round robin of sixteen is 120 bouts. A single page of 100 used to drop
    // the last twenty without saying so, and the standings with them.
    serveRows('matches', 250)
    const rows = await matches.list('c1')
    expect(rows).toHaveLength(250)
    expect(new Set(rows.map((r) => r.id)).size).toBe(250)
    expect(calls).toHaveLength(3)
  })

  it('stops after one request when everything fits on a page', async () => {
    serveRows('competitors', 12)
    expect(await competitors.list('c1')).toHaveLength(12)
    expect(calls).toHaveLength(1)
  })

  it('stops on an empty collection', async () => {
    serveRows('tournaments', 0)
    expect(await tournaments.list()).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('does not loop forever on a server that overstates its total', async () => {
    // Every page comes back full while the total claims more, so only the
    // ceiling on pages can end the walk.
    globalThis.fetch = vi.fn(async (url) => {
      calls.push({ url })
      const rows = Array.from({ length: 100 }, (_, i) => ({ id: `x${calls.length}-${i}` }))
      return { ok: true, status: 200, json: async () => ({ matches: rows, total: Number.MAX_SAFE_INTEGER }) }
    })
    await matches.list('c1')
    expect(calls.length).toBeLessThanOrEqual(500)
  })
})
