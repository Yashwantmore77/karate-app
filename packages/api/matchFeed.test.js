import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port, tokens, ids

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
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

const JUDGE_1 = 'judge1-uid'
const JUDGE_2 = 'judge2-uid'
const REFEREE = 'ref-uid-001'

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  tokens = {
    admin: await login('admin@kata.local'),
    referee: await login('referee@kata.local'),
    judge1: await login('judge1@kata.local'),
    judge2: await login('judge2@kata.local'),
  }

  const { payload: t } = await call('POST', '/tournaments', {
    token: tokens.admin,
    body: { name: 'Feed Cup', location: 'Pune', date: '2026-05-15', template: 'kumite' },
  })
  const { payload: c } = await call('POST', `/tournaments/${t.tournament.id}/categories`, {
    token: tokens.admin,
    body: { name: 'U14 Boys', ageGroup: 'U14', gender: 'M', division: 'Beginner' },
  })
  const enter = async (name, bib) => (await call('POST', `/categories/${c.category.id}/competitors`, {
    token: tokens.admin, body: { name, bib, age: 13 },
  })).payload.competitor.id

  ids = {
    tournamentId: t.tournament.id,
    categoryId: c.category.id,
    a: await enter('Aarav Deshmukh', '101'),
    b: await enter('Rohan Kulkarni', '102'),
  }

  const bout = (body) => call('POST', `/categories/${ids.categoryId}/matches`, { token: tokens.referee, body })

  // One for judge 1, one for judge 2, one nobody is on, one already finished.
  await bout({ redId: ids.a, blueId: ids.b, status: 'open', refereeId: REFEREE, judgeIds: [JUDGE_1] })
  await bout({ status: 'open', refereeId: REFEREE, judgeIds: [JUDGE_2] })
  await bout({ status: 'open' })
  await bout({ status: 'completed', judgeIds: [JUDGE_1] })
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

describe('GET /matches across the event', () => {
  it('returns every match with page counts', async () => {
    const { payload } = await call('GET', '/matches', { token: tokens.referee })
    expect(payload.matches).toHaveLength(4)
    expect(payload).toMatchObject({ page: 1, total: 4, pages: 1 })
  })

  it('filters by status on the server', async () => {
    const { payload } = await call('GET', '/matches?status=open', { token: tokens.referee })
    expect(payload.total).toBe(3)
    expect(payload.matches.every((m) => m.status === 'open')).toBe(true)
  })

  it('refuses a status that is not one', async () => {
    const res = await call('GET', '/matches?status=finished', { token: tokens.referee })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_status')
  })

  it('resolves the category and tournament names for the page', async () => {
    // A judge's screen shows which bout is where, and those names live on
    // other collections.
    const { payload } = await call('GET', '/matches?status=open', { token: tokens.judge1 })
    expect(payload.matches[0]).toMatchObject({
      category: 'U14 Boys',
      tournament: 'Feed Cup',
      tournamentId: ids.tournamentId,
    })
    expect(payload.matches[0].tournamentDate).toBe('2026-05-15')
  })

  it('narrows to the caller\'s own bouts with mine=true', async () => {
    const { payload } = await call('GET', '/matches?status=open&mine=true', { token: tokens.judge1 })
    // Their own panel, plus the bout nobody has been put on.
    expect(payload.total).toBe(2)
    const panels = payload.matches.map((m) => m.judgeIds || [])
    expect(panels.some((p) => p.includes(JUDGE_1))).toBe(true)
    expect(panels.some((p) => p.length === 0)).toBe(true)
    expect(panels.some((p) => p.includes(JUDGE_2))).toBe(false)
  })

  it('gives each judge a different list', async () => {
    const one = await call('GET', '/matches?status=open&mine=true', { token: tokens.judge1 })
    const two = await call('GET', '/matches?status=open&mine=true', { token: tokens.judge2 })
    expect(one.payload.total).toBe(2)
    expect(two.payload.total).toBe(2)
    expect(one.payload.matches.map((m) => m.id)).not.toEqual(two.payload.matches.map((m) => m.id))
  })

  it('shows the referee their own mats the same way', async () => {
    const { payload } = await call('GET', '/matches?mine=true', { token: tokens.referee })
    // Three refereed by them plus the unassigned one; the completed bout has a
    // judge but no referee, so it is not unassigned.
    expect(payload.total).toBe(3)
  })

  it('cannot be pointed at somebody else', async () => {
    // mine is a flag, not a user id, so there is no way to ask for another
    // official's assignments.
    const asJudge = await call('GET', '/matches?status=open&mine=judge2-uid', { token: tokens.judge1 })
    expect(asJudge.payload.total).toBe(3)
  })

  it('scopes to one category when asked', async () => {
    const { payload } = await call('GET', `/matches?categoryId=${ids.categoryId}`, { token: tokens.referee })
    expect(payload.total).toBe(4)

    const none = await call('GET', '/matches?categoryId=ghost', { token: tokens.referee })
    expect(none.payload.total).toBe(0)
  })

  it('pages', async () => {
    const { payload } = await call('GET', '/matches?limit=2', { token: tokens.referee })
    expect(payload.matches).toHaveLength(2)
    expect(payload).toMatchObject({ total: 4, pages: 2 })
  })

  it('needs a signed-in caller', async () => {
    expect((await call('GET', '/matches')).status).toBe(401)
  })
})
