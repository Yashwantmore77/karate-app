import { describe, it, expect } from 'vitest'
import {
  makeMatchState, awardPoint, deductPoint, setSenshu, setPenalty,
  evaluateOutcome, hasHansoku, leader, scoreGap, DEFAULT_RULES, POINTS
} from './rules'

const expired = { expired: true }

describe('scoring', () => {
  it('awards the WKF point values', () => {
    expect(POINTS).toEqual({ ippon: 3, wazaAri: 2, yuko: 1 })
  })

  it('adds points to one side only', () => {
    const state = awardPoint(makeMatchState(), 'ao', 'ippon')
    expect(state.scores).toEqual({ ao: 3, aka: 0 })
  })

  it('accumulates across techniques', () => {
    let state = makeMatchState()
    state = awardPoint(state, 'aka', 'yuko')
    state = awardPoint(state, 'aka', 'wazaAri')
    expect(state.scores.aka).toBe(3)
  })

  it('ignores an unknown technique', () => {
    const state = makeMatchState()
    expect(awardPoint(state, 'ao', 'nonsense')).toBe(state)
  })

  it('deducts a point but never below zero', () => {
    let state = awardPoint(makeMatchState(), 'ao', 'yuko')
    state = deductPoint(state, 'ao')
    expect(state.scores.ao).toBe(0)
    expect(deductPoint(state, 'ao').scores.ao).toBe(0)
  })
})

describe('senshu', () => {
  it('goes to whoever scores first and does not move after', () => {
    let state = awardPoint(makeMatchState(), 'aka', 'yuko')
    expect(state.senshu).toBe('aka')
    state = awardPoint(state, 'ao', 'ippon')
    expect(state.senshu).toBe('aka')
  })

  it('can be set and cleared by hand for a referee override', () => {
    let state = setSenshu(makeMatchState(), 'ao')
    expect(state.senshu).toBe('ao')
    expect(setSenshu(state, 'ao').senshu).toBeNull()
    expect(setSenshu(state, 'aka').senshu).toBe('aka')
  })
})

describe('penalties', () => {
  it('sets a level and fills the ladder up to it', () => {
    const state = setPenalty(makeMatchState(), 'ao', 'c1', 3)
    expect(state.penalties.ao.c1).toBe(3)
  })

  it('steps back down when the current level is tapped again', () => {
    let state = setPenalty(makeMatchState(), 'ao', 'c1', 2)
    state = setPenalty(state, 'ao', 'c1', 2)
    expect(state.penalties.ao.c1).toBe(1)
  })

  it('keeps the two categories independent', () => {
    let state = setPenalty(makeMatchState(), 'aka', 'c1', 2)
    state = setPenalty(state, 'aka', 'c2', 1)
    expect(state.penalties.aka).toEqual({ c1: 2, c2: 1 })
    expect(state.penalties.ao).toEqual({ c1: 0, c2: 0 })
  })

  it('flags hansoku only at the top of the ladder', () => {
    const three = setPenalty(makeMatchState(), 'ao', 'c1', 3)
    expect(hasHansoku(three, 'ao')).toBe(false)
    const four = setPenalty(makeMatchState(), 'ao', 'c1', 4)
    expect(hasHansoku(four, 'ao')).toBe(true)
  })
})

describe('evaluateOutcome', () => {
  it('does not end a bout that is still running and close', () => {
    const state = awardPoint(makeMatchState(), 'ao', 'yuko')
    expect(evaluateOutcome(state, DEFAULT_RULES)).toEqual({
      ended: false, winner: null, method: null
    })
  })

  it('ends immediately on the point gap, without waiting for time', () => {
    let state = makeMatchState()
    for (let i = 0; i < 3; i++) state = awardPoint(state, 'aka', 'ippon')
    expect(scoreGap(state)).toBe(9)
    expect(evaluateOutcome(state, DEFAULT_RULES)).toEqual({
      ended: true, winner: 'aka', method: 'gapRule'
    })
  })

  it('does not apply the gap rule when it is disabled', () => {
    let state = makeMatchState()
    for (let i = 0; i < 3; i++) state = awardPoint(state, 'aka', 'ippon')
    const rules = { ...DEFAULT_RULES, pointGap: 0 }
    expect(evaluateOutcome(state, rules).ended).toBe(false)
  })

  it('awards the bout to the opponent on hansoku, beating the score', () => {
    let state = awardPoint(makeMatchState(), 'ao', 'ippon')
    state = setPenalty(state, 'ao', 'c2', 4)
    expect(evaluateOutcome(state, DEFAULT_RULES)).toEqual({
      ended: true, winner: 'aka', method: 'hansoku'
    })
  })

  it('gives the win to the higher score at time', () => {
    const state = awardPoint(makeMatchState(), 'ao', 'wazaAri')
    expect(evaluateOutcome(state, DEFAULT_RULES, expired)).toEqual({
      ended: true, winner: 'ao', method: 'points'
    })
  })

  it('breaks a tie at time with senshu', () => {
    let state = awardPoint(makeMatchState(), 'aka', 'wazaAri')
    state = awardPoint(state, 'ao', 'wazaAri')
    expect(state.senshu).toBe('aka')
    expect(evaluateOutcome(state, DEFAULT_RULES, expired)).toEqual({
      ended: true, winner: 'aka', method: 'senshu'
    })
  })

  it('reports a tie needing encho or hantei when nobody has senshu', () => {
    const state = makeMatchState()
    expect(evaluateOutcome(state, DEFAULT_RULES, expired)).toEqual({
      ended: true, winner: null, method: 'tieBreak'
    })
  })

  it('falls through to a tie break when senshu is disabled', () => {
    let state = awardPoint(makeMatchState(), 'aka', 'yuko')
    state = awardPoint(state, 'ao', 'yuko')
    const rules = { ...DEFAULT_RULES, senshu: false }
    expect(evaluateOutcome(state, rules, expired).method).toBe('tieBreak')
  })
})

describe('helpers', () => {
  it('reports the leader, or nobody when level', () => {
    expect(leader(makeMatchState())).toBeNull()
    expect(leader(awardPoint(makeMatchState(), 'ao', 'yuko'))).toBe('ao')
  })
})
