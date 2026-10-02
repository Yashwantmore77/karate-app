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

const REFEREE_UID = 'ref-uid-001'
const JUDGE = { one: 'judge1-uid', two: 'judge2-uid', three: 'judge3-uid' }

const AT_ONE = '2026-05-15T13:00:00.000Z'
const AT_ONE_TEN = '2026-05-15T13:10:00.000Z'
const AT_ONE_FIFTEEN = '2026-05-15T13:15:00.000Z'

/**
 * Two categories under one tournament, each with its own pair of fighters, so a
 * clash can be built the way the hall produces one: different bouts, same
 * minute, overlapping people.
 */
const seed = async ({ slotMinutes } = {}) => {
  const { payload: t } = await call('POST', '/tournaments', {
    token: tokens.admin,
    body: {
      name: 'Clash Cup',
      location: 'Pune',
      date: '2026-05-15',
      template: 'kumite',
      ...(slotMinutes === undefined ? {} : { slotMinutes }),
    },
  })

  const category = async (name) => (await call('POST', `/tournaments/${t.tournament.id}/categories`, {
    token: tokens.admin,
    body: { name, ageGroup: 'U14', gender: 'M', division: 'Beginner' },
  })).payload.category.id

  const catA = await category('U14 Boys A')
  const catB = await category('U14 Boys B')

  const enter = async (categoryId, name, bib) => (await call('POST', `/categories/${categoryId}/competitors`, {
    token: tokens.admin,
    body: { name, bib, age: 13 },
  })).payload.competitor.id

  return {
    tournamentId: t.tournament.id,
    catA,
    catB,
    a1: await enter(catA, 'Aarav Deshmukh', '101'),
    a2: await enter(catA, 'Rohan Kulkarni', '102'),
    b1: await enter(catB, 'Ishaan Joshi', '201'),
    b2: await enter(catB, 'Vivaan Patil', '202'),
  }
}

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  tokens = { admin: await login('admin@kata.local'), referee: await login('referee@kata.local') }
  ids = await seed()
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

const matchIn = (categoryId, body) =>
  call('POST', `/categories/${categoryId}/matches`, { token: tokens.referee, body })

describe('a match slot', () => {
  it('derives its end from the tournament slot length', async () => {
    const { payload } = await matchIn(ids.catA, { redId: ids.a1, blueId: ids.a2, scheduledAt: AT_ONE })
    // Fifteen minutes is the default, so 13:00 releases everyone at 13:15.
    expect(payload.match.scheduledAt).toBe(AT_ONE)
    expect(payload.match.endsAt).toBe(AT_ONE_FIFTEEN)
  })

  it('honours a tournament that runs shorter slots', async () => {
    ids = await seed({ slotMinutes: 5 })
    const { payload } = await matchIn(ids.catA, { redId: ids.a1, blueId: ids.a2, scheduledAt: AT_ONE })
    expect(payload.match.endsAt).toBe('2026-05-15T13:05:00.000Z')
  })

  it('refuses an end supplied by the caller', async () => {
    // endsAt is the server's to compute. A caller that could set it could claim
    // a zero-length bout and never clash with anything.
    const res = await matchIn(ids.catA, { scheduledAt: AT_ONE, endsAt: AT_ONE })
    expect(res.status).toBe(400)
    expect(res.payload).toMatchObject({ error: 'unknown_field', details: { field: 'endsAt' } })
  })

  it('rejects a time with no timezone, rather than guessing one', async () => {
    // The API runs in UTC and the events do not, so a bare local time would be
    // stored hours from what whoever typed it meant.
    const res = await matchIn(ids.catA, { scheduledAt: '2026-05-15T13:00' })
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_scheduledAt')
  })

  it('stores an offset time as the same instant as its UTC spelling', async () => {
    const { payload } = await matchIn(ids.catA, { scheduledAt: '2026-05-15T18:30:00+05:30' })
    expect(payload.match.scheduledAt).toBe(AT_ONE)
  })

  it('leaves an unscheduled bout with no window at all', async () => {
    const { payload } = await matchIn(ids.catA, { redId: ids.a1, blueId: ids.a2 })
    expect(payload.match.scheduledAt).toBeUndefined()
    expect(payload.match.endsAt).toBeUndefined()
  })
})

describe('nobody may be in two matches at once', () => {
  it('refuses a referee already on an overlapping bout', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE_TEN, refereeId: REFEREE_UID })

    expect(res.status).toBe(409)
    expect(res.payload.error).toBe('schedule_conflict')
    expect(res.payload.details.clashes).toHaveLength(1)
    expect(res.payload.details.clashes[0]).toMatchObject({ uid: REFEREE_UID, role: 'referee' })
  })

  it('refuses a judge already sitting on an overlapping panel', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, judgeIds: [JUDGE.one, JUDGE.two] })
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE_TEN, judgeIds: [JUDGE.two, JUDGE.three] })

    expect(res.status).toBe(409)
    expect(res.payload.details.clashes).toHaveLength(1)
    expect(res.payload.details.clashes[0]).toMatchObject({ uid: JUDGE.two, role: 'judge' })
  })

  it('refuses a competitor called to two mats, not only officials', async () => {
    // The rule is about a person being in one place. A fighter is no more able
    // to be in two bouts than a referee is.
    await matchIn(ids.catA, { scheduledAt: AT_ONE, redId: ids.a1, blueId: ids.a2 })
    const res = await matchIn(ids.catA, { scheduledAt: AT_ONE_TEN, redId: ids.a1, blueId: ids.a2 })

    expect(res.status).toBe(409)
    expect(res.payload.details.clashes.map((c) => c.role)).toEqual(['competitor', 'competitor'])
  })

  it('names every person who clashes, and which bout they are already on', async () => {
    const { payload: first } = await matchIn(ids.catA, {
      scheduledAt: AT_ONE, mat: 1, refereeId: REFEREE_UID, judgeIds: [JUDGE.one],
    })
    const res = await matchIn(ids.catB, {
      scheduledAt: AT_ONE_TEN, refereeId: REFEREE_UID, judgeIds: [JUDGE.one],
    })

    expect(res.payload.details.clashes).toHaveLength(2)
    for (const clash of res.payload.details.clashes) {
      expect(clash).toMatchObject({ matchId: first.match.id, scheduledAt: AT_ONE, mat: 1 })
    }
  })

  it('allows back-to-back bouts that only touch at the boundary', async () => {
    // A mat runs one slot after another all day. Treating the shared edge as a
    // collision would reject an ordinary schedule.
    await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE_FIFTEEN, refereeId: REFEREE_UID })
    expect(res.status).toBe(201)
  })

  it('allows the same official on two bouts that are not scheduled', async () => {
    // A bout with no time occupies nobody, and panels are often set before the
    // timetable is.
    await matchIn(ids.catA, { refereeId: REFEREE_UID })
    const res = await matchIn(ids.catB, { refereeId: REFEREE_UID })
    expect(res.status).toBe(201)
  })

  it('ignores a finished bout, which no longer needs anyone', async () => {
    const { payload: first } = await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    await call('PATCH', `/matches/${first.match.id}`, {
      token: tokens.referee,
      body: { status: 'completed' },
    })

    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE_TEN, refereeId: REFEREE_UID })
    expect(res.status).toBe(201)
  })

  it('does not count a match against itself', async () => {
    const { payload } = await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { mat: 3 },
    })
    expect(res.status).toBe(200)
  })
})

describe('rescheduling an existing match', () => {
  it('refuses a move into a slot where someone is already busy', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const { payload: second } = await matchIn(ids.catB, {
      scheduledAt: '2026-05-15T16:00:00.000Z', refereeId: REFEREE_UID,
    })

    const res = await call('PATCH', `/matches/${second.match.id}`, {
      token: tokens.referee,
      body: { scheduledAt: AT_ONE_TEN },
    })
    expect(res.status).toBe(409)
    expect(res.payload.details.clashes[0]).toMatchObject({ uid: REFEREE_UID })
  })

  it('refuses adding a person who is busy, even when the time does not move', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const { payload: second } = await matchIn(ids.catB, { scheduledAt: AT_ONE_TEN })

    const res = await call('PATCH', `/matches/${second.match.id}`, {
      token: tokens.referee,
      body: { refereeId: REFEREE_UID },
    })
    expect(res.status).toBe(409)
  })

  it('recomputes the window when the time moves', async () => {
    const { payload } = await matchIn(ids.catA, { scheduledAt: AT_ONE })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { scheduledAt: '2026-05-15T14:00:00.000Z' },
    })
    expect(res.payload.match.endsAt).toBe('2026-05-15T14:15:00.000Z')
  })

  it('releases the window when the time is cleared', async () => {
    const { payload } = await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    const cleared = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { scheduledAt: null },
    })
    expect(cleared.payload.match.endsAt).toBeNull()

    // And the slot is genuinely free again, not merely blank on the record.
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    expect(res.status).toBe(201)
  })

  it('still records a result on a bout that shares its slot', async () => {
    // Recording a winner must never be refused for a clash: it is the one
    // moment the referee can do nothing about the schedule. The overlap here is
    // built by scheduling the second bout while the first has no time, then
    // giving the first its time back.
    const { payload: first } = await matchIn(ids.catA, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })
    await call('PATCH', `/matches/${first.match.id}`, {
      token: tokens.referee, body: { scheduledAt: null },
    })
    const { payload: second } = await matchIn(ids.catB, { scheduledAt: AT_ONE, refereeId: REFEREE_UID })

    const res = await call('PATCH', `/matches/${second.match.id}`, {
      token: tokens.referee,
      body: { winner: 'ao' },
    })
    expect(res.status).toBe(200)
  })
})

describe('a mat holds one bout at a time', () => {
  it('refuses a second bout on the same mat in an overlapping slot', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, mat: 2, redId: ids.a1, blueId: ids.a2 })
    // Entirely different people, so only the mat can be what clashes.
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE_TEN, mat: 2, redId: ids.b1, blueId: ids.b2 })

    expect(res.status).toBe(409)
    expect(res.payload.details.clashes).toEqual([
      expect.objectContaining({ role: 'mat', mat: 2, uid: null }),
    ])
  })

  it('allows the same slot on a different mat', async () => {
    // Two mats running at 13:00 is exactly what a multi-mat hall does.
    await matchIn(ids.catA, { scheduledAt: AT_ONE, mat: 1, redId: ids.a1, blueId: ids.a2 })
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE, mat: 2, redId: ids.b1, blueId: ids.b2 })
    expect(res.status).toBe(201)
  })

  it('does not hold a mat for a bout with no mat given', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, redId: ids.a1, blueId: ids.a2 })
    const res = await matchIn(ids.catB, { scheduledAt: AT_ONE, redId: ids.b1, blueId: ids.b2 })
    expect(res.status).toBe(201)
  })

  it('refuses moving a bout onto a mat that is taken', async () => {
    await matchIn(ids.catA, { scheduledAt: AT_ONE, mat: 1, redId: ids.a1, blueId: ids.a2 })
    const { payload } = await matchIn(ids.catB, { scheduledAt: AT_ONE, mat: 2, redId: ids.b1, blueId: ids.b2 })
    const res = await call('PATCH', `/matches/${payload.match.id}`, {
      token: tokens.referee,
      body: { mat: 1 },
    })
    expect(res.status).toBe(409)
  })
})
