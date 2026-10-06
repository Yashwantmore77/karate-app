import { describe, it, expect } from 'vitest'
import { createStores } from '../lib/store.js'
import { seedSample } from './seed-sample.js'

describe('sample data seed', () => {
  it('builds a full sample, never twice, and --reset touches only the sample', async () => {
    const stores = createStores()
    const other = await stores.tournaments.insert({ name: 'Real Cup', location: 'X', date: '2027-02-01', template: 'kumite' })
    const quiet = () => {}

    const first = await seedSample(stores, { log: quiet })
    expect(first.players).toBe(62)
    expect(first.matches).toBeGreaterThan(100)
    expect(await stores.medals.list({ tournamentId: first.tournamentId })).not.toHaveLength(0)

    expect(await seedSample(stores, { log: quiet })).toBeNull()
    expect(await stores.tournaments.list({ slug: 'sample-open-2027' })).toHaveLength(1)

    const again = await seedSample(stores, { reset: true, log: quiet })
    expect(again.tournamentId).not.toBe(first.tournamentId)
    expect(await stores.players.list({ tournamentId: first.tournamentId })).toHaveLength(0)
    expect(await stores.auditLog.list({ tournamentId: first.tournamentId })).toHaveLength(0)
    expect(await stores.tournaments.get(other.id)).toMatchObject({ name: 'Real Cup' })
  })
})
