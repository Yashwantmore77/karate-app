import { describe, it, expect } from 'vitest'
import { runMockTournament } from './scripts/mock-tournament.js'

// A Kata + Kumite event from registration to certificates, once with kata on
// the judges' panel and once with kata fought as bouts (flags) on the mats.
describe('automated mock tournament', () => {
  it.each(['panel', 'bouts'])('runs a kata + kumite event end to end (kata by %s)', async (kataMode) => {
    const report = await runMockTournament({ teams: 2, players: 4, mats: 2, kataMode, quiet: true })
    const failed = report.steps.filter((s) => !s.ok)
    expect(failed, JSON.stringify(failed)).toEqual([])
    expect(report.steps.length).toBeGreaterThanOrEqual(19)
  }, 120_000)
})
