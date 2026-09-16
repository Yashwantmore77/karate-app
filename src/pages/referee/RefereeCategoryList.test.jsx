import { describe, it, expect } from 'vitest'
import { isExpired } from '../../utils/dateUtils'

describe('RefereeCategoryList - default tournament selection', () => {
  it('auto-selects the first non-expired tournament, skipping an expired one that sorts first', () => {
    const tournaments = [
      { id: 't-old', date: '2020-01-01' },
      { id: 't-new', date: '2099-01-01' },
    ]
    const firstActive = tournaments.find(t => !isExpired(t.date)) || tournaments[0]
    expect(firstActive.id).toBe('t-new')
  })

  it('falls back to the first tournament when every tournament is expired', () => {
    const tournaments = [
      { id: 't-old-1', date: '2020-01-01' },
      { id: 't-old-2', date: '2019-01-01' },
    ]
    const firstActive = tournaments.find(t => !isExpired(t.date)) || tournaments[0]
    expect(firstActive.id).toBe('t-old-1')
  })
})
