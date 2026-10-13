import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from './index.js'
import { runDemo, DEMO_DOMAIN } from './scripts/demo-tournament.js'
import { TEST_PASSWORD } from './test/roster.js'

// The demo tournaments, built against a server this test owns so it can look
// at what was left behind: one fully played, one ready to run.

let http, url, report
const STAFF_PASSWORD = 'demo-staff-pass'
const call = async (method, path, token, body) => {
  const res = await fetch(`${url}/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).body.token
const admin = { email: 'admin@kata.local', password: TEST_PASSWORD }

beforeAll(async () => {
  process.env.API_RATE_LIMIT = '1000000'
  ;({ http } = createApp())
  const port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  url = `http://localhost:${port}`
  report = await runDemo({ url, ...admin, staffPassword: STAFF_PASSWORD, quiet: true })
}, 120_000)
afterAll(() => new Promise((resolve) => http.close(resolve)))

describe('demo tournaments', () => {
  it('builds both without a failed step', () => {
    expect(report.steps.filter((s) => !s.ok)).toEqual([])
    expect(Object.keys(report.tournaments).sort()).toEqual(['played', 'ready'])
  })

  it('plays the first one to the end and leaves it open', async () => {
    const A = await login(admin.email, admin.password)
    const id = report.tournaments.played.id
    const { tournament } = (await call('GET', `/tournaments/${id}`, A)).body
    // Results are in, but it is not marked Completed: still open to explore and correct.
    expect(tournament.lifecycleStatus).toBe('LIVE')

    const { matches } = (await call('GET', `/tournaments/${id}/matches`, A)).body
    const fought = matches.filter((m) => m.redId && m.blueId)
    expect(fought.length).toBeGreaterThan(20)
    expect(fought.every((m) => m.status === 'completed' && m.winner)).toBe(true)
    // Both draw systems: round-robin pools for the 10-11s, brackets for the 12-13s.
    expect(fought.some((m) => m.stage === 'knockout')).toBe(true)
    expect(fought.some((m) => m.stage !== 'knockout')).toBe(true)
    // Every bout was given to a referee. Each was closed with that mat's
    // referee's own sign-in, which the server allows only for the referee assigned.
    expect(fought.every((m) => m.refereeId)).toBe(true)

    const { results } = (await call('GET', `/tournaments/${id}/results`, A)).body
    expect(results.length).toBe(12)
    expect(results.every((r) => r.medals.some((m) => m.medal === 'gold'))).toBe(true)
    expect(results.some((r) => r.resultStatus === 'LOCKED')).toBe(false)

    const { certificates } = (await call('GET', `/tournaments/${id}/certificates`, A)).body
    expect(certificates.some((c) => c.type === 'gold')).toBe(true)
    expect(certificates.filter((c) => c.type === 'participation')).toHaveLength(40)
  })

  it('takes the second one as far as going live, and scores nothing', async () => {
    const A = await login(admin.email, admin.password)
    const { id, slug } = report.tournaments.ready
    const { tournament } = (await call('GET', `/tournaments/${id}`, A)).body
    expect(tournament.lifecycleStatus).toBe('LIVE')

    const { matches } = (await call('GET', `/tournaments/${id}/matches`, A)).body
    const ready = matches.filter((m) => m.redId && m.blueId)
    expect(ready.length).toBeGreaterThan(20)
    expect(ready.some((m) => m.status === 'completed' || m.winner)).toBe(false)
    // Timetabled with a referee on each, so the day can start straight away.
    expect(ready.every((m) => m.scheduledAt && m.refereeId)).toBe(true)

    const { players } = (await call('GET', `/tournaments/${id}/players?limit=200`, A)).body
    expect(players).toHaveLength(40)
    const view = (await call('GET', `/public/tournaments/${slug}`)).body
    expect(view.tournament.runningEvent).toBe('kata')
  })

  it('gives each tournament to its own Tournament Admin, who sees no other', async () => {
    for (const t of Object.values(report.tournaments)) {
      const token = await login(t.admin, STAFF_PASSWORD)
      const { tournaments } = (await call('GET', '/tournaments?limit=100', token)).body
      expect(tournaments.map((x) => x.id)).toEqual([t.id])
    }
  })

  it('keeps the demo officials out of every other tournament', async () => {
    const A = await login(admin.email, admin.password)
    const real = (await call('POST', '/tournaments', A, { name: 'A Real Event', location: 'Pune', date: '2027-02-01', template: 'kumite' })).body.tournament
    const referee = await login(`referee1@${DEMO_DOMAIN}`, STAFF_PASSWORD)
    const { tournaments } = (await call('GET', '/tournaments?limit=100', referee)).body
    expect(tournaments.map((t) => t.id).sort()).toEqual(Object.values(report.tournaments).map((t) => t.id).sort())
    expect(tournaments.some((t) => t.id === real.id)).toBe(false)
  })

  it('will not build them twice', async () => {
    const again = await runDemo({ url, ...admin, quiet: true })
    expect(again.ok).toBe(false)
    expect(again.steps.find((s) => !s.ok).error).toMatch(/already there.*--remove/)
  })

  it('takes everything out again with --remove', async () => {
    const removed = await runDemo({ url, ...admin, remove: true, quiet: true })
    expect(removed.ok).toBe(true)
    expect(removed.removed).toEqual({ tournaments: 2, accounts: 11 })

    const A = await login(admin.email, admin.password)
    for (const t of Object.values(report.tournaments)) {
      expect((await call('GET', `/tournaments/${t.id}`, A)).status).toBe(404)
    }
    const { users } = (await call('GET', `/users?q=${encodeURIComponent(`@${DEMO_DOMAIN}`)}`, A)).body
    expect(users).toEqual([])
  })
})
