import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { roundRobinPairs, pairKey } from './lib/draw.js'

describe('roundRobinPairs', () => {
  const field = (n) => Array.from({ length: n }, (_, i) => `c${i}`)

  it.each([2, 3, 4, 7, 8, 9, 16, 32])('pairs everyone with everyone once, for %i entrants', (n) => {
    const pairs = roundRobinPairs(field(n))
    expect(pairs).toHaveLength((n * (n - 1)) / 2)
    expect(new Set(pairs.map(([a, b]) => pairKey(a, b))).size).toBe(pairs.length)
    expect(pairs.every(([a, b]) => a !== b)).toBe(true)
  })

  it('gives nobody back-to-back bouts within an even field', () => {
    // Each round of the circle method uses everyone once, so a mat working down
    // the list never calls the same person twice running.
    const pairs = roundRobinPairs(field(8))
    for (let i = 1; i < pairs.length; i += 1) {
      const before = new Set(pairs[i - 1])
      expect(pairs[i].some((id) => before.has(id))).toBe(false)
    }
  })

  it('evens out colours to within one', () => {
    // Odd fields are the hard case: alternating by round alone gave one of nine
    // entrants red six times out of eight.
    for (const n of [5, 8, 9, 16]) {
      const red = new Map(field(n).map((id) => [id, 0]))
      for (const [r] of roundRobinPairs(field(n))) red.set(r, red.get(r) + 1)
      const counts = [...red.values()]
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    }
  })

  it('draws nothing for a field of one or none', () => {
    expect(roundRobinPairs([])).toEqual([])
    expect(roundRobinPairs(['solo'])).toEqual([])
  })
})

let http, port, tokens, categoryId

const url = (path) => `http://localhost:${port}/api/v1${path}`

const call = async (method, path, { token, body } = {}) => {
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

const login = async (email) => (await call('POST', '/auth/login', {
  body: { email, password: 'test123' },
})).payload.token

const enter = async (n, from = 0) => {
  const ids = []
  for (let i = from; i < from + n; i += 1) {
    const { payload } = await call('POST', `/categories/${categoryId}/competitors`, {
      token: tokens.admin,
      body: { name: `Fighter ${i}`, bib: String(100 + i), age: 13 },
    })
    ids.push(payload.competitor.id)
  }
  return ids
}

const draw = (token = tokens.referee, body) =>
  call('POST', `/categories/${categoryId}/matches/draw`, { token, body })

const allMatches = async () =>
  (await call('GET', `/categories/${categoryId}/matches?limit=100`, { token: tokens.referee })).payload.matches

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  tokens = {
    admin: await login('admin@kata.local'),
    referee: await login('referee@kata.local'),
    judge: await login('judge1@kata.local'),
  }
  const { payload: t } = await call('POST', '/tournaments', {
    token: tokens.admin,
    body: { name: 'Draw Cup', location: 'Pune', date: '2026-05-15', template: 'kumite' },
  })
  const { payload: c } = await call('POST', `/tournaments/${t.tournament.id}/categories`, {
    token: tokens.admin,
    body: { name: 'U14 Boys', ageGroup: 'U14', gender: 'M', division: 'Beginner' },
  })
  categoryId = c.category.id
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

describe('POST /categories/:id/matches/draw', () => {
  it('creates a bout for every pair', async () => {
    await enter(6)
    const res = await draw()

    expect(res.status).toBe(201)
    expect(res.payload).toEqual({ created: 15, skipped: 0, total: 15 })

    const matches = await allMatches()
    expect(matches).toHaveLength(15)
    expect(new Set(matches.map((m) => pairKey(m.redId, m.blueId))).size).toBe(15)
  })

  it('leaves the new bouts open and unscheduled, so a draw cannot clash', async () => {
    await enter(4)
    await draw()
    for (const m of await allMatches()) {
      expect(m.status).toBe('open')
      expect(m.scheduledAt).toBeUndefined()
      expect(m.mat).toBeUndefined()
      expect(m.refereeId).toBeUndefined()
    }
  })

  it('lists the bouts in the order drawn, so a mat can work straight down them', async () => {
    // Inserted together, the rows would share a creation time and page in the
    // order of their random ids, losing the rest between bouts.
    await enter(8)
    await draw()
    const matches = await allMatches()
    for (let i = 1; i < 4; i += 1) {
      const before = new Set([matches[i - 1].redId, matches[i - 1].blueId])
      expect(before.has(matches[i].redId) || before.has(matches[i].blueId)).toBe(false)
    }
  })

  it('creates nothing the second time', async () => {
    await enter(5)
    await draw()
    const again = await draw()
    expect(again.payload).toEqual({ created: 0, skipped: 10, total: 10 })
    expect(await allMatches()).toHaveLength(10)
  })

  it('draws only the late entrant’s bouts after an earlier draw', async () => {
    await enter(4)
    await draw()
    await enter(1, 4)
    const res = await draw()
    // Five entrants is ten pairs; six were drawn already, so four are new.
    expect(res.payload).toEqual({ created: 4, skipped: 6, total: 10 })
  })

  it('skips a pair already made by hand, whichever colours it was given', async () => {
    const [a, b] = await enter(3)
    await call('POST', `/categories/${categoryId}/matches`, {
      token: tokens.referee,
      body: { redId: b, blueId: a },
    })
    const res = await draw()
    expect(res.payload).toEqual({ created: 2, skipped: 1, total: 3 })
  })

  it('refuses a category with fewer than two entrants', async () => {
    await enter(1)
    const res = await draw()
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('not_enough_competitors')
  })

  it('refuses a field too large for everyone to meet everyone', async () => {
    await enter(33)
    const res = await draw()
    expect(res.status).toBe(400)
    expect(res.payload).toMatchObject({
      error: 'too_many_for_round_robin',
      details: { max: 32, count: 33 },
    })
    expect(await allMatches()).toHaveLength(0)
  })

  it('refuses an option it does not understand', async () => {
    await enter(2)
    const res = await draw(tokens.referee, { rounds: 2 })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('unknown_field')
  })

  it('is open to an admin', async () => {
    await enter(2)
    expect((await draw(tokens.admin)).status).toBe(201)
  })

  it('is closed to a judge', async () => {
    await enter(2)
    expect((await draw(tokens.judge)).status).toBe(403)
    expect(await allMatches()).toHaveLength(0)
  })

  it('answers 404 for a category that does not exist', async () => {
    const res = await call('POST', '/categories/nope/matches/draw', { token: tokens.referee })
    expect(res.status).toBe(404)
  })
})
