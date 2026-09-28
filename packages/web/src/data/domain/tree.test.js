import { describe, it, expect } from 'vitest'
import { isAssignedTo } from './tree'

describe('isAssignedTo', () => {
  it('counts a judge sitting on the panel', () => {
    expect(isAssignedTo({ judgeIds: ['j1', 'j2'] }, 'j1')).toBe(true)
  })

  it('counts the referee on the bout', () => {
    expect(isAssignedTo({ refereeId: 'r1', judgeIds: [] }, 'r1')).toBe(true)
  })

  it('excludes someone who is on neither', () => {
    expect(isAssignedTo({ refereeId: 'r1', judgeIds: ['j1'] }, 'j9')).toBe(false)
  })

  it('treats a bout with nobody on it as everybody\'s', () => {
    // Schedules are built before panels are, so hiding unassigned bouts would
    // leave a judge with an empty screen on the day.
    expect(isAssignedTo({}, 'j1')).toBe(true)
    expect(isAssignedTo({ judgeIds: [] }, 'j1')).toBe(true)
    expect(isAssignedTo({ refereeId: null, judgeIds: [] }, 'j1')).toBe(true)
  })

  it('shows everything when there is no signed-in id to match', () => {
    expect(isAssignedTo({ refereeId: 'r1', judgeIds: ['j1'] }, undefined)).toBe(true)
  })

  it('does not let a referee-only assignment hide the bout from that referee', () => {
    expect(isAssignedTo({ refereeId: 'r1' }, 'r1')).toBe(true)
    expect(isAssignedTo({ refereeId: 'r1' }, 'j1')).toBe(false)
  })
})
