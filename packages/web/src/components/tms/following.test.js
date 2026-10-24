import { describe, it, expect } from 'vitest'
import { athleteStatus } from './following'
import { matQueues } from './matQueues'

// Meera (p1) and her bouts, on two mats, in a Kata + Kumite tournament with Kumite on the mats.
const bout = (n, mat, akaId, aoId, extra = {}) => ({
  id: `m${n}`, matchNumber: `M-0${n}`, mat, status: 'scheduled', event: 'kumite', akaId, aoId, aka: `Aka ${n}`, ao: `Ao ${n}`, akaScore: null, aoScore: null, winner: null, ...extra,
})
const status = (matches, id = 'p1') => athleteStatus(id, matches, matQueues(matches, 'kumite'))

describe('where a followed athlete stands (KAN-428)', () => {
  it('names the bout on a mat now, and who it is against', () => {
    const s = status([bout(10, 1, 'x', 'p1', { status: 'live', aka: 'Diya' }), bout(11, 1, 'p1', 'y')])
    expect(s.now).toMatchObject({ mat: 1, side: 'ao', against: 'Diya', bout: { id: 'm10' } })
  })

  it('counts the bouts a mat fights before her next one, the one on the mat included; the soonest across mats', () => {
    const matches = [
      bout(1, 1, 'a', 'b', { status: 'live' }), bout(2, 1, 'c', 'd'), bout(3, 1, 'p1', 'e', { ao: 'Isha', calledAt: '2026-10-23T09:00:00Z' }),
      bout(4, 2, 'f', 'g'), bout(5, 2, 'h', 'i'), bout(6, 2, 'j', 'k'), bout(7, 2, 'p1', 'l'),
    ]
    expect(status(matches).next).toMatchObject({ mat: 1, ahead: 2, against: 'Isha', bout: { id: 'm3', calledAt: expect.any(String) } })
    expect(status(matches).now).toBeNull()
    // Next on the mat: nothing before it.
    expect(status([bout(8, 3, 'p1', 'z')]).next).toMatchObject({ mat: 3, ahead: 0 })
  })

  it('names a bout of the event not on the mats yet, rather than a place in a queue', () => {
    const s = status([bout(20, 2, 'p1', 'q', { event: 'kata' }), bout(21, 2, 'r', 's')])
    expect(s.next).toBeNull()
    expect(s.later).toMatchObject({ mat: 2, bout: { id: 'm20', event: 'kata' } })
  })

  it('gives her latest result from her side: won, lost or drawn, her score first', () => {
    const done = (n, akaId, aoId, winner, akaScore, aoScore) => bout(n, 1, akaId, aoId, { status: 'completed', winner, akaScore, aoScore })
    expect(status([done(1, 'p1', 'x', 'red', 3, 1)]).latest).toMatchObject({ result: 'Won', score: '3–1', against: 'Ao 1' })
    expect(status([done(1, 'x', 'p1', 'red', 3, 1)]).latest).toMatchObject({ result: 'Lost', score: '1–3', against: 'Aka 1' })
    expect(status([done(1, 'x', 'p1', null, 2, 2)]).latest).toMatchObject({ result: 'Draw', score: '2–2' })
    // The last one fought, not the first.
    expect(status([done(2, 'p1', 'x', 'blue', 0, 4), done(1, 'p1', 'x', 'red', 5, 0)]).latest).toMatchObject({ result: 'Lost', bout: { id: 'm2' } })
  })

  it('says when she has no bout to come, or no bouts at all', () => {
    const s = status([bout(1, 1, 'p1', 'x', { status: 'completed', winner: 'red' }), bout(2, 1, 'p1', 'y', { status: 'cancelled' })])
    expect(s).toMatchObject({ now: null, next: null, later: null, bouts: 2 })
    expect(status([bout(1, 1, 'x', 'y')])).toMatchObject({ now: null, next: null, later: null, latest: null, bouts: 0 })
  })
})
