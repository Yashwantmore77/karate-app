import { describe, it, expect } from 'vitest'
import { isExpired, formatDate } from './dateUtils'

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
      const today = new Date().toISOString().split('T')[0]
      expect(isExpired(today)).toBe(false)
    })

    it('returns false for a falsy/missing date', () => {
      expect(isExpired(null)).toBe(false)
      expect(isExpired(undefined)).toBe(false)
      expect(isExpired('')).toBe(false)
    })
  })

  describe('formatDate', () => {
    it('formats a dayjs-like object via its format method', () => {
      const dayjsLike = { format: (fmt) => '2026-05-01' }
      expect(formatDate(dayjsLike)).toBe('2026-05-01')
    })

    it('formats a native Date object to YYYY-MM-DD', () => {
      const date = new Date('2026-05-01T00:00:00.000Z')
      expect(formatDate(date)).toBe('2026-05-01')
    })

    it('formats a date string to YYYY-MM-DD', () => {
      expect(formatDate('2026-05-01T12:00:00.000Z')).toBe('2026-05-01')
    })

    it('returns null for falsy input', () => {
      expect(formatDate(null)).toBeNull()
      expect(formatDate(undefined)).toBeNull()
    })
  })
})
