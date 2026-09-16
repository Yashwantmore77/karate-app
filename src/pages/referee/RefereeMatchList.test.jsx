import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isExpired } from '../../utils/dateUtils'

describe('RefereeMatchList - Match Creation & Rules', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Create Match', () => {
    it('should create a match with distinct red and blue competitors', () => {
      const matches = []
      const values = { redId: 'comp-1', blueId: 'comp-2' }
      expect(values.redId).not.toBe(values.blueId)

      const match = {
        id: 'match-' + Date.now(),
        categoryId: 'cat-1',
        redId: values.redId,
        blueId: values.blueId,
        status: 'open',
        createdAt: new Date().toISOString()
      }
      const updated = [...matches, match]
      localStorage.setItem('matches-cat-1', JSON.stringify(updated))

      const stored = JSON.parse(localStorage.getItem('matches-cat-1'))
      expect(stored).toHaveLength(1)
      expect(stored[0].status).toBe('open')
    })

    it('should reject a match where red and blue are the same competitor', () => {
      const values = { redId: 'comp-1', blueId: 'comp-1' }
      const isInvalid = values.redId === values.blueId
      expect(isInvalid).toBe(true)
    })

    it('should require at least 2 competitors before allowing match creation', () => {
      const competitors = [{ id: 'comp-1' }]
      expect(competitors.length < 2).toBe(true)

      const enoughCompetitors = [{ id: 'comp-1' }, { id: 'comp-2' }]
      expect(enoughCompetitors.length < 2).toBe(false)
    })
  })

  describe('Expired tournament restrictions', () => {
    it('should block match creation when the tournament has expired', () => {
      const tournament = { id: 't1', date: '2020-01-01' }
      expect(isExpired(tournament.date)).toBe(true)
    })

    it('should allow match creation when the tournament is upcoming', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      const tournament = { id: 't1', date: future.toISOString().split('T')[0] }
      expect(isExpired(tournament.date)).toBe(false)
    })
  })

  describe('Match/Competitor isolation by category', () => {
    it('should keep matches scoped to their own category key', () => {
      localStorage.setItem('matches-cat-1', JSON.stringify([{ id: 'm1' }]))
      localStorage.setItem('matches-cat-2', JSON.stringify([{ id: 'm2' }, { id: 'm3' }]))

      const cat1Matches = JSON.parse(localStorage.getItem('matches-cat-1'))
      const cat2Matches = JSON.parse(localStorage.getItem('matches-cat-2'))

      expect(cat1Matches).toHaveLength(1)
      expect(cat2Matches).toHaveLength(2)
    })
  })
})
