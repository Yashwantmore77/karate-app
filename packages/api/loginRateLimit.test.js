import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './index.js'

let app, port, previousTrustProxy

const login = (email, ip) => fetch(`http://localhost:${port}/api/v1/auth/login`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  },
  body: JSON.stringify({ email, password: 'wrong-password' }),
})

beforeEach(async () => {
  previousTrustProxy = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = 'loopback'
  app = createApp()
  port = await new Promise((resolve) => app.http.listen(0, () => resolve(app.http.address().port)))
})

afterEach(async () => {
  if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = previousTrustProxy
  await new Promise((resolve) => app.http.close(resolve))
})

describe('login rate limits', () => {
  it('limits guesses for one account across different source addresses', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login('referee@kata.local', `198.51.100.${attempt + 1}`)).status).toBe(401)
    }

    expect((await login('referee@kata.local', '198.51.100.11')).status).toBe(429)
  })
})
