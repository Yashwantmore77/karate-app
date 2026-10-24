import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { createUser } from './auth/users.js'

// KAN-429: an admin opening a lens into another account — for support, or to
// see exactly what someone else sees — in one click, in a tab of its own,
// without that being an unconditional, unlogged way to reach every account
// in reach. No password or 2FA step by design (a deliberate product
// decision); what stands in for it is: never another admin, never the
// admin's own account, no chaining, never outside the organisation, a real
// revocable 30-minute session, a rate limit, and every write attributed to
// both identities.

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
const impersonate = (uid, admin) => call('POST', `/users/${uid}/impersonate`, {}, admin)
const redeem = (ticket) => call('POST', '/users/impersonate/exchange', { ticket })
/** The whole flow: click Impersonate, open the new tab, it redeems the ticket. Returns the lens token, or the refusal body. */
const openLens = async (uid, admin) => {
  const started = await impersonate(uid, admin)
  if (started.status !== 200) return started
  return redeem(started.body.ticket)
}

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('admin impersonation (KAN-429)', () => {
  it('opens a lens with exactly the target\'s own reach, logged as both of them, and ends it from inside the lens', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: 'ref1@kata.local', password: 'password1', role: 'referee' }, admin)).body.user

    const { status, body } = await openLens(ref.uid, admin)
    expect(status).toBe(200)
    expect(body.user).toMatchObject({ uid: ref.uid, role: 'referee' })
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|twoFactorSecret/)
    const lens = body.token

    // The lens carries the referee's own reach, not the admin's: an
    // admin-only route refuses it exactly as it would refuse any referee.
    expect((await call('GET', '/users', undefined, lens)).status).toBe(403)
    expect((await call('GET', '/auth/me', undefined, lens)).body.user).toMatchObject({ uid: ref.uid, role: 'referee' })

    // Ending it from outside the lens (the admin's own token) is refused:
    // only the session itself may end itself.
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

  it('redeems a ticket once: a second redemption, or a ticket that never existed, is refused', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: `ref-tk-${Date.now()}@kata.local`, password: 'password1', role: 'referee' }, admin)).body.user
    const { ticket } = (await impersonate(ref.uid, admin)).body

    expect((await redeem(ticket)).status).toBe(200)
    expect((await redeem(ticket)).body.error).toBe('ticket_expired')
    expect((await redeem('not-a-real-ticket')).body.error).toBe('ticket_expired')
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
    expect((await impersonate(refB.uid, tokenA)).body.error).toBe('organization_forbidden')

    // No chaining: a lens cannot open a second lens, on a different target.
    // (A referee-shaped lens already fails the ordinary admin-role gate on
    // this route; the explicit impersonatedBy check behind it is what would
    // still hold if that stopped being true for some future target role.)
    const refA = (await call('POST', '/users', { email: `ref-a-${stamp}@kata.local`, password: 'password1', role: 'referee', organizationId: orgA.id }, root)).body.user
    const refA2 = (await call('POST', '/users', { email: `ref-a2-${stamp}@kata.local`, password: 'password1', role: 'referee', organizationId: orgA.id }, root)).body.user
    const lens = (await openLens(refA.uid, tokenA)).body.token
    expect((await impersonate(refA2.uid, lens)).status).toBe(403)
  })

  it('ends when the admin\'s own session ends, not only when the lens is told to end', async () => {
    const admin = (await login('admin@kata.local')).body.token
    const ref = (await call('POST', '/users', { email: `ref5-${Date.now()}@kata.local`, password: 'password1', role: 'referee' }, admin)).body.user
    const lens = (await openLens(ref.uid, admin)).body.token
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
    const attempts = await Promise.all(Array.from({ length: 15 }, () => impersonate(ref.uid, admin)))
    expect(attempts.some((a) => a.status === 429)).toBe(true)
  })
})
