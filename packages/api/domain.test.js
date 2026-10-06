import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port, tokens

const url = (path) => `http://localhost:${port}/api/v1${path}`

const call = (method, path, { token, body } = {}) =>
  fetch(url(path), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const get = (path, token) => call('GET', path, { token })
const post = (path, body, token) => call('POST', path, { token, body })
const patch = (path, body, token) => call('PATCH', path, { token, body })
const put = (path, body, token) => call('PUT', path, { token, body })
const del = (path, token) => call('DELETE', path, { token })

const json = async (res) => res.json()

const login = async (email) => {
  const res = await fetch(url('/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123' }),
  })
  return (await res.json()).token
}

const A_TOURNAMENT = {
  name: 'Spring Cup', location: 'Pune', date: '2026-05-15', template: 'kumite',
}
const A_CATEGORY = {
  name: 'U14 Boys', ageGroup: 'U14', gender: 'M', division: 'Beginner',
}
const A_COMPETITOR = { name: 'Aiden Parker', bib: '101', age: 13 }

// Creates a tournament -> category -> two competitors, and hands back their ids.
const seedCategory = async () => {
  const { tournament } = await json(await post('/tournaments', A_TOURNAMENT, tokens.admin))
  const { category } = await json(
    await post(`/tournaments/${tournament.id}/categories`, A_CATEGORY, tokens.admin)
  )
  const { competitor: red } = await json(
    await post(`/categories/${category.id}/competitors`, A_COMPETITOR, tokens.admin)
  )
  const { competitor: blue } = await json(
    await post(`/categories/${category.id}/competitors`, { ...A_COMPETITOR, name: 'Ben Torres', bib: '102' }, tokens.admin)
  )
  return { tournamentId: tournament.id, categoryId: category.id, redId: red.id, blueId: blue.id }
}

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
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

describe('tournaments', () => {
  it('starts empty and returns what an admin creates', async () => {
    expect((await json(await get('/tournaments', tokens.admin))).tournaments).toEqual([])

    const res = await post('/tournaments', A_TOURNAMENT, tokens.admin)
    expect(res.status).toBe(201)
    const { tournament } = await json(res)
    expect(tournament).toMatchObject({ ...A_TOURNAMENT, status: 'draft' })
    expect(tournament.id).toBeTruthy()
    expect(tournament.createdAt).toBeTruthy()
  })

  it('lets every signed-in role read the schedule', async () => {
    await post('/tournaments', A_TOURNAMENT, tokens.admin)
    for (const role of ['admin', 'referee', 'judge']) {
      const res = await get('/tournaments', tokens[role])
      expect(res.status, role).toBe(200)
      expect((await json(res)).tournaments).toHaveLength(1)
    }
  })

  it('refuses a read with no token at all', async () => {
    expect((await get('/tournaments')).status).toBe(401)
  })

  it('keeps writes to admins', async () => {
    for (const role of ['referee', 'judge']) {
      const res = await post('/tournaments', A_TOURNAMENT, tokens[role])
      expect(res.status, role).toBe(403)
      expect((await json(res)).error).toBe('forbidden')
    }
  })

  it('will not let a client choose its own id or creation time', async () => {
    const res = await post('/tournaments', { ...A_TOURNAMENT, id: 'chosen-by-client' }, tokens.admin)
    expect(res.status).toBe(400)
    expect(await json(res)).toMatchObject({ error: 'unknown_field', details: { field: 'id' } })

    const stamped = await post('/tournaments', { ...A_TOURNAMENT, createdAt: '1999-01-01' }, tokens.admin)
    expect(stamped.status).toBe(400)
  })

  it('validates the fields it does accept', async () => {
    const cases = [
      [{ ...A_TOURNAMENT, name: 'ab' }, 'invalid_name'],
      [{ ...A_TOURNAMENT, template: 'freestyle' }, 'invalid_template'],
      [{ ...A_TOURNAMENT, date: '15-05-2026' }, 'invalid_date'],
      [{ ...A_TOURNAMENT, status: 'cancelled' }, 'invalid_status'],
      [{ location: 'Pune', date: '2026-05-15', template: 'kata' }, 'name_required'],
    ]
    for (const [body, code] of cases) {
      const res = await post('/tournaments', body, tokens.admin)
      expect(res.status, code).toBe(400)
      expect((await json(res)).error).toBe(code)
    }
  })

  it('reads, patches and deletes one by id', async () => {
    const { tournament } = await json(await post('/tournaments', A_TOURNAMENT, tokens.admin))

    expect((await json(await get(`/tournaments/${tournament.id}`, tokens.judge))).tournament.name)
      .toBe('Spring Cup')

    const patched = await json(await patch(`/tournaments/${tournament.id}`, { status: 'active' }, tokens.admin))
    expect(patched.tournament).toMatchObject({ status: 'active', name: 'Spring Cup' })

    expect((await del(`/tournaments/${tournament.id}`, tokens.admin)).status).toBe(204)
    expect((await get(`/tournaments/${tournament.id}`, tokens.admin)).status).toBe(404)
  })

  it('404s on an unknown id rather than inventing one', async () => {
    expect((await get('/tournaments/nope', tokens.admin)).status).toBe(404)
    expect((await patch('/tournaments/nope', { status: 'active' }, tokens.admin)).status).toBe(404)
    expect((await del('/tournaments/nope', tokens.admin)).status).toBe(404)
  })

  it('refuses a patch that carries nothing', async () => {
    const { tournament } = await json(await post('/tournaments', A_TOURNAMENT, tokens.admin))
    const res = await patch(`/tournaments/${tournament.id}`, {}, tokens.admin)
    expect(res.status).toBe(400)
    expect((await json(res)).error).toBe('empty_patch')
  })

  it('takes its categories, competitors and matches down with it', async () => {
    const { tournamentId, categoryId, redId, blueId } = await seedCategory()
    await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin)

    expect((await del(`/tournaments/${tournamentId}`, tokens.admin)).status).toBe(204)

    // Nothing may survive that could only ever be reached through the deleted
    // tournament.
    expect((await get(`/categories/${categoryId}`, tokens.admin)).status).toBe(404)
    expect((await get(`/competitors/${redId}`, tokens.admin)).status).toBe(404)
    expect((await get(`/categories/${categoryId}/matches`, tokens.admin)).status).toBe(404)
  })
})

describe('categories', () => {
  it('creates under a tournament and lists only that tournament\'s own', async () => {
    const { tournament: first } = await json(await post('/tournaments', A_TOURNAMENT, tokens.admin))
    const { tournament: second } = await json(await post('/tournaments', A_TOURNAMENT, tokens.admin))

    await post(`/tournaments/${first.id}/categories`, A_CATEGORY, tokens.admin)
    await post(`/tournaments/${second.id}/categories`, { ...A_CATEGORY, name: 'U16 Girls' }, tokens.admin)

    const { categories } = await json(await get(`/tournaments/${first.id}/categories`, tokens.admin))
    expect(categories).toHaveLength(1)
    expect(categories[0]).toMatchObject({ name: 'U14 Boys', tournamentId: first.id })
  })

  it('will not create one under a tournament that does not exist', async () => {
    // An orphan would be invisible to every screen and never cleaned up.
    const res = await post('/tournaments/nope/categories', A_CATEGORY, tokens.admin)
    expect(res.status).toBe(404)
  })

  it('keeps writes to admins but lets a judge read', async () => {
    const { tournamentId, categoryId } = await seedCategory()
    expect((await post(`/tournaments/${tournamentId}/categories`, A_CATEGORY, tokens.referee)).status).toBe(403)
    expect((await patch(`/categories/${categoryId}`, { name: 'X' }, tokens.judge)).status).toBe(403)
    expect((await del(`/categories/${categoryId}`, tokens.referee)).status).toBe(403)
    expect((await get(`/categories/${categoryId}`, tokens.judge)).status).toBe(200)
  })

  it('validates gender against a closed set but takes any division text', async () => {
    const { tournamentId } = await seedCategory()
    const bad = await post(`/tournaments/${tournamentId}/categories`, { ...A_CATEGORY, gender: 'X' }, tokens.admin)
    expect((await json(bad)).error).toBe('invalid_gender')

    const ok = await post(
      `/tournaments/${tournamentId}/categories`,
      { ...A_CATEGORY, division: 'Shotokan 3rd Kyu' },
      tokens.admin
    )
    expect(ok.status).toBe(201)
  })

  it('takes its competitors and matches with it when deleted', async () => {
    const { categoryId, redId, blueId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin))

    expect((await del(`/categories/${categoryId}`, tokens.admin)).status).toBe(204)
    expect((await get(`/competitors/${redId}`, tokens.admin)).status).toBe(404)
    expect((await get(`/matches/${match.id}`, tokens.admin)).status).toBe(404)
  })
})

describe('competitors', () => {
  it('creates under a category and scopes the listing to it', async () => {
    const { categoryId } = await seedCategory()
    const { competitors } = await json(await get(`/categories/${categoryId}/competitors`, tokens.admin))
    expect(competitors).toHaveLength(2)
    expect(competitors[0]).toMatchObject({ categoryId, bib: '101' })
  })

  it('will not create one under a category that does not exist', async () => {
    expect((await post('/categories/nope/competitors', A_COMPETITOR, tokens.admin)).status).toBe(404)
  })

  it('validates name, bib and age', async () => {
    const { categoryId } = await seedCategory()
    const cases = [
      [{ ...A_COMPETITOR, name: 'A' }, 'invalid_name'],
      [{ ...A_COMPETITOR, age: 0 }, 'invalid_age'],
      [{ ...A_COMPETITOR, age: 13.5 }, 'invalid_age'],
      [{ ...A_COMPETITOR, age: '13' }, 'invalid_age'],
      [{ name: 'Aiden Parker', age: 13 }, 'bib_required'],
    ]
    for (const [body, code] of cases) {
      const res = await post(`/categories/${categoryId}/competitors`, body, tokens.admin)
      expect(res.status, code).toBe(400)
      expect((await json(res)).error).toBe(code)
    }
  })

  it('keeps a bib as written, leading zeroes and all', async () => {
    const { categoryId } = await seedCategory()
    const { competitor } = await json(
      await post(`/categories/${categoryId}/competitors`, { ...A_COMPETITOR, bib: '007' }, tokens.admin)
    )
    expect(competitor.bib).toBe('007')
  })

  it('patches and deletes one by id, admin only', async () => {
    const { redId } = await seedCategory()
    expect((await patch(`/competitors/${redId}`, { age: 14 }, tokens.referee)).status).toBe(403)

    const { competitor } = await json(await patch(`/competitors/${redId}`, { age: 14 }, tokens.admin))
    expect(competitor.age).toBe(14)

    expect((await del(`/competitors/${redId}`, tokens.admin)).status).toBe(204)
    expect((await get(`/competitors/${redId}`, tokens.admin)).status).toBe(404)
  })
})

describe('matches', () => {
  it('creates a bout between two competitors of that category', async () => {
    const { categoryId, redId, blueId } = await seedCategory()
    const res = await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin)
    expect(res.status).toBe(201)
    expect((await json(res)).match).toMatchObject({ categoryId, redId, blueId, status: 'open' })
  })

  it('refuses a competitor who is not entered in that category', async () => {
    // Otherwise a mistyped id quietly produces a bout across two divisions.
    const first = await seedCategory()
    const second = await seedCategory()

    const res = await post(
      `/categories/${first.categoryId}/matches`,
      { redId: first.redId, blueId: second.blueId },
      tokens.admin
    )
    expect(res.status).toBe(400)
    expect((await json(res)).error).toBe('invalid_blueId')
  })

  it('refuses a competitor id that matches nothing', async () => {
    const { categoryId, redId } = await seedCategory()
    const res = await post(`/categories/${categoryId}/matches`, { redId, blueId: 'ghost' }, tokens.admin)
    expect(res.status).toBe(400)
    expect((await json(res)).error).toBe('invalid_blueId')
  })

  it('lets a referee record the result, because they are the one at the mat', async () => {
    const { categoryId, redId, blueId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin))

    const res = await patch(
      `/matches/${match.id}`,
      { status: 'completed', winner: 'aka', result: { method: 'gapRule', scores: { ao: 0, aka: 8 } } },
      tokens.referee
    )
    expect(res.status).toBe(200)
    expect((await json(res)).match).toMatchObject({
      status: 'completed', winner: 'aka', result: { method: 'gapRule' },
    })
  })

  it('does not let a judge record a result', async () => {
    const { categoryId, redId, blueId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin))
    expect((await patch(`/matches/${match.id}`, { winner: 'aka' }, tokens.judge)).status).toBe(403)
  })

  it('lets a referee schedule a bout on their mat, but not delete one', async () => {
    const { categoryId } = await seedCategory()
    // Scheduling is the referee's own job at the mat; waiting on an
    // administrator for each pairing would stop it between bouts.
    expect((await post(`/categories/${categoryId}/matches`, {}, tokens.referee)).status).toBe(201)

    // Deleting is not: a match carries the judges' scores with it.
    const { match } = await json(await post(`/categories/${categoryId}/matches`, {}, tokens.admin))
    expect((await del(`/matches/${match.id}`, tokens.referee)).status).toBe(403)
    expect((await del(`/matches/${match.id}`, tokens.admin)).status).toBe(204)
  })

  it('still keeps a judge from scheduling a bout', async () => {
    const { categoryId } = await seedCategory()
    expect((await post(`/categories/${categoryId}/matches`, {}, tokens.judge)).status).toBe(403)
  })

  it('accepts both score vocabularies, since kata and kumite differ', async () => {
    const { categoryId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, {}, tokens.admin))

    for (const winner of ['red', 'blue', 'tie', 'ao', 'aka', 'draw']) {
      const res = await patch(`/matches/${match.id}`, { winner }, tokens.referee)
      expect(res.status, winner).toBe(200)
    }
    expect((await patch(`/matches/${match.id}`, { winner: 'purple' }, tokens.referee)).status).toBe(400)
  })

  it('clears a nullable field when sent an explicit null', async () => {
    const { categoryId, redId, blueId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, { redId, blueId }, tokens.admin))

    const { match: cleared } = await json(await patch(`/matches/${match.id}`, { redId: null }, tokens.referee))
    expect(cleared.redId).toBeNull()
  })

  it('bounds a kata average to a real score', async () => {
    const { categoryId } = await seedCategory()
    const { match } = await json(await post(`/categories/${categoryId}/matches`, {}, tokens.admin))
    expect((await patch(`/matches/${match.id}`, { avgRed: 10.5 }, tokens.referee)).status).toBe(400)
    expect((await patch(`/matches/${match.id}`, { avgRed: 8.3 }, tokens.referee)).status).toBe(200)
  })
})

describe('display', () => {
  const A_SNAPSHOT = {
    status: 'open',
    matchId: 'm1',
    fieldNumber: '3',
    aoName: 'Ao Competitor',
    akaName: 'Aka Competitor',
    aoScore: 3,
    akaScore: 1,
    senshu: 'ao',
    clock: { running: true, remainingMs: 90000, startedAt: 1700000000000 },
    heartbeatAt: 1700000000000,
  }

  it('is readable with no token, because a hall screen has nobody to sign it in', async () => {
    await put('/display', A_SNAPSHOT, tokens.referee)
    const res = await get('/display')
    expect(res.status).toBe(200)
    expect((await json(res)).display).toMatchObject({ aoScore: 3, akaName: 'Aka Competitor' })
  })

  it('tells a caller nothing is on yet rather than failing', async () => {
    expect((await json(await get('/display'))).display).toBeNull()
  })

  it('is never cached, because a stale score on a wall is worse than none', async () => {
    const res = await get('/display')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('only a referee or admin may publish', async () => {
    expect((await put('/display', A_SNAPSHOT, tokens.judge)).status).toBe(403)
    expect((await put('/display', A_SNAPSHOT)).status).toBe(401)
    expect((await put('/display', A_SNAPSHOT, tokens.admin)).status).toBe(200)
  })

  it('replaces the single live row rather than accumulating rows', async () => {
    await put('/display', A_SNAPSHOT, tokens.referee)
    await put('/display', { ...A_SNAPSHOT, aoScore: 7 }, tokens.referee)
    expect((await json(await get('/display'))).display.aoScore).toBe(7)
  })

  it('accepts the closed payload the console sends when the board goes down', async () => {
    const res = await put('/display', { status: 'closed' }, tokens.referee)
    expect(res.status).toBe(200)
    expect((await json(res)).display.status).toBe('closed')
  })

  it('carries the clock anchor through untouched, since displays derive from it', async () => {
    await put('/display', A_SNAPSHOT, tokens.referee)
    expect((await json(await get('/display'))).display.clock).toEqual(A_SNAPSHOT.clock)
  })

  it('validates what it does constrain', async () => {
    expect((await json(await put('/display', { status: 'paused' }, tokens.referee))).error)
      .toBe('invalid_status')
    expect((await json(await put('/display', { ...A_SNAPSHOT, senshu: 'red' }, tokens.referee))).error)
      .toBe('invalid_senshu')
    expect((await json(await put('/display', { ...A_SNAPSHOT, aoScore: -1 }, tokens.referee))).error)
      .toBe('invalid_aoScore')
  })
})

describe('transport level failures', () => {
  it('answers an unrouted path in the same shape as everything else', async () => {
    const res = await get('/nothing-here', tokens.admin)
    expect(res.status).toBe(404)
    expect((await json(res)).error).toBe('route_not_found')
  })

  it('reports malformed JSON as a bad request, not a crash', async () => {
    const res = await fetch(url('/tournaments'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.admin}` },
      body: '{"name": ',
    })
    expect(res.status).toBe(400)
    expect((await json(res)).error).toBe('invalid_json')
  })

  it('refuses an oversized body instead of buffering it', async () => {
    const res = await post('/tournaments', { ...A_TOURNAMENT, name: 'x'.repeat(40_000) }, tokens.admin)
    expect(res.status).toBe(413)
    expect((await json(res)).error).toBe('payload_too_large')
  })

  it('sends the hardening headers on every response', async () => {
    const res = await get('/tournaments', tokens.admin)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('answers a preflight without running the route', async () => {
    const res = await fetch(url('/tournaments'), { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
  })
})
