import { describe, it, expect } from 'vitest'
import { runLoadTest } from './scripts/loadtest.js'
import { publicViewCache } from './routes/public.js'

describe('public view cache (PRD v1 §23)', () => {
  it('computes once for concurrent spectators, again after a change, and never caches a refusal', async () => {
    let calls = 0
    const tms = { publicView: async (key) => { calls += 1; if (key === 'nope') throw Object.assign(new Error('x'), { code: 'tournament_not_found' }); return { key, n: calls } } }
    const views = publicViewCache(tms, { maxAgeMs: 60_000 })
    const [a, b] = await Promise.all([views.get('open'), views.get('open')])
    expect(a).toBe(b)
    expect(calls).toBe(1)
    expect(JSON.parse(await views.json('open'))).toEqual({ key: 'open', n: 1 })
    views.invalidate()
    expect((await views.get('open')).n).toBe(2)
    await expect(views.get('nope')).rejects.toMatchObject({ code: 'tournament_not_found' })
    await expect(views.get('nope')).rejects.toMatchObject({ code: 'tournament_not_found' })
    expect(calls).toBe(4)
  })
})

describe('event-day load test', () => {
  it('scores on several mats while spectators poll, with nothing failing', async () => {
    const report = await runLoadTest({ mats: 2, viewers: 20, seconds: 3, quiet: true })
    expect(report.commands.ok).toBeGreaterThan(5)
    expect(report.publicPage.ok).toBeGreaterThan(5)
    expect(report.commands.failed + report.publicPage.failed + report.scoreboard.failed).toBe(0)
  }, 60_000)
})
