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

// PRD v1 §6: what a tournament needs before registration opens. The window
// is wide because these tests run against the real clock.
const READY = {
  organizer: 'State Karate Association', venue: 'Pune', startDate: '2027-01-15', endDate: '2027-01-16',
  registrationStart: '2020-01-01', registrationClose: '2099-12-31', contactMobile: '+91 98765 43210', contactEmail: 'office@open.example', country: 'India',
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
    masterAgeDate: '2027-01-01', type: 'kumite', slug: 'state-open', ...READY,
  }, tokens.admin)
  const t = tournament.id
  const { body: { ageGroup } } = await call('POST', `/tournaments/${t}/age-groups`, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 }, tokens.admin)
  await call('POST', `/tournaments/${t}/weight-categories`, { ageGroupId: ageGroup.id, name: '-35 KG', maxWeight: 35 }, tokens.admin)
  // These flows draw from registered weights; the verified weigh-in gate has its own tests.
  await call('PATCH', `/tournaments/${t}/settings`, { requireWeighInForDraw: false }, tokens.admin)
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
      const res = await call('POST', '/coach/players', { name: `Player ${i}`, dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 30 + (i % 5) + i / 10 }, coach)
      expect(res.status, JSON.stringify(res.body)).toBe(201)
    }
    const me = (await call('GET', '/coach/me', undefined, coach)).body
    expect(me.players).toHaveLength(10)
    const paged = (await call('GET', `/tournaments/${t}/players?page=2&limit=4&sort=name`, undefined, tokens.admin)).body
    expect(paged).toMatchObject({ total: 10, page: 2, limit: 4, pages: 3 })
    expect(paged.players.map((p) => p.name)).toEqual(['Player 4', 'Player 5', 'Player 6', 'Player 7'])
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
    // PRD v1 §5: correcting a decided bout is a sensitive privilege the referee lacks
    expect((await call('PATCH', `/matches/${matches[0].id}`, { winner: 'blue', correctionReason: 'Scoring table error' }, tokens.referee)).status).toBe(403)
    expect((await call('PATCH', `/matches/${matches[0].id}`, { winner: 'blue', correctionReason: 'Scoring table error' }, tokens.admin)).status).toBe(200)

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

    // section 44/45: server-generated PDFs
    const pdf = await fetch(`http://localhost:${port}/api/v1/tournaments/${t}/certificates.pdf`, { headers: { authorization: `Bearer ${tokens.admin}` } })
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    const bytes = Buffer.from(await pdf.arrayBuffer())
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(4)
    const report = await fetch(`http://localhost:${port}/api/v1/tournaments/${t}/reports/match.pdf`, { headers: { authorization: `Bearer ${tokens.admin}` } })
    expect(report.status).toBe(200)
    expect(Buffer.from(await report.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    expect((await fetch(`http://localhost:${port}/api/v1/tournaments/${t}/reports/secrets.pdf`, { headers: { authorization: `Bearer ${tokens.admin}` } })).status).toBe(404)
    expect((await fetch(`http://localhost:${port}/api/v1/tournaments/${t}/reports/match.pdf`, { headers: { authorization: `Bearer ${tokens.referee}` } })).status).toBe(403)

    // public, by slug, with no sign-in and nothing private (Rule 8)
    const view = await call('GET', '/public/tournaments/state-open')
    expect(view.status).toBe(200)
    expect(view.body.tally.club[0]).toMatchObject({ name: 'ABC Karate', gold: 1 })
    expect(JSON.stringify(view.body)).not.toMatch(/"dob"|"mobile"|"email"|passwordHash|"weighIn"/)

    const audit = (await call('GET', `/tournaments/${t}/audit`, undefined, tokens.admin)).body.audit
    expect(audit.some((a) => a.action === 'match.result_changed' && a.reason === 'Scoring table error' && a.actorRole === 'admin')).toBe(true)
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
    const preview = await call('POST', '/coach/players/bulk/preview', { csv: 'Player Name,DOB,Gender,Event\nAsha Rao,2014-01-01,M,kata\nBina Rao,not-a-date,M,kata\n' }, coach)
    expect(preview.body.errors).toEqual([{ row: 3, field: 'dob', message: 'DOB is not a valid date' }])
    expect((await call('POST', '/coach/players/bulk', { csv: 'Player Name,DOB,Gender,Event\nB,not-a-date,M,kata\n' }, coach)).body.error).toBe('bulk_has_errors')
  })

  it('hides draft tournaments from the public', async () => {
    const { body: { tournament } } = await call('POST', '/tournaments', { name: 'Draft Cup', location: 'Pune', date: '2027-01-01', template: 'kumite' }, tokens.admin)
    expect((await call('GET', `/public/tournaments/${tournament.id}`)).status).toBe(404)
  })

  it('assigns officials to a match and records a walkover and a cancellation', async () => {
    const { t, link } = await setUpTournament()
    const coach = await openCoach(link)
    for (let i = 0; i < 3; i += 1) {
      const { body: { player } } = await call('POST', '/coach/players', { name: `W${i}`, dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 33 }, coach)
      await call('POST', `/tournaments/${t}/players/${player.id}/registration`, { action: 'approve' }, tokens.admin)
    }
    await call('POST', `/tournaments/${t}/locks/entries`, { locked: true }, tokens.admin)
    await call('POST', `/tournaments/${t}/pools/generate`, {}, tokens.admin)
    await call('POST', `/tournaments/${t}/locks/draw`, { locked: true }, tokens.admin)
    await call('POST', `/tournaments/${t}/matches/generate`, {}, tokens.admin)
    const [m1, m2] = (await call('GET', `/tournaments/${t}/matches`, undefined, tokens.admin)).body.matches

    // PRD bouts are scheduled through the match API, with its clash checks.
    const scheduled = await call('PATCH', `/matches/${m1.id}`, { mat: 2, scheduledAt: '2027-01-15T09:00:00Z', refereeId: 'ref-uid-001', judgeIds: ['judge1-uid', 'judge2-uid'] }, tokens.admin)
    expect(scheduled.body.match).toMatchObject({ mat: 2, refereeId: 'ref-uid-001', judgeIds: ['judge1-uid', 'judge2-uid'] })
    expect((await call('PATCH', `/matches/${m1.id}`, { judgeIds: ['judge1-uid', 'judge1-uid'] }, tokens.admin)).status).toBe(400)
    // the same referee cannot be on a second bout at the same time
    expect((await call('PATCH', `/matches/${m2.id}`, { scheduledAt: '2027-01-15T09:00:00Z', refereeId: 'ref-uid-001' }, tokens.admin)).body.error).toBe('schedule_conflict')

    const wo = await call('POST', `/tournaments/${t}/matches/${m1.id}/correct`, { winner: 'red', resultType: 'WALKOVER', finishReason: 'Opponent did not report' }, tokens.admin)
    expect(wo.body.match, JSON.stringify(wo.body)).toMatchObject({ status: 'completed', winner: 'red', result: { type: 'WALKOVER' } })
    const cancelled = await call('POST', `/tournaments/${t}/matches/${m2.id}/correct`, { resultType: 'CANCELLED' }, tokens.admin)
    expect(cancelled.body.match).toMatchObject({ status: 'cancelled', winner: null })
    const listed = (await call('GET', `/tournaments/${t}/matches`, undefined, tokens.referee)).body.matches
    expect(listed.find((m) => m.id === m1.id).resultType).toBe('WALKOVER')
  })

  it('stores uploads, serves private ones only to those allowed, and logos to anyone', async () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const { t, link } = await setUpTournament()
    const coach = await openCoach(link)
    const up = await call('POST', '/coach/files', { name: 'id.png', type: 'image/png', data: PNG }, coach)
    expect(up.status).toBe(201)
    const spoof = await call('POST', '/coach/files', { name: 'x.pdf', type: 'application/pdf', data: PNG }, coach)
    expect(spoof.body.error).toBe('content_does_not_match_type')

    const raw = (path, token) => fetch(`http://localhost:${port}/api/v1${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
    const asStaff = await raw(`/files/${up.body.file.id}`, tokens.registrar)
    expect(asStaff.status).toBe(200)
    expect(asStaff.headers.get('content-type')).toBe('image/png')
    expect(asStaff.headers.get('content-security-policy')).toMatch(/sandbox/)
    expect((await raw(`/files/${up.body.file.id}`, tokens.referee)).status).toBe(403)
    expect((await raw(`/public/files/${up.body.file.id}`)).status).toBe(403)

    expect((await call('POST', `/tournaments/${t}/files`, { name: 'l.png', type: 'image/png', data: PNG, purpose: 'logo' }, tokens.registrar)).status).toBe(403)
    const logo = await call('POST', `/tournaments/${t}/files`, { name: 'l.png', type: 'image/png', data: PNG, purpose: 'logo' }, tokens.admin)
    expect((await raw(`/public/files/${logo.body.file.id}`)).status).toBe(200)
  })

  it('emails teams and organisers, and sends a weigh-in reminder', async () => {
    const { readOutbox, clearOutbox } = await import('./lib/mailer.js')
    const { t, link } = await setUpTournament()
    await call('PATCH', `/tournaments/${t}`, { contactEmail: 'office@open.example' }, tokens.admin)
    const { body } = await call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass' })
    const coach = (await call('POST', '/coach/team', { name: 'Mail Dojo', email: 'coach@dojo.example' }, body.token)).body.token
    clearOutbox()
    const { body: { player } } = await call('POST', '/coach/players', { name: 'Ravi', dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 33 }, coach)
    expect(readOutbox().map((m) => m.to)).toEqual(['office@open.example'])
    await call('POST', `/tournaments/${t}/players/${player.id}/registration`, { action: 'approve' }, tokens.admin)
    expect(readOutbox().at(-1)).toMatchObject({ to: 'coach@dojo.example', subject: 'State Open: Registration approved' })
    expect((await call('POST', `/tournaments/${t}/weigh-in/reminders`, {}, tokens.weighin)).body).toEqual({ teams: 1 })
    expect(readOutbox().at(-1).text).toMatch(/Weigh-in reminder.*Ravi/)
    // organisers can turn email off without losing in-app notices
    await call('PATCH', `/tournaments/${t}/settings`, { emailNotifications: false }, tokens.admin)
    const before = readOutbox().length
    await call('POST', `/tournaments/${t}/weigh-in/reminders`, {}, tokens.admin)
    expect(readOutbox()).toHaveLength(before)
  })
})

describe('gap features over HTTP', () => {
  const registerApproved = async (t, link, players) => {
    const coach = await openCoach(link)
    for (const p of players) expect((await call('POST', '/coach/players', { dob: '2014-06-15', gender: 'M', ...p }, coach)).status).toBe(201)
    const { body } = await call('GET', `/tournaments/${t}/players`, undefined, tokens.admin)
    for (const p of body.players) await call('POST', `/tournaments/${t}/players/${p.id}/registration`, { action: 'approve' }, tokens.admin)
    await call('POST', `/tournaments/${t}/categorize`, {}, tokens.admin)
    return body.players
  }

  it('saves point values and category settings, and rejects bad ones', async () => {
    const { t, ageGroup } = await setUpTournament()
    expect((await call('PATCH', `/tournaments/${t}/settings`, { points: { yuko: 1, wazaAri: 2, ippon: 4 }, poolMode: 'overflow' }, tokens.admin)).body.tournament.settings).toMatchObject({ points: { ippon: 4 }, poolMode: 'overflow' })
    expect((await call('PATCH', `/tournaments/${t}/settings`, { points: { yuko: 0, wazaAri: 2, ippon: 3 } }, tokens.admin)).status).toBe(400)
    expect((await call('PATCH', `/tournaments/${t}/age-groups/${ageGroup.id}`, { settings: { poolSize: 4, poolSystem: 'knockout' } }, tokens.admin)).body.ageGroup.settings).toEqual({ poolSize: 4, poolSystem: 'knockout' })
    expect((await call('PATCH', `/tournaments/${t}/age-groups/${ageGroup.id}`, { settings: { poolSystem: 'swiss' } }, tokens.admin)).status).toBe(400)
  })

  it('runs a kata panel: judges score from their own seats, the admin completes, medals follow', async () => {
    const { t, link } = await setUpTournament()
    await call('PATCH', `/tournaments/${t}/settings`, { kataJudges: 3, kataRounds: 1 }, tokens.admin)
    await registerApproved(t, link, [1, 2, 3, 4].map((i) => ({ name: `Kata ${i}`, events: ['kata'], weight: 30 })))
    const judges = await Promise.all([1, 2, 3].map((n) => login(`judge${n}@kata.local`)))

    const { body: { divisions } } = await call('GET', `/tournaments/${t}/kata/divisions`, undefined, tokens.admin)
    expect(divisions).toHaveLength(1)
    // PRD v1 §15: a judge sees only the rounds they sit on
    expect((await call('GET', `/tournaments/${t}/kata/divisions`, undefined, judges[0])).body.divisions).toHaveLength(0)
    expect((await call('POST', `/tournaments/${t}/kata/rounds`, { divisionKey: divisions[0].key }, tokens.admin)).body.error).toBe('entries_not_locked')
    await call('POST', `/tournaments/${t}/locks/entries`, { locked: true }, tokens.admin)
    expect((await call('POST', `/tournaments/${t}/kata/rounds`, { divisionKey: divisions[0].key }, judges[0])).status).toBe(403)
    const { body: { round } } = await call('POST', `/tournaments/${t}/kata/rounds`, { divisionKey: divisions[0].key, seed: 3 }, tokens.admin)
    expect(round).toMatchObject({ name: 'Final', judges: 3, status: 'pending' })
    expect((await call('POST', `/tournaments/${t}/kata/rounds/${round.id}/scores`, { playerId: round.performerIds[0], score: 7 }, judges[0])).body.error).toBe('round_not_started')
    await call('POST', `/tournaments/${t}/kata/rounds/${round.id}/start`, {}, tokens.admin)
    expect((await call('GET', `/tournaments/${t}/kata/divisions`, undefined, judges[0])).body.divisions).toHaveLength(1)

    for (const [i, playerId] of round.performerIds.entries()) {
      for (const [seat, token] of judges.entries()) {
        // a judge naming another seat is ignored: they score from their own
        const res = await call('POST', `/tournaments/${t}/kata/rounds/${round.id}/scores`, { playerId, score: 7 + i * 0.5 + seat * 0.1, seat: 3 }, token)
        expect(res.status).toBe(200)
      }
    }
    expect((await call('POST', `/tournaments/${t}/kata/rounds/${round.id}/scores`, { playerId: round.performerIds[0], score: 4.2 }, judges[0])).body.error).toBe('invalid_score')
    const done = (await call('POST', `/tournaments/${t}/kata/rounds/${round.id}/complete`, {}, tokens.admin)).body.round
    expect(done.rows[0]).toMatchObject({ rank: 1, playerId: round.performerIds[3], final: 8.6 })

    const results = (await call('GET', `/tournaments/${t}/results`, undefined, tokens.admin)).body.results
    expect(results[0].medals.map((m) => m.medal)).toEqual(['gold', 'silver', 'bronze', 'bronze'])

    // a manual override needs a reason, and is audited
    const key = divisions[0].key
    expect((await call('POST', `/tournaments/${t}/results/medals/override`, { divisionKey: key, medals: [] }, tokens.admin)).status).toBe(400)
    const medals = [{ playerId: round.performerIds[0], medal: 'gold' }]
    expect((await call('POST', `/tournaments/${t}/results/medals/override`, { divisionKey: key, medals, reason: 'Protest upheld' }, tokens.admin)).body).toEqual({ overridden: true })
    const after = (await call('GET', `/tournaments/${t}/results`, undefined, tokens.admin)).body.results[0]
    expect(after).toMatchObject({ medalsOverridden: true, overrideReason: 'Protest upheld' })
    const audit = (await call('GET', `/tournaments/${t}/audit`, undefined, tokens.admin)).body.audit
    expect(audit.some((a) => a.action === 'medals.overridden' && a.reason === 'Protest upheld')).toBe(true)
  })

  it('makes coaches accept the terms and shows rules publicly', async () => {
    const { t, link } = await setUpTournament()
    await call('PATCH', `/tournaments/${t}`, { rules: 'WKF rules apply.', terms: 'Players compete at their own risk.' }, tokens.admin)
    const { body } = await call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass' })
    expect((await call('POST', '/coach/team', { name: 'XYZ' }, body.token)).body.error).toBe('terms_not_accepted')
    const made = await call('POST', '/coach/team', { name: 'XYZ', termsAccepted: true }, body.token)
    expect(made.status).toBe(201)
    expect(made.body.team.termsAcceptedAt).toBeTruthy()
    expect((await call('GET', '/public/tournaments/state-open')).body.tournament).toMatchObject({ rules: 'WKF rules apply.', terms: 'Players compete at their own risk.' })
  })

  it('swaps corners before a bout starts', async () => {
    const { t, link } = await setUpTournament()
    await registerApproved(t, link, [1, 2, 3].map((i) => ({ name: `Fighter ${i}`, events: ['kumite'], weight: 30 })))
    await call('POST', `/tournaments/${t}/locks/entries`, { locked: true }, tokens.admin)
    await call('POST', `/tournaments/${t}/pools/generate`, { seed: 1 }, tokens.admin)
    await call('POST', `/tournaments/${t}/locks/draw`, { locked: true }, tokens.admin)
    await call('POST', `/tournaments/${t}/matches/generate`, {}, tokens.admin)
    const [m] = (await call('GET', `/tournaments/${t}/matches`, undefined, tokens.admin)).body.matches
    expect((await call('POST', `/tournaments/${t}/matches/${m.id}/swap-corners`, {}, tokens.referee)).status).toBe(403)
    const swapped = (await call('POST', `/tournaments/${t}/matches/${m.id}/swap-corners`, { reason: 'Coach request' }, tokens.admin)).body.match
    expect([swapped.redId, swapped.blueId]).toEqual([m.blueId, m.redId])
  })
})
