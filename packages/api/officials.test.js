import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port, tokens, ids

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

// Seeded accounts, so the roles under test are real ones the system ships with.
const REFEREE_UID = 'ref-uid-001'
const JUDGE_UIDS = ['judge1-uid', 'judge2-uid', 'judge3-uid', 'judge4-uid']
const ADMIN_UID = 'admin-uid-001'

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  tokens = { admin: await login('admin@kata.local'), referee: await login('referee@kata.local') }

  const { payload: t } = await call('POST', '/tournaments', {
    token: tokens.admin,
    body: { name: 'Panel Cup', location: 'Pune', date: '2026-05-15', template: 'kumite' },
  })
  const { payload: c } = await call('POST', `/tournaments/${t.tournament.id}/categories`, {
    token: tokens.admin,
    body: { name: 'U14 Boys', ageGroup: 'U14', gender: 'M', division: 'Beginner' },
  })
  const enter = async (name, bib) => (await call('POST', `/categories/${c.category.id}/competitors`, {
    token: tokens.admin,
    body: { name, bib, age: 13 },
  })).payload.competitor.id

  ids = {
    tournamentId: t.tournament.id,
    categoryId: c.category.id,
    red: await enter('Aarav Deshmukh', '101'),
    blue: await enter('Rohan Kulkarni', '102'),
  }
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

const createMatch = (body, token = tokens.referee) =>
  call('POST', `/categories/${ids.categoryId}/matches`, { token, body })

describe('assigning officials to a match', () => {
  it('accepts a referee and a full panel of judges', async () => {
    const res = await createMatch({
      redId: ids.red, blueId: ids.blue, refereeId: REFEREE_UID, judgeIds: JUDGE_UIDS,
    })
    expect(res.status).toBe(201)
    expect(res.payload.match).toMatchObject({ refereeId: REFEREE_UID })
    expect(res.payload.match.judgeIds).toEqual(JUDGE_UIDS)
  })

  it('leaves a match with nobody assigned perfectly valid', async () => {
    // Bouts get listed before anyone is put on them, and the existing schedule
    // has no officials at all.
    const res = await createMatch({ redId: ids.red, blueId: ids.blue })
    expect(res.status).toBe(201)
    expect(res.payload.match.refereeId).toBeUndefined()
  })

  it('refuses a referee who is not a referee', async () => {
    const res = await createMatch({ refereeId: JUDGE_UIDS[0] })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_refereeId')
  })

  it('lets an admin take a mat', async () => {
    expect((await createMatch({ refereeId: ADMIN_UID })).status).toBe(201)
  })

  it('refuses a referee who does not exist', async () => {
    expect((await createMatch({ refereeId: 'nobody' })).payload.error).toBe('invalid_refereeId')
  })

  it('refuses a judge who is not a judge', async () => {
    expect((await createMatch({ judgeIds: [REFEREE_UID] })).payload.error).toBe('invalid_judgeIds')
  })

  it('refuses the same judge twice on one panel', async () => {
    const res = await createMatch({ judgeIds: [JUDGE_UIDS[0], JUDGE_UIDS[0]] })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_judgeIds')
  })

  it('refuses the referee sitting on their own panel', async () => {
    const res = await createMatch({ refereeId: REFEREE_UID, judgeIds: [REFEREE_UID] })
    expect(res.payload.error).toBe('referee_also_judge')
  })

  it('refuses more judges than the tournament seats', async () => {
    // Panel Cup defaults to four.
    const res = await createMatch({ judgeIds: [...JUDGE_UIDS, ADMIN_UID] })
    expect(res.status).toBe(400)
    expect(['too_many_judges', 'invalid_judgeIds']).toContain(res.payload.error)
  })

  it('honours a tournament that seats fewer judges', async () => {
    const { payload: small } = await call('POST', '/tournaments', {
      token: tokens.admin,
      body: { name: 'Small Cup', location: 'Pune', date: '2026-05-15', template: 'kumite', judgeCount: 2 },
    })
    expect(small.tournament.judgeCount).toBe(2)

    const { payload: cat } = await call('POST', `/tournaments/${small.tournament.id}/categories`, {
      token: tokens.admin,
      body: { name: 'U16', ageGroup: 'U16', gender: 'F', division: 'Open' },
    })

    const third = await call('POST', `/categories/${cat.category.id}/matches`, {
      token: tokens.referee,
      body: { judgeIds: JUDGE_UIDS.slice(0, 3) },
    })
    expect(third.payload.error).toBe('too_many_judges')

    const pair = await call('POST', `/categories/${cat.category.id}/matches`, {
      token: tokens.referee,
      body: { judgeIds: JUDGE_UIDS.slice(0, 2) },
    })
    expect(pair.status).toBe(201)
  })

  it('defaults a tournament to a panel of four', async () => {
    const { payload } = await call('GET', `/tournaments/${ids.tournamentId}`, { token: tokens.admin })
    expect(payload.tournament.judgeCount).toBe(4)
  })
})

describe('a bout needs two different people', () => {
  it('refuses the same competitor on both sides', async () => {
    const res = await createMatch({ redId: ids.red, blueId: ids.red })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('same_competitor')
  })

  it('refuses it via a patch that only changes one side', async () => {
    // Checking the patch alone would let this through one field at a time.
    const { payload } = await createMatch({ redId: ids.red, blueId: ids.blue })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { blueId: ids.red },
    })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('same_competitor')
  })
})

describe('changing officials later', () => {
  it('assigns a panel to an existing match', async () => {
    const { payload } = await createMatch({ redId: ids.red, blueId: ids.blue })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { refereeId: REFEREE_UID, judgeIds: JUDGE_UIDS.slice(0, 2) },
    })
    expect(res.status).toBe(200)
    expect(res.payload.match.judgeIds).toHaveLength(2)
  })

  it('catches a clash against officials already stored', async () => {
    const { payload } = await createMatch({ refereeId: REFEREE_UID })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { judgeIds: [REFEREE_UID] },
    })
    expect(res.payload.error).toBe('referee_also_judge')
  })

  it('clears a panel with an explicit empty list', async () => {
    const { payload } = await createMatch({ judgeIds: JUDGE_UIDS })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { judgeIds: [] },
    })
    expect(res.status).toBe(200)
    expect(res.payload.match.judgeIds).toEqual([])
  })

  it('refuses a judge list that is not a list', async () => {
    expect((await createMatch({ judgeIds: 'judge1-uid' })).payload.error).toBe('invalid_judgeIds')
  })
})
