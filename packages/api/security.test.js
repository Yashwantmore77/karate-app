import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp } from './index.js'
import { checkSecret } from './auth/jwt.js'
import { createUser } from './auth/users.js'
import { issueReset } from './auth/resets.js'

// Findings of the security review, each pinned by a test.

let http, port
const call = async (method, path, body, token, headers = {}) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, headers: res.headers, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123') => (await call('POST', '/auth/login', { email, password })).body.token

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('security review', () => {
  it('refuses to run in production without a strong JWT secret', () => {
    expect(() => checkSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/)
    expect(() => checkSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
    expect(() => checkSecret({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })).not.toThrow()
    expect(() => checkSecret({ NODE_ENV: 'development' })).not.toThrow()
  })

  it('ships no accounts of its own, in any environment', async () => {
    vi.resetModules()
    try {
      // A freshly loaded store, before the test roster is put into it: an
      // installation starts with nothing to sign in as, so no password
      // written down in this repository opens one.
      const { listUsers } = await import('./auth/users.js')
      expect((await listUsers({ limit: 1 })).total).toBe(0)
    } finally {
      vi.resetModules()
    }
  })

  it('makes the first account from the environment, never from code', async () => {
    vi.resetModules()
    const before = { ...process.env }
    try {
      process.env.NODE_ENV = 'production'
      const { initialAccounts } = await import('./auth/users.js')
      expect(await initialAccounts({})).toEqual([])
      const [admin, ...rest] = await initialAccounts({ BOOTSTRAP_ADMIN_EMAIL: 'Owner@Example.org', BOOTSTRAP_ADMIN_PASSWORD: 'a-long-passphrase' })
      expect(rest).toHaveLength(0)
      // A super admin: the account that sets an installation up is the one
      // role that can also manage organisations.
      expect(admin).toMatchObject({ email: 'owner@example.org', role: 'super_admin' })
      expect(admin.passwordHash).not.toContain('a-long-passphrase')
      // Too short a bootstrap password is refused, by the same rule every
      // other account is held to.
      expect(await initialAccounts({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.co', BOOTSTRAP_ADMIN_PASSWORD: 'short' })).toEqual([])
    } finally {
      process.env = before
      vi.resetModules()
    }
  })

  describe('the credentials shown on the sign-in screen', () => {
    const asked = () => call('GET', '/auth/test-credentials')

    it('says nothing unless it is switched on', async () => {
      const before = { ...process.env }
      try {
        process.env.BOOTSTRAP_ADMIN_EMAIL = 'boss@club.test'
        process.env.BOOTSTRAP_ADMIN_PASSWORD = 'open-sesame-9'
        delete process.env.SHOW_TEST_CREDENTIALS
        expect((await asked()).body).toEqual({ credentials: null })
        // Any other value is off too: only the exact word turns it on.
        process.env.SHOW_TEST_CREDENTIALS = 'yes'
        expect((await asked()).body).toEqual({ credentials: null })
      } finally {
        process.env = before
      }
    })

    it('gives the bootstrap administrator when it is', async () => {
      const before = { ...process.env }
      try {
        process.env.SHOW_TEST_CREDENTIALS = 'true'
        process.env.BOOTSTRAP_ADMIN_EMAIL = 'Boss@Club.test'
        process.env.BOOTSTRAP_ADMIN_PASSWORD = 'open-sesame-9'
        expect((await asked()).body).toEqual({ credentials: { email: 'boss@club.test', password: 'open-sesame-9' } })

        // Switched on but with nothing to show: still silent, rather than an
        // empty pair the screen would print as blanks.
        delete process.env.BOOTSTRAP_ADMIN_PASSWORD
        expect((await asked()).body).toEqual({ credentials: null })
      } finally {
        process.env = before
      }
    })
  })

  it("keeps an organisation's admin from granting roles in another organisation's tournaments", async () => {
    const superadmin = await login('superadmin@kata.local')
    const a = (await call('POST', '/organizations', { name: 'Org A', slug: 'org-a' }, superadmin)).body.organization
    const b = (await call('POST', '/organizations', { name: 'Org B', slug: 'org-b' }, superadmin)).body.organization
    const theirs = (await call('POST', '/tournaments', { name: 'B Open', location: 'Delhi', date: '2027-02-01', template: 'kumite', organizationId: b.id }, superadmin)).body.tournament
    const ours = (await call('POST', '/tournaments', { name: 'A Open', location: 'Pune', date: '2027-02-01', template: 'kumite', organizationId: a.id }, superadmin)).body.tournament
    await call('POST', '/users', { email: 'admin.a@kata.local', password: 'password1', role: 'admin', organizationId: a.id }, superadmin)
    const adminA = await login('admin.a@kata.local', 'password1')
    // may not hand out a role in B's tournament...
    expect((await call('POST', '/users', { email: 'mole@kata.local', password: 'password1', role: 'viewer', tournamentRoles: { [theirs.id]: 'admin' } }, adminA)).status).toBe(403)
    // ...but may in its own
    expect((await call('POST', '/users', { email: 'helper@kata.local', password: 'password1', role: 'viewer', tournamentRoles: { [ours.id]: 'admin' } }, adminA)).status).toBe(201)
    // and a role written directly on an account still stops at the boundary
    await call('POST', '/users', { email: 'planted@kata.local', password: 'password1', role: 'viewer', organizationId: a.id, tournamentRoles: { [theirs.id]: 'admin' } }, superadmin)
    const planted = await login('planted@kata.local', 'password1')
    expect((await call('GET', `/tournaments/${theirs.id}/players`, undefined, planted)).status).toBe(403)
  })

  it('replays an idempotent write only to the same signed-in caller', async () => {
    const admin = await login('admin@kata.local')
    const body = { name: 'Retry Cup', location: 'Pune', date: '2027-01-15', template: 'kumite' }
    const first = await call('POST', '/tournaments', body, admin, { 'idempotency-key': 'k-1' })
    const again = await call('POST', '/tournaments', body, admin, { 'idempotency-key': 'k-1' })
    expect(again.body.tournament.id).toBe(first.body.tournament.id)
    // an anonymous request with the same key is never answered from the cache
    const anonymous = await call('POST', '/tournaments', body, null, { 'idempotency-key': 'k-1' })
    expect(anonymous.status).toBe(401)
  })

  it('sends hardening headers and lets browsers send an Idempotency-Key', async () => {
    const res = await call('GET', '/public/tournaments')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-headers')).toContain('idempotency-key')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('lets only a super admin make, change or remove a super admin', async () => {
    const stamp = Date.now()
    const root = await createUser({ email: `root${stamp}@x.local`, password: 'password1', role: 'super_admin' })
    const admin = await login('admin@kata.local')
    expect((await call('POST', '/users', { email: `climb${stamp}@x.local`, password: 'password1', role: 'super_admin' }, admin)).status).toBe(403)
    expect((await call('PATCH', `/users/${root.uid}`, { password: 'taken-over-1' }, admin)).status).toBe(403)
    expect((await call('DELETE', `/users/${root.uid}`, undefined, admin)).status).toBe(403)
    const superAdmin = await login('superadmin@kata.local')
    expect((await call('POST', '/users', { email: `second${stamp}@x.local`, password: 'password1', role: 'super_admin' }, superAdmin)).status).toBe(201)
  })

  it('ends the sign-ins of an account that is demoted, deleted or has its password reset', async () => {
    const stamp = Date.now()
    const signedIn = async (tag, role) => {
      const user = await createUser({ email: `${tag}${stamp}@x.local`, password: 'password1', role })
      return { user, token: await login(user.email, 'password1') }
    }
    const admin = await login('admin@kata.local')
    const demoted = await signedIn('demoted', 'admin')
    await call('PATCH', `/users/${demoted.user.uid}`, { role: 'viewer' }, admin)
    expect((await call('GET', '/users', undefined, demoted.token)).status).toBe(401)

    const deleted = await signedIn('deleted', 'admin')
    await call('DELETE', `/users/${deleted.user.uid}`, undefined, admin)
    expect((await call('POST', '/users', { email: `ghost${stamp}@x.local`, password: 'password1', role: 'admin' }, deleted.token)).status).toBe(401)

    const reset = await signedIn('reset', 'referee')
    expect((await call('POST', '/auth/reset', { token: await issueReset(reset.user.uid), password: 'brand-new-1' })).status).toBe(200)
    expect((await call('GET', '/auth/me', undefined, reset.token)).status).toBe(401)
    // The administrator who made the changes stays signed in.
    expect((await call('GET', '/users', undefined, admin)).status).toBe(200)
  })

  it('ends coach sessions when their registration link is regenerated or switched off', async () => {
    const admin = await login('admin@kata.local')
    const t = (await call('POST', '/tournaments', { name: 'Link Cup', location: 'Pune', date: '2027-03-01', template: 'kumite' }, admin)).body.tournament
    const openLink = async () => {
      const { token } = (await call('PUT', `/tournaments/${t.id}/registration-link`, { active: true }, admin)).body.link
      return (await call('POST', `/public/register/${token}/session`, {})).body.token
    }
    const first = await openLink()
    expect((await call('GET', '/coach/me', undefined, first)).status).toBe(200)
    await call('PUT', `/tournaments/${t.id}/registration-link`, { regenerate: true }, admin)
    expect((await call('GET', '/coach/me', undefined, first)).body.error).toBe('link_not_found')

    const second = await openLink()
    expect((await call('GET', '/coach/me', undefined, second)).status).toBe(200)
    await call('PUT', `/tournaments/${t.id}/registration-link`, { active: false }, admin)
    expect((await call('GET', '/coach/me', undefined, second)).body.error).toBe('link_disabled')
  })

  it('offers and accepts only officials who can open the tournament', async () => {
    const admin = await login('admin@kata.local')
    const make = async (name) => (await call('POST', '/tournaments', { name, location: 'Pune', date: '2027-04-01', template: 'kumite' }, admin)).body.tournament
    const [home, away] = [await make('Home Open'), await make('Away Open')]
    const outsider = await createUser({ email: `away-ref${Date.now()}@x.local`, password: 'password1', role: 'referee', tournamentIds: [away.id] })

    const { officials } = (await call('GET', `/officials?role=referee&tournamentId=${home.id}`, undefined, admin)).body
    expect(officials.some((o) => o.uid === outsider.uid)).toBe(false)
    expect(officials.some((o) => o.email === 'referee@kata.local')).toBe(true)

    const category = (await call('POST', `/tournaments/${home.id}/categories`, { name: 'Open', ageGroup: 'Senior', gender: 'M', division: 'Open', event: 'kumite' }, admin)).body.category
    const match = (await call('POST', `/categories/${category.id}/matches`, {}, admin)).body.match
    expect((await call('PATCH', `/matches/${match.id}`, { refereeId: outsider.uid }, admin)).body.error).toBe('invalid_refereeId')
    expect((await call('PATCH', `/matches/${match.id}`, { refereeId: 'ref-uid-001' }, admin)).status).toBe(200)
  })
})
