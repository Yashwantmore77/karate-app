import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp } from './index.js'
import { checkSecret } from './auth/jwt.js'

// Findings of the security review, each pinned by a test.

let http, port, stores
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
  stores = app.stores
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
})
