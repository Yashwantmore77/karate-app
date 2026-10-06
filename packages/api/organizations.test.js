import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { createUser } from './auth/users.js'

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

describe('organisations (PRD point 33)', () => {
  it('keeps each organisation to its own tournaments and accounts', async () => {
    const stamp = Date.now()
    await createUser({ email: `root${stamp}@x.local`, password: 'password1', role: 'super_admin' })
    const root = await login(`root${stamp}@x.local`, 'password1')
    const admin = await login('admin@kata.local')

    expect((await call('GET', '/organizations', undefined, admin)).status).toBe(403)
    const a = (await call('POST', '/organizations', { name: 'Maharashtra KA', slug: `mka-${stamp}` }, root)).body.organization
    const b = (await call('POST', '/organizations', { name: 'Goa KA', slug: `gka-${stamp}` }, root)).body.organization
    expect((await call('POST', '/organizations', { name: 'Dup', slug: `mka-${stamp}` }, root)).status).toBe(409)

    await call('POST', '/users', { email: `a${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: a.id }, root)
    await call('POST', '/users', { email: `b${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: b.id }, root)
    const adminA = await login(`a${stamp}@x.local`, 'password1')
    const adminB = await login(`b${stamp}@x.local`, 'password1')

    const t = { location: 'Pune', date: '2027-01-15', template: 'kumite' }
    const ta = (await call('POST', '/tournaments', { ...t, name: 'A Open' }, adminA)).body.tournament
    expect(ta.organizationId).toBe(a.id)
    const tb = (await call('POST', '/tournaments', { ...t, name: 'B Open' }, adminB)).body.tournament

    expect((await call('GET', '/tournaments', undefined, adminA)).body.tournaments.map((x) => x.name)).toEqual(['A Open'])
    expect((await call('GET', `/tournaments/${tb.id}`, undefined, adminA)).status).toBe(403)
    expect((await call('GET', `/tournaments/${tb.id}/divisions`, undefined, adminA)).status).toBe(403)
    expect((await call('GET', `/tournaments/${ta.id}`, undefined, adminA)).status).toBe(200)
    // accounts outside any organisation, and the super admin, still see everything
    expect((await call('GET', `/tournaments/${tb.id}`, undefined, admin)).status).toBe(200)

    // an organisation's admin creates accounts only inside it
    const made = (await call('POST', '/users', { email: `r${stamp}@x.local`, password: 'password1', role: 'referee' }, adminA)).body.user
    expect(made.organizationId).toBe(a.id)
    expect((await call('POST', '/users', { email: `s${stamp}@x.local`, password: 'password1', role: 'super_admin' }, adminA)).status).toBe(403)
    expect((await call('POST', '/users', { email: `z${stamp}@x.local`, password: 'password1', role: 'referee', organizationId: b.id }, adminA)).status).toBe(403)
    const listed = (await call('GET', '/users', undefined, adminA)).body.users.map((u) => u.email)
    expect(listed.sort()).toEqual([`a${stamp}@x.local`, `r${stamp}@x.local`])
    const other = (await call('GET', '/users?limit=100', undefined, root)).body.users.find((u) => u.email === `b${stamp}@x.local`)
    expect((await call('DELETE', `/users/${other.uid}`, undefined, adminA)).status).toBe(403)

    const orgs = (await call('GET', '/organizations', undefined, root)).body.organizations
    expect(orgs.find((o) => o.id === a.id)).toMatchObject({ tournaments: 1, accounts: 2 })
    expect((await call('DELETE', `/organizations/${a.id}`, undefined, root)).status).toBe(409)
    expect((await call('GET', '/organizations/mine', undefined, adminA)).body.organization.name).toBe('Maharashtra KA')
  })
})
