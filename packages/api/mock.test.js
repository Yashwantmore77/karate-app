import { describe, it, expect } from 'vitest'
import { runMockTournament } from './scripts/mock-tournament.js'
import { TEST_PASSWORD } from './test/roster.js'

// A Kata + Kumite event from registration to certificates, once with kata on
// the judges' panel and once with kata fought as bouts (flags) on the mats.
describe('automated mock tournament', () => {
  it.each(['panel', 'bouts'])('runs a kata + kumite event end to end (kata by %s)', async (kataMode) => {
    // rolePassword: the test roster is installed, so each step runs as the
    // role whose job it is rather than everything as the administrator.
    const report = await runMockTournament({ teams: 2, players: 4, mats: 2, kataMode, rolePassword: TEST_PASSWORD, quiet: true })
    const failed = report.steps.filter((s) => !s.ok)
    expect(failed, JSON.stringify(failed)).toEqual([])
    expect(report.steps.length).toBeGreaterThanOrEqual(19)
  }, 120_000)
})
