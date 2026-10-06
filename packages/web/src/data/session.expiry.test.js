import { describe, it, expect } from 'vitest'
import { tokenExpiresAt } from './session'

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
