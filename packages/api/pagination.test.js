import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port, admin, ids

const url = (path) => `http://localhost:${port}/api/v1${path}`

const call = async (method, path, { token = admin, body } = {}) => {
  const res = await fetch(url(path), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, payload: res.status === 204 ? null : await res.json().catch(() => null) }
}

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  admin = (await call('POST', '/auth/login', {
    token: null, body: { email: 'admin@kata.local', password: 'test123' },
  })).payload.token

  // Thirty tournaments, so paging has something to page through.
  for (let i = 1; i <= 30; i += 1) {
    await call('POST', '/tournaments', {
      body: {
        name: `Cup number ${String(i).padStart(2, '0')}`,
        location: i % 2 ? 'Pune' : 'Mumbai',
        date: '2026-05-15',
        template: 'kumite',
      },
    })
  }

  const { payload: t } = await call('POST', '/tournaments', {
    body: { name: 'Roster Cup', location: 'Nashik', date: '2026-05-15', template: 'kumite' },
  })
  const { payload: c } = await call('POST', `/tournaments/${t.tournament.id}/categories`, {
    body: { name: 'U14 Boys', ageGroup: 'U14', gender: 'M', division: 'Beginner' },
  })
  ids = { tournamentId: t.tournament.id, categoryId: c.category.id }

  for (const [name, bib] of [['Aarav Deshmukh', '101'], ['Rohan Kulkarni', '102'], ['Vivaan Sharma', '103']]) {
    await call('POST', `/categories/${ids.categoryId}/competitors`, { body: { name, bib, age: 13 } })
  }
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

describe('pagination', () => {
  it('returns a first page with the count of everything behind it', async () => {
    const { payload } = await call('GET', '/tournaments')
    expect(payload.tournaments).toHaveLength(25)
    expect(payload).toMatchObject({ page: 1, limit: 25, total: 31, pages: 2 })
  })

  it('honours an explicit page and limit', async () => {
    const { payload } = await call('GET', '/tournaments?page=2&limit=10')
    expect(payload.tournaments).toHaveLength(10)
    expect(payload).toMatchObject({ page: 2, limit: 10, total: 31, pages: 4 })
  })

  it('does not repeat a row between pages', async () => {
    const first = (await call('GET', '/tournaments?page=1&limit=10')).payload.tournaments
    const second = (await call('GET', '/tournaments?page=2&limit=10')).payload.tournaments
    const overlap = first.filter((a) => second.some((b) => b.id === a.id))
    expect(overlap).toEqual([])
  })

  it('returns an empty page past the end rather than failing', async () => {
    const { status, payload } = await call('GET', '/tournaments?page=99')
    expect(status).toBe(200)
    expect(payload.tournaments).toEqual([])
    expect(payload.total).toBe(31)
  })

  it('caps an over-large limit instead of refusing it', async () => {
    const { payload } = await call('GET', '/tournaments?limit=5000')
    expect(payload.limit).toBe(100)
  })

  it('rejects a page or limit that is not a number', async () => {
    expect((await call('GET', '/tournaments?page=abc')).payload.error).toBe('invalid_page')
    expect((await call('GET', '/tournaments?limit=-3')).payload.error).toBe('invalid_limit')
    expect((await call('GET', '/tournaments?page=0')).payload.error).toBe('invalid_page')
  })

  it('reports at least one page even when there is nothing', async () => {
    const { payload } = await call('GET', '/tournaments?q=nothingmatchesthis')
    expect(payload).toMatchObject({ total: 0, pages: 1 })
    expect(payload.tournaments).toEqual([])
  })
})

describe('search', () => {
  it('matches part of a name, ignoring case', async () => {
    const { payload } = await call('GET', '/tournaments?q=roster')
    expect(payload.total).toBe(1)
    expect(payload.tournaments[0].name).toBe('Roster Cup')
  })

  it('searches the other listed fields too', async () => {
    const { payload } = await call('GET', '/tournaments?q=mumbai')
    expect(payload.total).toBe(15)
    expect(payload.tournaments.every((t) => t.location === 'Mumbai')).toBe(true)
  })

  it('counts the whole result, not just the page returned', async () => {
    const { payload } = await call('GET', '/tournaments?q=cup+number&limit=5')
    expect(payload.tournaments).toHaveLength(5)
    expect(payload.total).toBe(30)
  })

  it('treats a regex as literal text rather than a pattern', async () => {
    // A search term compiled as a regex would be a denial of service that
    // needs no credentials, so the term must never reach the engine as one.
    const { status, payload } = await call('GET', `/tournaments?q=${encodeURIComponent('(a+)+b')}`)
    expect(status).toBe(200)
    expect(payload.total).toBe(0)
  })

  it('finds a competitor by name or bib', async () => {
    const byName = await call('GET', `/categories/${ids.categoryId}/competitors?q=rohan`)
    expect(byName.payload.total).toBe(1)

    const byBib = await call('GET', `/categories/${ids.categoryId}/competitors?q=103`)
    expect(byBib.payload.total).toBe(1)
    expect(byBib.payload.competitors[0].name).toBe('Vivaan Sharma')
  })

  it('searches categories by name, age group and division', async () => {
    const { payload } = await call('GET', `/tournaments/${ids.tournamentId}/categories?q=u14`)
    expect(payload.total).toBe(1)
    expect(payload).toHaveProperty('pages')
  })

  it('keeps a search inside its parent', async () => {
    // "Aarav" exists under this category; another category must not see him.
    const { payload: other } = await call('POST', `/tournaments/${ids.tournamentId}/categories`, {
      body: { name: 'U16 Girls', ageGroup: 'U16', gender: 'F', division: 'Open' },
    })
    const res = await call('GET', `/categories/${other.category.id}/competitors?q=aarav`)
    expect(res.payload.total).toBe(0)
  })

  it('pages and searches the account roster', async () => {
    const all = await call('GET', '/users')
    expect(all.payload.users.length).toBeGreaterThanOrEqual(6)
    expect(all.payload).toHaveProperty('total')

    const judges = await call('GET', '/users?q=judge')
    expect(judges.payload.total).toBe(4)
    expect(judges.payload.users.every((u) => u.role === 'judge')).toBe(true)

    const firstPage = await call('GET', '/users?limit=2')
    expect(firstPage.payload.users).toHaveLength(2)
  })

  it('never leaks a password hash through the roster', async () => {
    const { payload } = await call('GET', '/users?q=admin')
    expect(JSON.stringify(payload)).not.toMatch(/passwordHash/)
  })
})
