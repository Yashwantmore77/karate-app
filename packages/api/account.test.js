import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { readOutbox, clearOutbox } from './lib/mailer.js'
import { totp } from './auth/totp.js'

let http, port, admin

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123', code) => call('POST', '/auth/login', { email, password, ...(code ? { code } : {}) })

beforeEach(async () => {
  const app = createApp()
  http = app.http
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  admin = (await login('admin@kata.local')).body.token
  clearOutbox()
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

describe('PRD section 4: accounts', () => {
  it('limits an account to its assigned tournaments', async () => {
    const a = (await call('POST', '/tournaments', { name: 'Cup A', location: 'X', date: '2027-01-01', template: 'kumite' }, admin)).body.tournament
    const b = (await call('POST', '/tournaments', { name: 'Cup B', location: 'X', date: '2027-01-01', template: 'kumite' }, admin)).body.tournament
    const { body: { user } } = await call('POST', '/users', { email: 'officer.a@kata.local', password: 'password1', role: 'registration_officer', tournamentIds: [a.id] }, admin)
    const officer = (await login('officer.a@kata.local', 'password1')).body.token
    expect((await call('GET', '/tournaments', undefined, officer)).body.tournaments.map((t) => t.id)).toEqual([a.id])
    expect((await call('GET', `/tournaments/${a.id}/players`, undefined, officer)).status).toBe(200)
    expect((await call('GET', `/tournaments/${b.id}/players`, undefined, officer)).body.error).toBe('tournament_forbidden')
    expect((await call('GET', `/tournaments/${b.id}`, undefined, officer)).status).toBe(403)
    // taking the assignment away (empty = all) applies at once, no new token
    await call('PATCH', `/users/${user.uid}`, { tournamentIds: [b.id] }, admin)
    expect((await call('GET', `/tournaments/${a.id}/players`, undefined, officer)).status).toBe(403)
  })

  it('resets a forgotten password through an emailed one-time link', async () => {
    expect((await call('POST', '/auth/forgot', { email: 'nobody@kata.local' })).body).toEqual({ ok: true })
    expect(readOutbox()).toHaveLength(0)
    await call('POST', '/auth/forgot', { email: 'referee@kata.local' })
    const [mail] = readOutbox()
    expect(mail.to).toBe('referee@kata.local')
    const token = mail.text.match(/token=([a-f0-9]+)/)[1]
    expect((await call('POST', '/auth/reset', { token, password: 'short' })).status).toBe(400)
    expect((await call('POST', '/auth/reset', { token, password: 'a-new-password' })).body).toEqual({ ok: true })
    expect((await call('POST', '/auth/reset', { token, password: 'another-one' })).body.error).toBe('invalid_or_expired_token')
    expect((await login('referee@kata.local')).status).toBe(401)
    expect((await login('referee@kata.local', 'a-new-password')).status).toBe(200)
    await call('POST', '/auth/forgot', { email: 'referee@kata.local' })
    const again = readOutbox()[1].text.match(/token=([a-f0-9]+)/)[1]
    await call('POST', '/auth/reset', { token: again, password: 'test123' })
  })

  it('adds an optional second factor to an admin sign-in', async () => {
    const { body: setup } = await call('POST', '/auth/2fa/setup', {}, admin)
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//)
    expect((await call('POST', '/auth/2fa/enable', { code: '000000' }, admin)).status).toBe(400)
    expect((await call('POST', '/auth/2fa/enable', { code: totp(setup.secret) }, admin)).body).toEqual({ twoFactorEnabled: true })

    expect((await login('admin@kata.local')).body.error).toBe('two_factor_required')
    expect((await login('admin@kata.local', 'test123', '123456')).body.error).toBe('invalid_two_factor')
    const ok = await login('admin@kata.local', 'test123', totp(setup.secret))
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).not.toMatch(/twoFactorSecret|passwordHash/)
    expect((await call('GET', '/users', undefined, ok.body.token)).body.users.find((u) => u.email === 'admin@kata.local'))
      .toMatchObject({ twoFactorEnabled: true })

    await call('POST', '/auth/2fa/disable', { code: totp(setup.secret) }, ok.body.token)
    expect((await login('admin@kata.local')).status).toBe(200)
  })
})
