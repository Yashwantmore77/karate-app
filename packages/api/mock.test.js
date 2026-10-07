import { describe, it, expect } from 'vitest'
import { runMockTournament } from './scripts/mock-tournament.js'

describe('automated mock tournament', () => {
  it('runs a whole event end to end with every step passing', async () => {
    const report = await runMockTournament({ teams: 2, players: 4, mats: 2, quiet: true })
    const failed = report.steps.filter((s) => !s.ok)
    expect(failed, JSON.stringify(failed)).toEqual([])
    expect(report.steps.length).toBeGreaterThanOrEqual(18)
  }, 120_000)
})
