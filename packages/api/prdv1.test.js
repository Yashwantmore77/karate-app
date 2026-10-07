import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { createStores } from './lib/store.js'
import { createBackup, restoreBackup, BACKUP_FORMAT } from './lib/backup.js'
import { emailNotifier } from './lib/emailNotifier.js'

// PRD v1 platform pieces over HTTP: partner import, coach accounts, sessions,
// rulesets, system audit and backup, the scoreboard operator, idempotency,
// tournament-scoped roles and the notification channels.

let http, port
const tokens = {}

const call = async (method, path, body, token, headers = {}) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = res.status === 204 ? null : await res.json().catch(() => null)
  return { status: res.status, body: payload, headers: res.headers }
}

const login = async (email, password = 'test123') => (await call('POST', '/auth/login', { email, password })).body.token

const READY = {
  organizer: 'State Karate Association', venue: 'Pune', startDate: '2027-01-15', endDate: '2027-01-16',
  registrationStart: '2020-01-01', registrationClose: '2099-12-31', contactMobile: '+91 98765 43210', contactEmail: 'office@open.example', country: 'India',
}

const tournament = async (slug = 'partner-open') => {
  const { body } = await call('POST', '/tournaments', { name: 'Partner Open', location: 'Pune', date: '2027-01-15', template: 'kumite', masterAgeDate: '2027-01-01', type: 'kumite', slug, ...READY }, tokens.admin)
  const t = body.tournament.id
  const { body: { ageGroup } } = await call('POST', `/tournaments/${t}/age-groups`, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 }, tokens.admin)
  await call('POST', `/tournaments/${t}/weight-categories`, { ageGroupId: ageGroup.id, name: '-35 KG', maxWeight: 35 }, tokens.admin)
  await call('POST', `/tournaments/${t}/lifecycle`, { to: 'REGISTRATION_OPEN' }, tokens.admin)
  return t
}

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  tokens.admin = await login('admin@kata.local')
  tokens.superadmin = await login('superadmin@kata.local')
  tokens.viewer = await login('viewer@kata.local')
  tokens.scoreboard = await login('scoreboard@kata.local')
})

afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('partner API import (PRD v1 §7)', () => {
  it('issues a key once, imports with it, keeps it out of the tournament, and revokes it', async () => {
    const t = await tournament()
    const issued = await call('POST', `/tournaments/${t}/partner-key`, {}, tokens.admin)
    expect(issued.status).toBe(201)
    expect(issued.body.key).toMatch(/^kpk_/)
    expect((await call('GET', `/tournaments/${t}/partner-key`, undefined, tokens.admin)).body.partnerKey.hint).toBe(issued.body.key.slice(-4))
    expect(JSON.stringify((await call('GET', `/tournaments/${t}`, undefined, tokens.admin)).body)).not.toContain('keyHash')

    const body = { team: { name: 'Federation Dojo', club: 'Federation Dojo' }, players: [
      { name: 'Ravi Kumar', dob: '2014-06-15', gender: 'M', events: ['kumite'], weight: 33 },
      { name: 'X', dob: '2014-06-15', gender: 'M', events: ['kumite'] },
    ] }
    expect((await call('POST', `/partner/tournaments/${t}/players`, body, null, { 'x-api-key': 'kpk_wrong' })).status).toBe(401)
    const imported = await call('POST', `/partner/tournaments/${t}/players`, body, null, { 'x-api-key': issued.body.key })
    expect(imported.status).toBe(201)
    expect(imported.body.created).toHaveLength(1)
    expect(imported.body.rejected[0]).toMatchObject({ index: 1, error: 'invalid_player' })

    const audit = (await call('GET', `/tournaments/${t}/audit`, undefined, tokens.admin)).body.audit
    expect(audit.some((a) => a.action === 'players.partner_import')).toBe(true)

    expect((await call('DELETE', `/tournaments/${t}/partner-key`, undefined, tokens.admin)).status).toBe(204)
    expect((await call('POST', `/partner/tournaments/${t}/players`, body, null, { 'x-api-key': issued.body.key })).status).toBe(401)
  })
})

describe('coach accounts (PRD v1 §7)', () => {
  it('lets a team manager create a login that reopens their team panel', async () => {
    const t = await tournament('coach-open')
    const { body: { link } } = await call('PUT', `/tournaments/${t}/registration-link`, { password: 'dojo-pass' }, tokens.admin)
    const session = (await call('POST', `/public/register/${link.token}/session`, { password: 'dojo-pass' })).body.token
    expect((await call('POST', '/coach/account', { email: 'coach@dojo.example', password: 'coachpass1' }, session)).body.error).toBe('team_required')
    const coach = (await call('POST', '/coach/team', { name: 'ABC Karate', club: 'ABC Karate' }, session)).body.token
    expect((await call('POST', '/coach/account', { email: 'coach@dojo.example', password: 'coachpass1' }, coach)).status).toBe(201)

    const own = await login('coach@dojo.example', 'coachpass1')
    const me = (await call('GET', '/coach/me', undefined, own)).body
    expect(me.team.name).toBe('ABC Karate')
    // a coach account is not a staff account
    expect((await call('GET', '/tournaments', undefined, own)).status).toBe(403)
  })
})

describe('sessions (PRD v1 §26)', () => {
  it('lists sessions, ends the others, and a signed-out token stops working', async () => {
    const second = await login('viewer@kata.local')
    expect((await call('GET', '/auth/sessions', undefined, tokens.viewer)).body.sessions.length).toBeGreaterThanOrEqual(2)
    const { body } = await call('POST', '/auth/sessions/revoke-others', {}, tokens.viewer)
    expect(body.revoked).toBeGreaterThanOrEqual(1)
    expect((await call('GET', '/auth/me', undefined, second)).status).toBe(401)
    expect((await call('GET', '/auth/me', undefined, tokens.viewer)).status).toBe(200)

    expect((await call('POST', '/auth/logout', {}, tokens.viewer)).status).toBe(204)
    expect((await call('GET', '/auth/me', undefined, tokens.viewer)).status).toBe(401)
  })
})

describe('rulesets (PRD v1 §6, §24)', () => {
  it('lets staff read, only the super admin write, and a tournament apply one', async () => {
    const { body: { rulesets } } = await call('GET', '/rulesets', undefined, tokens.admin)
    const wkf = rulesets.find((r) => r.id === 'builtin-wkf')
    expect(wkf).toBeTruthy()
    const draft = { name: 'District Cadet', description: 'Shorter bouts', kumite: { ...wkf.kumite, matchDurationSec: 90 }, kata: wkf.kata }
    expect((await call('POST', '/rulesets', draft, tokens.admin)).status).toBe(403)
    const created = await call('POST', '/rulesets', draft, tokens.superadmin)
    expect(created.status).toBe(201)

    const t = await tournament('rules-open')
    const applied = await call('POST', `/tournaments/${t}/ruleset`, { rulesetId: created.body.ruleset.id }, tokens.admin)
    expect(applied.body.tournament.settings).toMatchObject({ matchDurationSec: 90 })
  })
})

describe('system audit and backup (PRD v1 §22-23)', () => {
  it('records organisation changes and sign-outs, and gives the super admin a backup', async () => {
    expect((await call('POST', '/organizations', { name: 'Pune Karate', slug: 'pune-karate' }, tokens.superadmin)).status).toBe(201)
    await call('POST', '/auth/logout', {}, tokens.viewer)
    const audit = (await call('GET', '/system/audit', undefined, tokens.superadmin)).body.audit
    expect(audit.some((a) => a.action === 'organization.changed' && a.reason === 'created')).toBe(true)
    expect(audit.some((a) => a.action === 'auth.logout')).toBe(true)

    expect((await call('GET', '/system/backup', undefined, tokens.admin)).status).toBe(403)
    const backup = (await call('GET', '/system/backup', undefined, tokens.superadmin)).body
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.collections.organizations).toHaveLength(1)
  })

  it('restores a backup into an empty store, and refuses a full one', async () => {
    const source = createStores()
    await source.tournaments.insert({ name: 'Backed Up', slug: 'backed-up' })
    await source.players.insert({ name: 'Asha Rao', tournamentId: 'x' })
    const backup = JSON.parse(JSON.stringify(await createBackup(source)))

    const target = createStores()
    expect(await restoreBackup(target, backup)).toMatchObject({ tournaments: 1, players: 1 })
    expect((await target.tournaments.list({}))[0]).toMatchObject({ name: 'Backed Up', createdAt: (await source.tournaments.list({}))[0].createdAt })
    await expect(restoreBackup(target, backup)).rejects.toMatchObject({ code: 'target_not_empty' })
    expect(await restoreBackup(target, backup, { replace: true })).toMatchObject({ tournaments: 1 })
    expect(await target.tournaments.count({})).toBe(1)
    await expect(restoreBackup(target, { format: 'other' })).rejects.toMatchObject({ code: 'invalid_backup' })
  })
})

describe('scoreboard operator (PRD v1 §4)', () => {
  it('sets the hall announcement without touching scores; a viewer may not', async () => {
    expect((await call('PATCH', '/display/message', { message: 'Mat 2: final next' }, tokens.viewer)).status).toBe(403)
    expect((await call('PATCH', '/display/message', { message: 'Mat 2: final next' }, tokens.scoreboard)).body.display.message).toBe('Mat 2: final next')
    expect((await call('GET', '/display')).body.display.message).toBe('Mat 2: final next')
  })
})

describe('idempotent writes (PRD v1 §25)', () => {
  it('carries out a retried write once', async () => {
    const body = { name: 'Retry Cup', location: 'Pune', date: '2027-01-15', template: 'kumite' }
    const first = await call('POST', '/tournaments', body, tokens.admin, { 'idempotency-key': 'abc-1' })
    const again = await call('POST', '/tournaments', body, tokens.admin, { 'idempotency-key': 'abc-1' })
    expect(again.headers.get('idempotent-replay')).toBe('true')
    expect(again.body.tournament.id).toBe(first.body.tournament.id)
    const list = (await call('GET', '/tournaments?limit=100', undefined, tokens.admin)).body.tournaments
    expect(list.filter((t) => t.name === 'Retry Cup')).toHaveLength(1)
  })
})

describe('tournament-scoped roles (PRD v1 §4)', () => {
  it('gives an account a different role inside one tournament only', async () => {
    const t = await tournament('scoped-open')
    const other = await tournament('scoped-other')
    await call('POST', '/users', { email: 'helper@kata.local', password: 'password1', role: 'viewer', tournamentRoles: { [t]: 'registration_officer' } }, tokens.admin)
    const helper = await login('helper@kata.local', 'password1')
    // registration officer here (may soft-lock coach entries), viewer elsewhere
    expect((await call('POST', `/tournaments/${t}/locks/soft`, { locked: true }, helper)).status).toBe(200)
    expect((await call('POST', `/tournaments/${other}/locks/soft`, { locked: true }, helper)).status).toBe(403)
  })
})

describe('notification channels (PRD v1 §19)', () => {
  it('sends SMS to team mobiles when the channel is on and a gateway is set', async () => {
    const stores = createStores()
    const team = await stores.teams.insert({ tournamentId: 't1', name: 'ABC', mobile: '+919800000001' })
    const posted = []
    const notify = emailNotifier(stores, { env: { SMS_WEBHOOK_URL: 'https://sms.example/hook' }, post: async (url, body) => posted.push({ url, body }) })
    await notify({ audience: 'team', teamId: team.id, tournamentId: 't1', type: 'draw_published', message: 'Draw is out' }, { name: 'Open' }, { email: false, sms: true, whatsapp: true })
    expect(posted).toEqual([{ url: 'https://sms.example/hook', body: { channel: 'sms', to: '+919800000001', text: 'Open: Draw published. Draw is out' } }])
    posted.length = 0
    await notify({ audience: 'team', teamId: team.id, tournamentId: 't1', type: 'draw_published', message: 'Draw is out' }, { name: 'Open' }, { email: true, sms: false })
    expect(posted).toEqual([])
  })
})
