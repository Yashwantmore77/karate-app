import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initializeMockData } from './mockData'

describe('mockData - seed integrity', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('seeds tournaments on first run', () => {
    initializeMockData()
    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    expect(tournaments.length).toBeGreaterThan(0)
  })

  it('does not overwrite existing tournament data on repeat calls', () => {
    initializeMockData()
    localStorage.setItem('tournaments', JSON.stringify([{ id: 'custom', name: 'My Tournament' }]))
    initializeMockData()

    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    expect(tournaments).toHaveLength(1)
    expect(tournaments[0].id).toBe('custom')
  })

  it('reseeds when the tournaments key exists but is an empty array (e.g. after deleting everything)', () => {
    localStorage.setItem('tournaments', JSON.stringify([]))
    initializeMockData()

    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    expect(tournaments.length).toBeGreaterThan(0)
  })

  it('reseeds when the tournaments key is corrupted JSON', () => {
    localStorage.setItem('tournaments', 'not-json')
    initializeMockData()

    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    expect(tournaments.length).toBeGreaterThan(0)
  })

  it('seeds at least one expired tournament for testing expiry UI', () => {
    initializeMockData()
    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    const past = tournaments.filter(t => new Date(t.date) < new Date())
    expect(past.length).toBeGreaterThan(0)
  })

  it('every seeded category references a real tournament', () => {
    initializeMockData()
    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    tournaments.forEach(t => {
      const categories = JSON.parse(localStorage.getItem(`categories-${t.id}`) || '[]')
      categories.forEach(c => expect(c.tournamentId).toBe(t.id))
    })
  })

  it('every seeded match references competitors that exist in its category', () => {
    initializeMockData()
    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    tournaments.forEach(t => {
      const categories = JSON.parse(localStorage.getItem(`categories-${t.id}`) || '[]')
      categories.forEach(cat => {
        const competitors = JSON.parse(localStorage.getItem(`competitors-${cat.id}`) || '[]')
        const competitorIds = competitors.map(c => c.id)
        const matches = JSON.parse(localStorage.getItem(`matches-${cat.id}`) || '[]')
        matches.forEach(m => {
          expect(competitorIds).toContain(m.redId)
          expect(competitorIds).toContain(m.blueId)
        })
      })
    })
  })

  it('seeded completed matches carry a winner and average scores', () => {
    initializeMockData()
    const completed = JSON.parse(localStorage.getItem('matches-cat-001')).find(m => m.status === 'completed')
    expect(completed.winner).toBeDefined()
    expect(completed.avgRed).toBeGreaterThan(0)
    expect(completed.avgBlue).toBeGreaterThan(0)
  })
})
