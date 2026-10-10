import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { createUser } from './auth/users.js'

/**
 * The tournament owner: an account that runs the tournaments it was given and
 * reaches nothing else.
 *
 *  - the super admin creates it; an administrator assigns it tournaments;
 *  - inside an assigned tournament it does an administrator's work;
 *  - outside one it sees nothing, and the system-wide screens stay shut.
 */

let http, port

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123') => (await call('POST', '/auth/login', { email, password })).body.token

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

const TOURNAMENT = { location: 'Pune', date: '2027-03-14', template: 'kumite' }

describe('tournament owner', () => {
  it('reaches its own tournament and nothing else', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const admin = await login('admin@kata.local')

    const mine = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Owned ${stamp}` }, admin)).body.tournament
    const other = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Not owned ${stamp}` }, admin)).body.tournament

    // Only the super admin mints an owner.
    const email = `owner${stamp}@x.local`
    expect((await call('POST', '/users', { email, password: 'password1', role: 'tournament_owner' }, admin)).status).toBe(403)
    const created = await call('POST', '/users', { email, password: 'password1', role: 'tournament_owner' }, root)
    expect(created.status).toBe(201)
    const ownerUid = created.body.user.uid

    // Nothing assigned yet means no tournaments at all, not every one of them.
    let owner = await login(email, 'password1')
    expect((await call('GET', '/tournaments', undefined, owner)).body.tournaments).toEqual([])
    expect((await call('GET', `/tournaments/${mine.id}`, undefined, owner)).status).toBe(403)

    // An administrator hands over the tournament.
    expect((await call('PATCH', `/users/${ownerUid}`, { tournamentIds: [mine.id] }, admin)).status).toBe(200)

    owner = await login(email, 'password1')
    const listed = (await call('GET', '/tournaments', undefined, owner)).body.tournaments
    expect(listed.map((t) => t.name)).toEqual([`Owned ${stamp}`])
    expect((await call('GET', `/tournaments/${mine.id}`, undefined, owner)).status).toBe(200)
    expect((await call('GET', `/tournaments/${other.id}`, undefined, owner)).status).toBe(403)
    expect((await call('GET', `/tournaments/${other.id}/divisions`, undefined, owner)).status).toBe(403)
  })

  it('does an administrator\'s work inside the tournament it holds', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const admin = await login('admin@kata.local')
    const mine = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Run by owner ${stamp}` }, admin)).body.tournament
    const email = `owner.work${stamp}@x.local`
    await call('POST', '/users', { email, password: 'password1', role: 'tournament_owner', tournamentIds: [mine.id] }, root)
    const owner = await login(email, 'password1')

    // Its settings, its categories, its entrants.
    expect((await call('PATCH', `/tournaments/${mine.id}`, { location: 'Nashik' }, owner)).status).toBe(200)
    const category = (await call('POST', `/tournaments/${mine.id}/categories`, {
      name: 'Cadet -50', ageGroup: 'Cadet', gender: 'M', division: '-50 KG', event: 'kumite',
    }, owner)).body.category
    expect(category.tournamentId).toBe(mine.id)
    expect((await call('PATCH', `/categories/${category.id}`, { name: 'Cadet -52' }, owner)).status).toBe(200)
    const competitor = await call('POST', `/categories/${category.id}/competitors`, { name: 'A Competitor', bib: '001', age: 14 }, owner)
    expect(competitor.status).toBe(201)

    // The officials picker, for building a panel.
    expect((await call('GET', '/officials?role=referee', undefined, owner)).status).toBe(200)

    // Reading the tournament's own lists.
    expect((await call('GET', `/tournaments/${mine.id}/divisions`, undefined, owner)).status).toBe(200)
  })

  it('is kept out of the system-wide screens', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const admin = await login('admin@kata.local')
    const mine = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Limits ${stamp}` }, admin)).body.tournament
    const email = `owner.limits${stamp}@x.local`
    await call('POST', '/users', { email, password: 'password1', role: 'tournament_owner', tournamentIds: [mine.id] }, root)
    const owner = await login(email, 'password1')

    // No new tournaments, and no removing the one it runs.
    expect((await call('POST', '/tournaments', { ...TOURNAMENT, name: `Owner made ${stamp}` }, owner)).status).toBe(403)
    expect((await call('DELETE', `/tournaments/${mine.id}`, undefined, owner)).status).toBe(403)

    // No accounts, no sign-in log, no backups, no rulesets, no organisations.
    expect((await call('GET', '/users', undefined, owner)).status).toBe(403)
    expect((await call('POST', '/users', { email: `made${stamp}@x.local`, password: 'password1', role: 'referee' }, owner)).status).toBe(403)
    expect((await call('GET', '/auth/logins', undefined, owner)).status).toBe(403)
    expect((await call('GET', '/system/backup', undefined, owner)).status).toBe(403)
    expect((await call('GET', '/organizations', undefined, owner)).status).toBe(403)
  })

  it('cannot be created, changed or removed by an administrator', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const admin = await login('admin@kata.local')
    const email = `owner.guard${stamp}@x.local`
    const uid = (await call('POST', '/users', { email, password: 'password1', role: 'tournament_owner' }, root)).body.user.uid

    expect((await call('PATCH', `/users/${uid}`, { role: 'admin' }, admin)).status).toBe(403)
    expect((await call('DELETE', `/users/${uid}`, undefined, admin)).status).toBe(403)
    // Assigning tournaments is still an administrator's job.
    const t = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Assignable ${stamp}` }, admin)).body.tournament
    expect((await call('PATCH', `/users/${uid}`, { tournamentIds: [t.id] }, admin)).status).toBe(200)
    // The super admin may still change or remove the account.
    expect((await call('PATCH', `/users/${uid}`, { role: 'viewer' }, root)).status).toBe(200)
  })

  it('is not handed out as a role inside one tournament', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const admin = await login('admin@kata.local')
    const t = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `Scoped role ${stamp}` }, admin)).body.tournament
    const made = await call('POST', '/users', {
      email: `scoped${stamp}@x.local`, password: 'password1', role: 'viewer', tournamentRoles: { [t.id]: 'tournament_owner' },
    }, root)
    expect(made.status).toBe(400)
    expect(made.body.error).toBe('invalid_tournamentRoles')
  })

  it('stays inside its organisation', async () => {
    const stamp = Date.now()
    const root = await login('superadmin@kata.local')
    const a = (await call('POST', '/organizations', { name: 'Org A', slug: `org-a-${stamp}` }, root)).body.organization
    const b = (await call('POST', '/organizations', { name: 'Org B', slug: `org-b-${stamp}` }, root)).body.organization
    await call('POST', '/users', { email: `adminA${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: a.id }, root)
    await call('POST', '/users', { email: `adminB${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: b.id }, root)
    const adminA = await login(`adminA${stamp}@x.local`, 'password1')
    const adminB = await login(`adminB${stamp}@x.local`, 'password1')
    const ta = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `A Cup ${stamp}` }, adminA)).body.tournament
    const tb = (await call('POST', '/tournaments', { ...TOURNAMENT, name: `B Cup ${stamp}` }, adminB)).body.tournament

    const email = `owner.org${stamp}@x.local`
    const uid = (await call('POST', '/users', {
      email, password: 'password1', role: 'tournament_owner', organizationId: a.id, tournamentIds: [ta.id],
    }, root)).body.user.uid

    // B's administrator can neither see nor assign A's owner.
    expect((await call('PATCH', `/users/${uid}`, { tournamentIds: [tb.id] }, adminB)).status).toBe(403)
    // Nor can A's administrator hand it another organisation's tournament.
    expect((await call('PATCH', `/users/${uid}`, { tournamentIds: [tb.id] }, adminA)).status).toBe(403)

    const owner = await login(email, 'password1')
    expect((await call('GET', '/tournaments', undefined, owner)).body.tournaments.map((t) => t.name)).toEqual([`A Cup ${stamp}`])
    expect((await call('GET', `/tournaments/${tb.id}`, undefined, owner)).status).toBe(403)
  })
})
