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

/** KAN-369 point 1: a player is an entry once sent in, unless rejected or withdrawn. */
describe('analytics: who counts as an entry', () => {
  const players = [
    { ...player('a', 'Aarav Patil', 'Pune KA'), registrationStatus: 'APPROVED' },
    { ...player('d', 'Draft Only', 'Pune KA'), registrationStatus: 'DRAFT' },
    { ...player('r', 'Rejected One', 'Pune KA'), registrationStatus: 'REJECTED' },
    { ...player('w', 'Withdrew Later', 'Pune KA'), registrationStatus: 'WITHDRAWN' },
  ]
  const out = buildAnalytics([{ tournament: { id: 't', name: 'Cup', date: '2026-10-21' }, players, teams: [], matches: [bout('m1', 'a', 'w', 'blue')], medals: [] }])

  it('counts only entries in the club and the tournament', () => {
    expect(out.clubs[0].entries).toBe(1)
    expect(out.tournaments[0].players).toBe(1)
  })

  it('keeps a withdrawn athlete with the bouts they fought', () => {
    expect(out.athletes.find((x) => x.name === 'Withdrew Later')).toMatchObject({ won: 1, lost: 0 })
    expect(out.athletes.map((x) => x.name)).not.toContain('Draft Only')
  })
})

/** KAN-369 point 4: an organiser says which records are one athlete. */
describe('analytics: records joined or set apart by hand', () => {
  const cup = (id, name, date, players, matches = []) => ({ tournament: { id, name, date }, players, teams: [], matches, medals: [] })
  const events = [
    cup('t1', 'Spring Cup', '2026-04-01', [player('p1', 'Meera Joshi', 'ABC Karate')]),
    // Meera spelt "Mira", and another girl called Meera born the same day, who wins their bout.
    cup('t2', 'Autumn Cup', '2026-10-01', [player('p2', 'Mira Joshi', 'ABC Karate'), player('p3', 'Meera Joshi', 'XYZ Dojo')], [bout('m1', 'p3', 'p2', 'red')]),
  ]
  const links = [
    { id: 'l1', kind: 'same', playerIds: ['p1', 'p2'] },
    { id: 'l2', kind: 'apart', playerIds: ['p3'] },
    // About a record in a tournament this account does not see: left out.
    { id: 'l3', kind: 'same', playerIds: ['p1', 'elsewhere'] },
  ]
  const records = (out) => out.athletes.map((a) => a.history.map((h) => h.playerId)).sort()

  it('goes by name and birthday until told otherwise', () => {
    expect(records(buildAnalytics(events))).toEqual([['p1', 'p3'], ['p2']])
  })

  it('joins and separates records as decided, each bout staying with its own record', () => {
    const out = buildAnalytics(events, links)
    expect(records(out)).toEqual([['p1', 'p2'], ['p3']])
    const meera = out.athletes.find((a) => a.history.some((h) => h.playerId === 'p1'))
    const other = out.athletes.find((a) => a.history.some((h) => h.playerId === 'p3'))
    expect(meera).toMatchObject({ name: 'Mira Joshi', tournaments: 2, won: 0, lost: 1 })
    expect(meera.history.map((h) => [h.tournament, h.lost])).toEqual([['Spring Cup', 0], ['Autumn Cup', 1]])
    expect(other).toMatchObject({ name: 'Meera Joshi', club: 'XYZ Dojo', won: 1, lost: 0 })
  })

  it('lists the decisions on each athlete, by name and tournament, so they can be undone', () => {
    const out = buildAnalytics(events, links)
    const meera = out.athletes.find((a) => a.history.some((h) => h.playerId === 'p1'))
    expect(meera.decisions).toEqual([{ id: 'l1', kind: 'same', records: [{ playerId: 'p1', name: 'Meera Joshi', tournament: 'Spring Cup' }, { playerId: 'p2', name: 'Mira Joshi', tournament: 'Autumn Cup' }] }])
    expect(out.athletes.find((a) => a.name === 'Meera Joshi').decisions.map((d) => d.id)).toEqual(['l2'])
    expect(JSON.stringify(out)).not.toContain('elsewhere')
    expect(JSON.stringify(out)).not.toContain('2010-01-01')
  })
})
