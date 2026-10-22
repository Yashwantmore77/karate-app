import { describe, it, expect } from 'vitest'
import { isExpired } from './dateUtils'

describe('dateUtils', () => {
  describe('isExpired', () => {
    it('returns true for a date in the past', () => {
      expect(isExpired('2020-01-01')).toBe(true)
    })

    it('returns false for a date in the future', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      expect(isExpired(future.toISOString().split('T')[0])).toBe(false)
    })

    it('does not treat today as expired', () => {
      // Today on the local calendar (the tests run in India time): the UTC
      // date is still yesterday between midnight and 05:30 (KAN-426).
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      expect(isExpired(today)).toBe(false)
    })

    it('returns false for a falsy/missing date', () => {
      expect(isExpired(null)).toBe(false)
      expect(isExpired(undefined)).toBe(false)
      expect(isExpired('')).toBe(false)
    })
  })

})
