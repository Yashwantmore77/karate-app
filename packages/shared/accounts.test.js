import { describe, it, expect } from 'vitest'
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_FIELD, passwordProblem } from './accounts.js'

describe('passwordProblem', () => {
  it('refuses a short password and accepts one at the limit', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN - 1))).toMatch(/at least 8/)
    expect(passwordProblem('a'.repeat(PASSWORD_MIN))).toBeNull()
  })

  // The form used to check only the lower bound, so a pasted password passed
  // here and was refused by the server with a "too short" message.
  it('refuses a password past the upper limit the server keeps', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MAX))).toBeNull()
    expect(passwordProblem('a'.repeat(PASSWORD_MAX + 1))).toMatch(/200 characters or fewer/)
  })

  it('treats a missing password as too short, not as a crash', () => {
    expect(passwordProblem(null)).toMatch(/at least 8/)
    expect(passwordProblem(undefined)).toMatch(/at least 8/)
  })

  it('hands the API the same bounds it tells the browser', () => {
    expect(PASSWORD_FIELD).toMatchObject({ min: PASSWORD_MIN, max: PASSWORD_MAX, trim: false })
  })
})
