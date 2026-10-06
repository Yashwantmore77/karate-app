import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port
const tokens = {}

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = res.status === 204 ? null : await res.json().catch(() => null)
  return { status: res.status, body: payload }
}

const login = async (email) => (await call('POST', '/auth/login', { email, password: 'test123' })).body.token

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  tokens.admin = await login('admin@kata.local')
  tokens.referee = await login('referee@kata.local')
  tokens.registrar = await login('registrar@kata.local')
  tokens.weighin = await login('weighin@kata.local')
})

afterEach(() => new Promise((resolve) => http.close(resolve)))

const setUpTournament = async () => {
  const { body: { tournament } } = await call('POST', '/tournaments', {
    name: 'State Open', location: 'Pune', date: '2027-01-15', template: 'kumite',
    masterAgeDate: '2027-01-01', type: 'kumite', slug: 'state-open',
  }, tokens.admin)
  const t = tournament.id
  const { body: { ageGroup } } = await call('POST', `/tournaments/${t}/age-groups`, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 }, tokens.admin)
  await call('POST', `/tournaments/${t}/weight-categories`, { ageGroupId: ageGroup.id, name: '-35 KG', maxWeight: 35 }, tokens.admin)
  await call('POST', `/tournaments/${t}/lifecycle`, { to: 'REGISTRATION_OPEN' }, tokens.admin)
  const { body: { link } } = await call('PUT', `/tournaments/${t}/registration-link`, { password: 'dojo-pass' }, tokens.admin)
  return { t, link, ageGroup }
}

const openCoach = async (link) => {
  const { body } = await call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass' })
  const team = await call('POST', '/coach/team', { name: 'ABC Karate', club: 'ABC Karate' }, body.token)
  return team.body.token
}

describe('PRD tournament management over HTTP', () => {
  it('runs the section 64 flow through the public link, the coach panel and the admin API', async () => {
    const { t, link } = await setUpTournament()

    expect((await call('GET', `/public/register/${link.token}`)).body).toMatchObject({ requiresPassword: true, registrationOpen: true })
    expect((await call('POST', `/public/register/${link.token}/session`, { password: 'wrong' })).status).toBe(403)

    const coach = await openCoach(link)
    for (let i = 0; i < 10; i += 1) {
      const res = await call('POST', '/coach/players', { name: `Player ${i}`, dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 30 + (i % 5) + i / 100 }, coach)
      expect(res.status).toBe(201)
    }
    const me = (await call('GET', '/coach/me', undefined, coach)).body
    expect(me.players).toHaveLength(10)
    expect(me.players[0]).toMatchObject({ age: 12, registrationStatus: 'SUBMITTED' })

    // a registration officer approves; a referee may not
    const { body: { players } } = await call('GET', `/tournaments/${t}/players`, undefined, tokens.registrar)
    expect((await call('POST', `/tournaments/${t}/players/${players[0].id}/registration`, { action: 'approve' }, tokens.referee)).status).toBe(403)
    for (const p of players) {
      expect((await call('POST', `/tournaments/${t}/players/${p.id}/registration`, { action: 'approve' }, tokens.registrar)).status).toBe(200)
    }

    await call('POST', `/tournaments/${t}/categorize`, {}, tokens.admin)
    const { body: { divisions } } = await call('GET', `/tournaments/${t}/divisions`, undefined, tokens.admin)
    expect(divisions[0]).toMatchObject({ label: 'Boys 12-13 / Kumite / -35 KG', count: 10 })

    await call('POST', `/tournaments/${t}/locks/entries`, { locked: true }, tokens.admin)
    // Rule 7: the coach is now read-only
    expect((await call('PATCH', `/coach/players/${players[0].id}`, { name: 'Changed' }, coach)).status).toBe(409)

    const pools = (await call('POST', `/tournaments/${t}/pools/generate`, { seed: 9 }, tokens.admin)).body.pools
    expect(pools.map((p) => p.playerIds.length)).toEqual([5, 5])
    await call('POST', `/tournaments/${t}/locks/draw`, { locked: true }, tokens.admin)
    expect((await call('POST', `/tournaments/${t}/matches/generate`, {}, tokens.admin)).body.created).toBe(20)

    const { body: { matches } } = await call('GET', `/tournaments/${t}/matches`, undefined, tokens.referee)
    expect(matches[0]).toMatchObject({ matchNumber: 'M-001', poolName: 'A' })

    // the referee records results through the existing match API (red = AKA)
    for (const m of matches) {
      const res = await call('PATCH', `/matches/${m.id}`, { status: 'completed', winner: 'red', avgRed: 11, avgBlue: 3 }, tokens.referee)
      expect(res.status).toBe(200)
    }
    // Rule 6: changing a completed result needs a reason, and is audited
    expect((await call('PATCH', `/matches/${matches[0].id}`, { winner: 'blue' }, tokens.referee)).body.error).toBe('correction_reason_required')
    expect((await call('PATCH', `/matches/${matches[0].id}`, { winner: 'blue', correctionReason: 'Scoring table error' }, tokens.referee)).status).toBe(200)

    const results = (await call('GET', `/tournaments/${t}/results`, undefined, tokens.admin)).body.results
    expect(results[0].canGenerateBracket).toBe(true)
    const bracket = (await call('POST', `/tournaments/${t}/brackets/generate`, { divisionKey: divisions[0].key }, tokens.admin)).body.bracket
    expect(bracket.rounds.map((r) => r.name)).toEqual(['Semi Final', 'Final'])

    const semis = (await call('GET', `/tournaments/${t}/matches`, undefined, tokens.admin)).body.matches.filter((m) => m.stage === 'knockout')
    for (const m of semis) await call('PATCH', `/matches/${m.id}`, { status: 'completed', winner: 'red', avgRed: 4, avgBlue: 1 }, tokens.referee)
    const final = (await call('GET', `/tournaments/${t}/matches`, undefined, tokens.admin)).body.matches.find((m) => m.roundName === 'Final')
    expect(final).toBeTruthy()
    await call('PATCH', `/matches/${final.id}`, { status: 'completed', winner: 'blue', avgRed: 1, avgBlue: 2 }, tokens.referee)

    expect((await call('POST', `/tournaments/${t}/results/publish`, {}, tokens.admin)).body).toMatchObject({ published: true, medals: 4 })
    expect((await call('POST', `/tournaments/${t}/certificates/generate`, {}, tokens.admin)).body.created).toBe(4)

    // public, by slug, with no sign-in and nothing private (Rule 8)
    const view = await call('GET', '/public/tournaments/state-open')
    expect(view.status).toBe(200)
    expect(view.body.tally.club[0]).toMatchObject({ name: 'ABC Karate', gold: 1 })
    expect(JSON.stringify(view.body)).not.toMatch(/"dob"|"mobile"|"email"|passwordHash|"weighIn"/)

    const audit = (await call('GET', `/tournaments/${t}/audit`, undefined, tokens.admin)).body.audit
    expect(audit.some((a) => a.action === 'match.result_changed' && a.reason === 'Scoring table error' && a.actorRole === 'referee')).toBe(true)
    expect((await call('GET', `/tournaments/${t}/audit`, undefined, tokens.referee)).status).toBe(403)
  })

  it('keeps referees out of configuration and lets the weigh-in officer weigh', async () => {
    const { t, link } = await setUpTournament()
    expect((await call('POST', `/tournaments/${t}/age-groups`, { name: 'Girls', gender: 'F', minAge: 12, maxAge: 13 }, tokens.referee)).status).toBe(403)
    const coach = await openCoach(link)
    const { body: { player } } = await call('POST', '/coach/players', { name: 'Rahul', dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 34.5 }, coach)
    await call('POST', `/tournaments/${t}/players/${player.id}/registration`, { action: 'approve' }, tokens.admin)
    const weighed = await call('POST', `/tournaments/${t}/players/${player.id}/weigh-in`, { actualWeight: 34.2 }, tokens.weighin)
    expect(weighed.status).toBe(200)
    expect(weighed.body.player.weighIn).toMatchObject({ status: 'PASSED', actualWeight: 34.2, registeredWeight: 34.5, officerId: 'weighin-uid' })
    expect((await call('POST', `/tournaments/${t}/players/${player.id}/weigh-in`, { actualWeight: 34.2 }, tokens.registrar)).status).toBe(403)
  })

  it('rejects unknown fields and a bad bulk file with row errors', async () => {
    const { t, link } = await setUpTournament()
    expect((await call('POST', `/tournaments/${t}/age-groups`, { name: 'X', gender: 'M', minAge: 1, maxAge: 2, role: 'admin' }, tokens.admin)).body.error).toBe('unknown_field')
    const coach = await openCoach(link)
    expect((await call('POST', '/coach/players', { name: 'X', dob: '2014-01-01', gender: 'M', events: ['kata'], registrationStatus: 'APPROVED' }, coach)).body.error).toBe('unknown_field')
    const preview = await call('POST', '/coach/players/bulk/preview', { csv: 'Player Name,DOB,Gender,Event\nA,2014-01-01,M,kata\nB,not-a-date,M,kata\n' }, coach)
    expect(preview.body.errors).toEqual([{ row: 3, field: 'dob', message: 'DOB is not a valid date' }])
    expect((await call('POST', '/coach/players/bulk', { csv: 'Player Name,DOB,Gender,Event\nB,not-a-date,M,kata\n' }, coach)).body.error).toBe('bulk_has_errors')
  })

  it('hides draft tournaments from the public', async () => {
    const { body: { tournament } } = await call('POST', '/tournaments', { name: 'Draft Cup', location: 'X', date: '2027-01-01', template: 'kumite' }, tokens.admin)
    expect((await call('GET', `/public/tournaments/${tournament.id}`)).status).toBe(404)
  })
})
