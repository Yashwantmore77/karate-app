import { describe, it, expect, beforeEach } from 'vitest'
import { createAuditLog, diff, AUDIT_ACTIONS } from './audit.js'

// A stand-in for one store collection, with the same contract the real one
// exposes, so the audit log is exercised the way routes will use it.
const makeCollection = () => {
  const rows = []
  return {
    rows,
    async insert(doc) {
      const row = { ...doc, id: String(rows.length + 1) }
      rows.push(row)
      return row
    },
    async list(filter = {}) {
      return rows.filter((row) =>
        Object.entries(filter).every(([field, value]) => row[field] === value))
    },
  }
}

describe('audit diff', () => {
  it('keeps only what actually changed', () => {
    expect(diff({ weight: 34.5, name: 'Rahul' }, { weight: 34.2, name: 'Rahul' }))
      .toEqual({ weight: { from: 34.5, to: 34.2 } })
  })

  it('counts a field appearing or disappearing as a change', () => {
    expect(diff({}, { weightCategory: '-35 KG' }))
      .toEqual({ weightCategory: { from: undefined, to: '-35 KG' } })
  })

  it('does not flag a value that only looks different', () => {
    expect(diff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({})
  })
})

describe('audit log', () => {
  let collection, audit

  beforeEach(() => {
    collection = makeCollection()
    audit = createAuditLog(collection)
  })

  it('keeps who, what, why and when for a category override', async () => {
    await audit.record({
      tournamentId: 't1',
      actor: { uid: 'admin-1', role: 'admin' },
      action: AUDIT_ACTIONS.PLAYER_CATEGORY_OVERRIDDEN,
      entity: 'player',
      entityId: 'p1',
      before: { weightCategory: '-35 KG' },
      after: { weightCategory: '-40 KG' },
      reason: 'Weigh-in reading corrected',
      requestMeta: { ip: '10.0.0.4', userAgent: 'Firefox' },
    })

    const [entry] = await audit.trailFor('player', 'p1')
    expect(entry).toMatchObject({
      tournamentId: 't1',
      actorId: 'admin-1',
      actorRole: 'admin',
      action: 'player.category_overridden',
      reason: 'Weigh-in reading corrected',
      ip: '10.0.0.4',
    })
    expect(entry.changes.weightCategory).toEqual({ from: '-35 KG', to: '-40 KG' })
    expect(Date.parse(entry.at)).not.toBeNaN()
  })

  it('attributes the record to the caller, not to anything they sent', async () => {
    await audit.record({
      actor: { uid: 'ref-1', role: 'referee' },
      action: AUDIT_ACTIONS.MATCH_RESULT_CHANGED,
      entity: 'match', entityId: 'm1',
      // a client trying to claim someone else did it
      actorId: 'admin-1',
    })
    const [entry] = await audit.trailFor('match', 'm1')
    expect(entry.actorId).toBe('ref-1')
  })

  it('keeps a trail per entity rather than one global list', async () => {
    const base = { actor: { uid: 'a' }, action: AUDIT_ACTIONS.PLAYER_UPDATED, entity: 'player' }
    await audit.record({ ...base, entityId: 'p1', after: { x: 1 } })
    await audit.record({ ...base, entityId: 'p2', after: { x: 2 } })
    await audit.record({ ...base, entityId: 'p1', after: { x: 3 } })

    expect(await audit.trailFor('player', 'p1')).toHaveLength(2)
    expect(await audit.trailFor('player', 'p2')).toHaveLength(1)
  })

  it('collects a tournament\'s whole trail for the audit screen', async () => {
    await audit.record({ tournamentId: 't1', actor: {}, action: 'a', entity: 'player', entityId: 'p1' })
    await audit.record({ tournamentId: 't1', actor: {}, action: 'b', entity: 'pool', entityId: 'pool-a' })
    await audit.record({ tournamentId: 't2', actor: {}, action: 'c', entity: 'player', entityId: 'p9' })

    expect(await audit.forTournament('t1')).toHaveLength(2)
  })

  it('records an unlock, which Rules 5 and 7 need to be traceable', async () => {
    await audit.record({
      tournamentId: 't1',
      actor: { uid: 'admin-1', role: 'admin' },
      action: AUDIT_ACTIONS.DRAW_UNLOCKED,
      entity: 'tournament', entityId: 't1',
      reason: 'Late withdrawal in Pool A',
    })
    const [entry] = await audit.trailFor('tournament', 't1')
    expect(entry.action).toBe('draw.unlocked')
    expect(entry.reason).toBe('Late withdrawal in Pool A')
  })

  it('appends rather than replacing', async () => {
    await audit.record({ actor: {}, action: 'a', entity: 'e', entityId: '1' })
    await audit.record({ actor: {}, action: 'b', entity: 'e', entityId: '1' })
    expect(collection.rows).toHaveLength(2)
  })
})
