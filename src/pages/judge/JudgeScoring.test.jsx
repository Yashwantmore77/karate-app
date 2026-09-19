import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SCORE_MIN, SCORE_MAX, SCORE_VALUES, JUDGE_COUNT, clampScore } from '../../firebase'

describe('JudgeScoring - Score submission rules', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Score range', () => {
    it('exposes the expected point values', () => {
      expect(SCORE_MIN).toBe(1)
      expect(SCORE_MAX).toBe(3)
      expect(SCORE_VALUES).toEqual([1, 2, 3])
      expect(JUDGE_COUNT).toBe(4)
    })

    it('clamps a score above the maximum', () => {
      expect(clampScore(15)).toBe(SCORE_MAX)
    })

    it('clamps a score below the minimum', () => {
      expect(clampScore(-3)).toBe(SCORE_MIN)
    })

    it('rounds a fractional value to the nearest whole point', () => {
      expect(clampScore(2.4)).toBe(2)
      expect(clampScore(2.6)).toBe(3)
    })

    it('leaves an in-range point value unchanged', () => {
      expect(clampScore(2)).toBe(2)
    })
  })

  describe('Submit judge score', () => {
    it('persists a judge score keyed by seat and match', () => {
      const data = {
        competitor1: clampScore(3),
        competitor2: clampScore(2),
        submitTime: new Date().toISOString(),
        judgeId: 2
      }
      localStorage.setItem('judge-2-match-001', JSON.stringify(data))

      const stored = JSON.parse(localStorage.getItem('judge-2-match-001'))
      expect(stored.competitor1).toBe(3)
      expect(stored.competitor2).toBe(2)
      expect(stored.judgeId).toBe(2)
    })

    it('allows a judge to overwrite their previously submitted score', () => {
      localStorage.setItem('judge-1-match-001', JSON.stringify({ competitor1: 1, competitor2: 2 }))
      localStorage.setItem('judge-1-match-001', JSON.stringify({ competitor1: 3, competitor2: 2 }))

      const stored = JSON.parse(localStorage.getItem('judge-1-match-001'))
      expect(stored.competitor1).toBe(3)
    })
  })

  describe('Average score calculation (mirrors RefereeMatchControl)', () => {
    it('averages all submitted judge scores per side', () => {
      for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
        localStorage.setItem(`judge-${seat}-match-001`, JSON.stringify({ competitor1: 3, competitor2: 2 }))
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

      expect(avgRed).toBe(3)
      expect(avgBlue).toBe(2)
    })

    it('determines a tie when averages are equal', () => {
      const avgRed = 2
      const avgBlue = 2
      const winner = avgRed > avgBlue ? 'red' : avgBlue > avgRed ? 'blue' : 'tie'
      expect(winner).toBe('tie')
    })

    it('determines the higher-scoring side as winner', () => {
      const avgRed = 3
      const avgBlue = 2
      const winner = avgRed > avgBlue ? 'red' : avgBlue > avgRed ? 'blue' : 'tie'
      expect(winner).toBe('red')
    })
  })
})
