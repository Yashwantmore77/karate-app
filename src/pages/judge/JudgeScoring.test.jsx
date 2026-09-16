import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SCORE_MIN, SCORE_MAX, SCORE_STEP, JUDGE_COUNT, clampScore } from '../../firebase'

describe('JudgeScoring - Score submission rules', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Score range', () => {
    it('exposes the expected kata scoring range', () => {
      expect(SCORE_MIN).toBe(1.0)
      expect(SCORE_MAX).toBe(10.0)
      expect(JUDGE_COUNT).toBe(4)
    })

    it('clamps a score above the maximum', () => {
      expect(clampScore(15)).toBe(SCORE_MAX)
    })

    it('clamps a score below the minimum', () => {
      expect(clampScore(-3)).toBe(SCORE_MIN)
    })

    it('rounds to the nearest configured decimal precision', () => {
      expect(clampScore(7.666)).toBe(7.7)
    })

    it('leaves an in-range score unchanged', () => {
      expect(clampScore(8.3)).toBe(8.3)
    })
  })

  describe('Submit judge score', () => {
    it('persists a judge score keyed by seat and match', () => {
      const data = {
        competitor1: clampScore(8.4),
        competitor2: clampScore(7.6),
        submitTime: new Date().toISOString(),
        judgeId: 2
      }
      localStorage.setItem('judge-2-match-001', JSON.stringify(data))

      const stored = JSON.parse(localStorage.getItem('judge-2-match-001'))
      expect(stored.competitor1).toBe(8.4)
      expect(stored.competitor2).toBe(7.6)
      expect(stored.judgeId).toBe(2)
    })

    it('allows a judge to overwrite their previously submitted score', () => {
      localStorage.setItem('judge-1-match-001', JSON.stringify({ competitor1: 7.0, competitor2: 6.0 }))
      localStorage.setItem('judge-1-match-001', JSON.stringify({ competitor1: 8.0, competitor2: 6.5 }))

      const stored = JSON.parse(localStorage.getItem('judge-1-match-001'))
      expect(stored.competitor1).toBe(8.0)
    })
  })

  describe('Average score calculation (mirrors RefereeMatchControl)', () => {
    it('averages all submitted judge scores per side', () => {
      for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
        localStorage.setItem(`judge-${seat}-match-001`, JSON.stringify({ competitor1: 8.0, competitor2: 7.0 }))
      }

      const red = []
      const blue = []
      for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
        const s = JSON.parse(localStorage.getItem(`judge-${seat}-match-001`))
        red.push(s.competitor1)
        blue.push(s.competitor2)
      }
      const avgRed = red.reduce((a, b) => a + b, 0) / red.length
      const avgBlue = blue.reduce((a, b) => a + b, 0) / blue.length

      expect(avgRed).toBe(8.0)
      expect(avgBlue).toBe(7.0)
    })

    it('determines a tie when averages are equal', () => {
      const avgRed = 7.5
      const avgBlue = 7.5
      const winner = avgRed > avgBlue ? 'red' : avgBlue > avgRed ? 'blue' : 'tie'
      expect(winner).toBe('tie')
    })

    it('determines the higher-scoring side as winner', () => {
      const avgRed = 8.2
      const avgBlue = 7.9
      const winner = avgRed > avgBlue ? 'red' : avgBlue > avgRed ? 'blue' : 'tie'
      expect(winner).toBe('red')
    })
  })
})
