import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { totp } from './auth/totp.js'
import { createUser } from './auth/users.js'

// KAN-impersonation: an admin opening a lens into another account — for
// support, or to see exactly what someone else sees — without that being an
// unconditional, unlogged way to reach every account in reach.

let http, port

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123', code) => call('POST', '/auth/login', { email, password, ...(code ? { code } : {}) })
const impersonate = (uid, admin, password = 'test123', code) => call('POST', `/users/${uid}/impersonate`, { password, ...(code ? { code } : {}) }, admin)

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('admin impersonation (KAN-impersonation)', () => {
  it('opens a lens with exactly the target\'s own reach, logged as both of them, and ends it from inside the lens', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: 'ref1@kata.local', password: 'password1', role: 'referee' }, admin)).body.user

    // Refused without proving it is really the admin at the keyboard.
    expect((await call('POST', `/users/${ref.uid}/impersonate`, {}, admin)).body.error).toBe('invalid_credentials')
    expect((await impersonate(ref.uid, admin, 'wrong-password')).body.error).toBe('invalid_credentials')

    const { status, body } = await impersonate(ref.uid, admin)
    expect(status).toBe(200)
    expect(body.user).toMatchObject({ uid: ref.uid, role: 'referee' })
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|twoFactorSecret/)
    const lens = body.token

    // The lens carries the referee's own reach, not the admin's: an
    // admin-only route refuses it exactly as it would refuse any referee.
    expect((await call('GET', '/users', undefined, lens)).status).toBe(403)
    expect((await call('GET', '/auth/me', undefined, lens)).body.user).toMatchObject({ uid: ref.uid, role: 'referee' })

    // Ending it from outside the lens (the admin's own, un-impersonated
    // token) is refused: only the session itself may end itself.
    expect((await call('POST', `/users/${ref.uid}/impersonate/end`, {}, admin)).status).toBe(403)
    expect((await call('POST', `/users/${ref.uid}/impersonate/end`, {}, lens)).body).toEqual({ ok: true })
    // And it is really gone: the same token no longer works.
    expect((await call('GET', '/auth/me', undefined, lens)).body.error).toBe('session_revoked')

    const adminUid = (await call('GET', '/auth/me', undefined, admin)).body.user.uid
    const audit = (await call('GET', '/system/audit?limit=100', undefined, admin)).body.audit
    const started = audit.find((a) => a.action === 'user.impersonation_started' && a.entityId === ref.uid)
    const stopped = audit.find((a) => a.action === 'user.impersonation_stopped' && a.entityId === ref.uid)
    // Started: the admin acting, on the referee's account.
    expect(started).toMatchObject({ actorId: adminUid, actorRole: 'admin', actorImpersonatedBy: null })
    // Stopped: made with the lens, so the actor is the referee — but every
    // write made with it still names the admin on the other end.
    expect(stopped).toMatchObject({ actorId: ref.uid, actorRole: 'referee', actorImpersonatedBy: adminUid })
  })

  it('never opens a lens into an admin or into itself', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const other = (await call('POST', '/users', { email: `admin2-${Date.now()}@kata.local`, password: 'password1', role: 'admin' }, admin)).body.user
    const me = (await call('GET', '/auth/me', undefined, admin)).body.user

    expect((await impersonate(other.uid, admin)).body.error).toBe('cannot_impersonate_admin')
    expect((await impersonate(me.uid, admin)).body.error).toBe('cannot_impersonate_self')
  })

  it('never crosses an organisation, and a lens cannot open a second lens', async () => {
    const stamp = Date.now()
    await createUser({ email: `root${stamp}@x.local`, password: 'password1', role: 'super_admin' })
    const root = (await login(`root${stamp}@x.local`, 'password1')).body.token
    const orgA = (await call('POST', '/organizations', { name: 'Org A', slug: `org-a-${stamp}` }, root)).body.organization
    const orgB = (await call('POST', '/organizations', { name: 'Org B', slug: `org-b-${stamp}` }, root)).body.organization
    const adminA = (await call('POST', '/users', { email: `admin-a-${stamp}@kata.local`, password: 'password1', role: 'admin', organizationId: orgA.id }, root)).body.user
    const refB = (await call('POST', '/users', { email: `ref-b-${stamp}@kata.local`, password: 'password1', role: 'referee', organizationId: orgB.id }, root)).body.user
    const tokenA = (await login(adminA.email, 'password1')).body.token

    // An org-scoped admin cannot reach an account outside their organisation.
    expect((await impersonate(refB.uid, tokenA, 'password1')).body.error).toBe('organization_forbidden')

    // No chaining: a lens cannot open a second lens, on a different target.
    // (A referee-shaped lens already fails the ordinary admin-role gate on
    // this route; the explicit impersonatedBy check behind it is what would
    // still hold if that stopped being true for some future target role.)
    const refA = (await call('POST', '/users', { email: `ref-a-${stamp}@kata.local`, password: 'password1', role: 'referee', organizationId: orgA.id }, root)).body.user
    const refA2 = (await call('POST', '/users', { email: `ref-a2-${stamp}@kata.local`, password: 'password1', role: 'referee', organizationId: orgA.id }, root)).body.user
    const lens = (await impersonate(refA.uid, tokenA, 'password1')).body.token
    expect((await call('POST', `/users/${refA2.uid}/impersonate`, { password: 'password1' }, lens)).status).toBe(403)
  })

  it('asks for a second factor when the admin has one, same as signing in', async () => {
    // Its own admin, not the shared seeded one: 2FA enabled here must not
    // outlive this test and break admin@kata.local for the tests after it.
    const stamp = Date.now()
    const seedAdmin = (await login('admin@kata.local')).body.token
    await call('POST', '/users', { email: `admin4-${stamp}@kata.local`, password: 'password1', role: 'admin' }, seedAdmin)
    const admin = (await login(`admin4-${stamp}@kata.local`, 'password1')).body.token
    const ref = (await call('POST', '/users', { email: `ref4-${stamp}@kata.local`, password: 'password1', role: 'referee' }, admin)).body.user
    const { body: setup } = await call('POST', '/auth/2fa/setup', {}, admin)
    await call('POST', '/auth/2fa/enable', { code: totp(setup.secret) }, admin)

    expect((await impersonate(ref.uid, admin, 'password1')).body.error).toBe('two_factor_required')
    expect((await impersonate(ref.uid, admin, 'password1', '000000')).body.error).toBe('invalid_two_factor')
    expect((await impersonate(ref.uid, admin, 'password1', totp(setup.secret))).status).toBe(200)
  })

  it('ends when the admin\'s own session ends, not only when the lens is told to end', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: `ref5-${Date.now()}@kata.local`, password: 'password1', role: 'referee' }, admin)).body.user
    const lens = (await impersonate(ref.uid, admin)).body.token
    expect((await call('GET', '/auth/me', undefined, lens)).status).toBe(200)

    // The admin's own session ends (signed out elsewhere, access pulled) —
    // every lens opened with it stops working too, well before its 30-minute
    // token would otherwise expire.
    await call('POST', '/auth/logout', undefined, admin)
    expect((await call('GET', '/auth/me', undefined, lens)).body.error).toBe('session_revoked')
  })

  it('limits how often one admin may open a lens', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: `ref6-${Date.now()}@kata.local`, password: 'password1', role: 'referee' }, admin)).body.user
    const attempts = await Promise.all(Array.from({ length: 15 }, () => impersonate(ref.uid, admin, 'wrong-password')))
    expect(attempts.some((a) => a.status === 429)).toBe(true)
  })
})
