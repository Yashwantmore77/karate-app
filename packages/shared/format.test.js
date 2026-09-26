import { describe, it, expect } from 'vitest'
import { formatClock, parseDuration, toMinutesSeconds } from './format'

describe('formatClock', () => {
  it('formats whole minutes and seconds', () => {
    expect(formatClock(90_000)).toBe('1:30')
    expect(formatClock(60_000)).toBe('1:00')
    expect(formatClock(5_000)).toBe('0:05')
    expect(formatClock(0)).toBe('0:00')
  })

  it('rounds up, so the full duration shows until a second has actually passed', () => {
    expect(formatClock(90_000)).toBe('1:30')
    expect(formatClock(89_999)).toBe('1:30')
    expect(formatClock(89_001)).toBe('1:30')
    expect(formatClock(89_000)).toBe('1:29')
  })

  it('shows 0:00 only at zero, never for a fraction of a second left', () => {
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
  })

  it('clamps negatives rather than printing them', () => {
    expect(formatClock(-5_000)).toBe('0:00')
  })

  it('agrees with itself for two devices a few milliseconds apart', () => {
    // the whole point: same ms in, same string out, everywhere
    expect(formatClock(134_820)).toBe(formatClock(134_820))
    expect(formatClock(134_820)).toBe('2:15')
  })
})

describe('duration helpers', () => {
  it('builds a duration from minutes and seconds', () => {
    expect(parseDuration(1, 30)).toBe(90_000)
    expect(parseDuration(3, 0)).toBe(180_000)
  })

  it('clamps out-of-range parts', () => {
    expect(parseDuration(-1, 90)).toBe(59_000)
  })

  it('splits a duration back into parts', () => {
    expect(toMinutesSeconds(90_000)).toEqual({ minutes: 1, seconds: 30 })
    expect(toMinutesSeconds(0)).toEqual({ minutes: 0, seconds: 0 })
  })
})
