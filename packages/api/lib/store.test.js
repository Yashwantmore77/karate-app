import { describe, it, expect } from 'vitest'
import { ensureIndexes, INDEXES } from './store.js'

describe('Mongo indexes (PRD 62)', () => {
  it('creates the unique id index and every per-collection index once', async () => {
    const created = []
    const fake = { createIndex: async (keys, options = {}) => created.push([keys, options]) }
    await ensureIndexes(fake, 'players')
    expect(created[0]).toEqual([{ id: 1 }, { unique: true }])
    expect(created.slice(1).map(([k]) => k)).toEqual(INDEXES.players.map(([k]) => k))
  })

  it('scopes every PRD collection by tournament', () => {
    for (const name of ['teams', 'players', 'pools', 'medals', 'certificates', 'notifications', 'auditLog', 'files']) {
      expect(INDEXES[name].some(([keys]) => 'tournamentId' in keys)).toBe(true)
    }
  })
})
