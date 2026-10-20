import { describe, it, expect } from 'vitest'
import { tokenExpiresAt, loginToServer } from './session'

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')

describe('token expiry', () => {
  it('reads exp from a JWT payload', () => {
    expect(tokenExpiresAt(`h.${b64({ exp: 1_800_000_000 })}.s`)).toBe(1_800_000_000_000)
  })
  it('gives up quietly on anything else', () => {
    expect(tokenExpiresAt(null)).toBeNull()
    expect(tokenExpiresAt('not-a-token')).toBeNull()
    expect(tokenExpiresAt('a.%%%.b')).toBeNull()
  })
})

describe('signing in without a server address', () => {
  it('names the missing setting, so the page can say so', async () => {
    // .env.test leaves VITE_SERVER_URL empty, as a build without it would.
    await expect(loginToServer('ref@club.test', 'correct horse')).rejects.toMatchObject({ code: 'no_server_url' })
  })
})
