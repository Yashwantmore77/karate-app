import { describe, it, expect } from 'vitest'
import { matQueues } from './matQueues'

const bout = (n, mat, extra = {}) => ({ id: `m${n}`, matchNumber: `M-0${n}`, mat, status: 'scheduled', event: 'kumite', aka: `Aka ${n}`, ao: `Ao ${n}`, ...extra })
const ids = (q) => ({ mat: q.mat, now: q.now?.id ?? null, next: q.next.map((m) => m.id) })

describe('every mat queue (KAN-428)', () => {
  it('lists the bouts still to come of the event on the mats, mat by mat in match-number order', () => {
    const matches = [
      bout(12, 2), bout(3, 1, { status: 'live' }), bout(10, 1), bout(4, 1, { status: 'completed' }), bout(5, 1, { status: 'cancelled' }),
      bout(6, 1, { event: 'kata' }), bout(7, 1, { ao: null }), bout(8, 3, { event: 'kata' }), bout(9),
    ]
    expect(matQueues(matches, 'kumite').map(ids)).toEqual([
      // A bout with no mat is on mat 1; one still waiting for a fighter is not listed.
      { mat: 1, now: 'm3', next: ['m9', 'm10'] },
      { mat: 2, now: null, next: ['m12'] },
    ])
    // With no event on the mats, every bout counts.
    expect(matQueues(matches).map((q) => q.mat)).toEqual([1, 2, 3])
  })

  it('puts on the mat the bout its scoreboard shows, else the one being fought, rather than the lowest number', () => {
    const matches = [bout(1, 1, { status: 'open' }), bout(2, 1, { status: 'paused' }), bout(3, 1, { status: 'live' }), bout(4, 1)]
    expect(ids(matQueues(matches)[0])).toEqual({ mat: 1, now: 'm3', next: ['m1', 'm2', 'm4'] })
    expect(matQueues(matches.filter((m) => m.id !== 'm3'))[0].now.id).toBe('m2')
    expect(matQueues(matches, null, (m) => m.id === 'm1')[0].now.id).toBe('m1')
  })
})
