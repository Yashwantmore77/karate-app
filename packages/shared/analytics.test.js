import { describe, it, expect } from 'vitest'
import { buildAnalytics } from './analytics.js'

const player = (id, name, club) => ({ id, name, dob: '2010-01-01', club, registrationStatus: 'APPROVED' })
const bout = (id, red, blue, winner, extra = {}) => ({ id, akaPlayerId: red, aoPlayerId: blue, winner, status: 'completed', ...extra })

/** KAN-369 point 3: only bouts actually fought are wins and losses. */
describe('analytics: wins, losses and walkovers', () => {
  const players = [player('a', 'Aarav Patil', 'Pune KA'), player('b', 'Rohan Kulkarni', 'Nashik Dojo'), player('c', 'Kabir Rao', 'Nashik Dojo')]
  const matches = [
    bout('m1', 'a', 'b', 'red'),
    bout('m2', 'a', 'c', 'red', { result: { type: 'WALKOVER', method: 'walkover' } }),
    bout('m3', 'b', 'c', 'blue', { result: { type: 'KIKEN', method: 'kiken' } }),
    bout('m4', 'c', 'a', 'red', { result: { type: 'NO_SHOW', method: 'no_show' } }),
    // A disqualification ends a bout that was fought: it still counts.
    bout('m5', 'b', 'a', 'red', { result: { type: 'DISQUALIFIED', method: 'shikkaku' } }),
    // Cancelled: nobody's.
    { id: 'm6', akaPlayerId: 'a', aoPlayerId: 'b', winner: null, status: 'cancelled' },
  ]
  const out = buildAnalytics([{ tournament: { id: 't', name: 'Cup', date: '2026-10-21' }, players, teams: [], matches, medals: [] }])
  const athlete = (name) => out.athletes.find((x) => x.name === name)

  it('leaves walkovers, no-shows and withdrawals out of won, lost and the win rate', () => {
    expect(athlete('Aarav Patil')).toMatchObject({ won: 1, lost: 1, walkovers: 1, bouts: 2, winRate: 50 })
    expect(athlete('Rohan Kulkarni')).toMatchObject({ won: 1, lost: 1, walkovers: 0 })
    expect(athlete('Kabir Rao')).toMatchObject({ won: 0, lost: 0, walkovers: 2, winRate: null })
  })

  it('adds them up per club and per tournament the same way', () => {
    expect(out.clubs.find((c) => c.name === 'Nashik Dojo')).toMatchObject({ won: 1, lost: 1, walkovers: 2 })
    expect(out.tournaments[0].bouts).toBe(2)
  })
})
