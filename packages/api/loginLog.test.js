import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { flushLoginLog, resetLoginLog } from './auth/loginLog.js'

let http, port

const listen = () =>
  new Promise((resolve) => {
    const app = createApp()
    http = app.http
    http.listen(0, () => resolve(http.address().port))
  })

const login = (email, password = 'test123', extra = {}, headers = {}) =>
  fetch(`http://localhost:${port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password, ...extra }),
  })

const tokenFor = async (email) => (await (await login(email)).json()).token

const readLog = async (query = '', existingToken) => {
  const token = existingToken ?? (await tokenFor('admin@kata.local'))
  await flushLoginLog()
  const response = await fetch(`http://localhost:${port}/api/v1/auth/logins${query}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

describe('login audit log', () => {
  beforeEach(async () => {
    resetLoginLog()
    port = await listen()
  })

  afterEach(async () => {
    await flushLoginLog()
    await new Promise((resolve) => http.close(resolve))
  })

  it('records a successful sign-in with who, when and from where', async () => {
    await login('referee@kata.local')
    await flushLoginLog()

    const { body } = await readLog('?email=referee@kata.local')
    expect(body.logins).toHaveLength(1)

    const [entry] = body.logins
    expect(entry).toMatchObject({
      outcome: 'success',
      email: 'referee@kata.local',
      uid: 'ref-uid-001',
      role: 'referee',
    })
    expect(entry.ip).toBeTruthy()
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false)
    // Loopback resolves to no country, and no lookup runs for a private address.
    expect(entry.geo).toBeNull()
  })

  it('records a rejected attempt without storing the password that was tried', async () => {
    const response = await login('admin@kata.local', 'wrong-password')
    expect(response.status).toBe(401)
    await flushLoginLog()

    const { body } = await readLog('?outcome=invalid_credentials')
    const [entry] = body.logins
    expect(entry).toMatchObject({ outcome: 'invalid_credentials', email: 'admin@kata.local', uid: null })
    expect(JSON.stringify(entry)).not.toContain('wrong-password')
  })

  it('keeps an attempt on an address that has no account', async () => {
    await login('nobody@kata.local', 'test123')
    await flushLoginLog()

    const { body } = await readLog('?email=nobody@kata.local')
    expect(body.logins[0]).toMatchObject({ outcome: 'invalid_credentials', uid: null, role: null })
  })

  it('stores browser coordinates as a separate, self-reported claim', async () => {
    await login('judge1@kata.local', 'test123', {
      coords: { latitude: 19.076, longitude: 72.8777, accuracy: 35.4 },
    })
    await flushLoginLog()

    const { body } = await readLog('?email=judge1@kata.local')
    expect(body.logins[0].browserCoords).toEqual({
      source: 'browser',
      latitude: 19.076,
      longitude: 72.8777,
      accuracyM: 35,
    })
  })

  it('drops malformed coordinates rather than failing the sign-in', async () => {
    const response = await login('judge2@kata.local', 'test123', {
      coords: { latitude: 'somewhere', longitude: 999 },
    })
    expect(response.status).toBe(200)
    await flushLoginLog()

    const { body } = await readLog('?email=judge2@kata.local')
    expect(body.logins[0].browserCoords).toBeNull()
  })

  it('records the attempts the rate limiter turns away', async () => {
    // The limiter keys on the address, and every request here shares one, so the
    // token to read the log with has to be taken before the window is used up.
    const token = await tokenFor('admin@kata.local')

    // Ten are allowed per window; the rest never reach the handler.
    for (let i = 0; i < 11; i += 1) await login('referee@kata.local', 'wrong-password')
    await flushLoginLog()

    const { body } = await readLog('?outcome=rate_limited', token)
    expect(body.logins.length).toBeGreaterThanOrEqual(1)
    expect(body.logins[0]).toMatchObject({ outcome: 'rate_limited', email: 'referee@kata.local' })
  })

  it('reads newest first and honours the requested size', async () => {
    await login('judge3@kata.local')
    await login('judge4@kata.local')
    await flushLoginLog()

    const { body } = await readLog('?limit=1')
    expect(body.logins).toHaveLength(1)
    expect(body.logins[0].email).toBe('admin@kata.local')
  })

  it('refuses the log to everyone but an administrator', async () => {
    const token = await tokenFor('judge1@kata.local')
    const response = await fetch(`http://localhost:${port}/api/v1/auth/logins`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(403)

    const anonymous = await fetch(`http://localhost:${port}/api/v1/auth/logins`)
    expect(anonymous.status).toBe(401)
  })
})

describe('login rate limiting', () => {
  beforeEach(async () => {
    resetLoginLog()
    port = await listen()
  })

  afterEach(async () => {
    await flushLoginLog()
    await new Promise((resolve) => http.close(resolve))
  })

  it('locks out one account without locking out the rest of the room', async () => {
    // Every request here shares one address, which is the venue-NAT case: ten
    // wrong guesses at the referee's account must not cost a judge their sign-in.
    for (let i = 0; i < 11; i += 1) await login('referee@kata.local', 'wrong-password')

    const blocked = await login('referee@kata.local')
    expect(blocked.status).toBe(429)

    const neighbour = await login('judge1@kata.local')
    expect(neighbour.status).toBe(200)
  })

  it('still stops one password being sprayed across many accounts', async () => {
    // Under the per-address ceiling, spread thin enough that no single account
    // ever reaches its own limit.
    const statuses = []
    for (let i = 0; i < 62; i += 1) {
      const response = await login(`nobody${i}@kata.local`, 'common-password')
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
    // Each unknown address costs a deliberate scrypt hash, so sixty of them
    // take a while; that slowness is the point of it, not a problem to fix.
  }, 60_000)
})
