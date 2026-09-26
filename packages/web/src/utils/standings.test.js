import { describe, it, expect } from 'vitest'
import { computeStandings } from './standings'

const competitors = [
  { id: 'c1', bib: '1', name: 'Alice' },
  { id: 'c2', bib: '2', name: 'Bob' },
  { id: 'c3', bib: '3', name: 'Carla' },
]

describe('standings - per-competitor aggregation', () => {
  it('ignores matches that are not completed', () => {
    const matches = [{ id: 'm1', redId: 'c1', blueId: 'c2', status: 'open' }]
    const standings = computeStandings(competitors, matches)
    standings.forEach((row) => expect(row.played).toBe(0))
  })

  it('tallies a win and a loss for a decisive match', () => {
    const matches = [
      { id: 'm1', redId: 'c1', blueId: 'c2', status: 'completed', winner: 'red', avgRed: 8.5, avgBlue: 7.0 }
    ]
    const standings = computeStandings(competitors, matches)
    const alice = standings.find((r) => r.competitor.id === 'c1')
    const bob = standings.find((r) => r.competitor.id === 'c2')

    expect(alice.wins).toBe(1)
    expect(alice.losses).toBe(0)
    expect(bob.wins).toBe(0)
    expect(bob.losses).toBe(1)
  })

  it('tallies a tie for both competitors', () => {
    const matches = [
      { id: 'm1', redId: 'c1', blueId: 'c2', status: 'completed', winner: 'tie', avgRed: 7.9, avgBlue: 7.9 }
    ]
    const standings = computeStandings(competitors, matches)
    const alice = standings.find((r) => r.competitor.id === 'c1')
    const bob = standings.find((r) => r.competitor.id === 'c2')

    expect(alice.ties).toBe(1)
    expect(bob.ties).toBe(1)
  })

  it('sorts by wins, then by score differential', () => {
    const matches = [
      { id: 'm1', redId: 'c1', blueId: 'c2', status: 'completed', winner: 'red', avgRed: 9.0, avgBlue: 7.0 },
      { id: 'm2', redId: 'c3', blueId: 'c2', status: 'completed', winner: 'blue', avgRed: 6.0, avgBlue: 8.0 },
    ]
    const standings = computeStandings(competitors, matches)
    expect(standings[0].competitor.id).toBe('c1')
  })

  it('ignores matches referencing unknown competitor ids', () => {
    const matches = [
      { id: 'm1', redId: 'unknown', blueId: 'c2', status: 'completed', winner: 'red', avgRed: 9, avgBlue: 7 }
    ]
    expect(() => computeStandings(competitors, matches)).not.toThrow()
  })
})
