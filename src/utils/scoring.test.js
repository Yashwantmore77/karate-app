import { describe, it, expect } from 'vitest'
import { getScoreSpread, hasDisagreement, DISAGREEMENT_THRESHOLD } from './scoring'

describe('scoring - judge disagreement', () => {
  it('returns 0 spread for fewer than 2 scores', () => {
    expect(getScoreSpread([])).toBe(0)
    expect(getScoreSpread([8.0])).toBe(0)
  })

  it('computes the max-min spread across judge scores', () => {
    expect(getScoreSpread([8.0, 7.5, 8.2, 7.8])).toBeCloseTo(0.7)
  })

  it('flags disagreement when spread exceeds the threshold', () => {
    expect(hasDisagreement([9.5, 6.0])).toBe(true)
  })

  it('does not flag disagreement when spread is within the threshold', () => {
    expect(hasDisagreement([8.0, 7.5, 8.2])).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(hasDisagreement([8.0, 7.0], 0.5)).toBe(true)
    expect(hasDisagreement([8.0, 7.0], DISAGREEMENT_THRESHOLD)).toBe(false)
  })
})
