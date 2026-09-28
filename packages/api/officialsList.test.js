import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'

let http, port, tokens

const call = async (path, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  return { status: res.status, payload: await res.json().catch(() => null) }
}

const login = async (email) => {
  const res = await fetch(`http://localhost:${port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123' }),
  })
  return (await res.json()).token
}

beforeEach(async () => {
  port = await new Promise((resolve) => {
    http = createApp().http
    http.listen(0, () => resolve(http.address().port))
  })
  tokens = {
    admin: await login('admin@kata.local'),
    referee: await login('referee@kata.local'),
    judge: await login('judge1@kata.local'),
  }
})

afterEach(async () => {
  await new Promise((resolve) => http.close(resolve))
})

describe('GET /officials', () => {
  it('lets a referee read it, because building a panel is their work', async () => {
    const res = await call('/officials', tokens.referee)
    expect(res.status).toBe(200)
    expect(res.payload.officials.length).toBeGreaterThanOrEqual(6)
  })

  it('carries only what a picker needs', async () => {
    const { payload } = await call('/officials', tokens.referee)
    const official = payload.officials.find((o) => o.role === 'judge')
    expect(Object.keys(official).sort()).toEqual(['email', 'role', 'seat', 'uid'])
  })

  it('never exposes a password hash', async () => {
    const { payload } = await call('/officials', tokens.admin)
    expect(JSON.stringify(payload)).not.toMatch(/passwordHash/)
  })

  it('filters to one role', async () => {
    const judges = await call('/officials?role=judge', tokens.referee)
    expect(judges.payload.officials).toHaveLength(4)
    expect(judges.payload.officials.every((o) => o.role === 'judge')).toBe(true)

    const referees = await call('/officials?role=referee', tokens.referee)
    expect(referees.payload.officials.every((o) => o.role === 'referee')).toBe(true)
  })

  it('refuses a role that is not a thing', async () => {
    const res = await call('/officials?role=coach', tokens.referee)
    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_role')
  })

  it('keeps a judge out — they do not build panels', async () => {
    expect((await call('/officials', tokens.judge)).status).toBe(403)
  })

  it('refuses an unauthenticated caller', async () => {
    expect((await call('/officials')).status).toBe(401)
  })

  it('does not double as the account roster', async () => {
    // /users is where accounts are managed, and stays admin-only.
    expect((await call('/users', tokens.referee)).status).toBe(403)
  })
})
