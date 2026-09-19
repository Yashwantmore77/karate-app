import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { matchRepo, tournamentRepo, matchStateRepo } from './repo'
import { migrateLegacyData } from './migrate'

describe('repo over the local adapter', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('creates and reads back a row, assigning an id', async () => {
    const created = await tournamentRepo.create({ name: 'Spring Cup' })
    expect(created.id).toBeTruthy()
    expect(await tournamentRepo.get(created.id)).toMatchObject({ name: 'Spring Cup' })
  })

  it('keeps an id that was supplied', async () => {
    await matchRepo.create({ id: 'match-1', categoryId: 'cat-1' })
    expect(await matchRepo.get('match-1')).toMatchObject({ categoryId: 'cat-1' })
  })

  it('filters a list by a query', async () => {
    await matchRepo.create({ id: 'm1', categoryId: 'cat-1' })
    await matchRepo.create({ id: 'm2', categoryId: 'cat-2' })
    const rows = await matchRepo.list({ categoryId: 'cat-1' })
    expect(rows.map((r) => r.id)).toEqual(['m1'])
  })

  it('patches a row without dropping its other fields', async () => {
    await matchRepo.create({ id: 'm1', categoryId: 'cat-1', status: 'scheduled' })
    await matchRepo.update('m1', { status: 'live' })
    expect(await matchRepo.get('m1')).toMatchObject({ categoryId: 'cat-1', status: 'live' })
  })

  it('removes a row', async () => {
    await matchRepo.create({ id: 'm1' })
    await matchRepo.remove('m1')
    expect(await matchRepo.get('m1')).toBeNull()
  })

  it('returns null for a missing row rather than throwing', async () => {
    expect(await matchRepo.get('nope')).toBeNull()
  })

  it('notifies subscribers on write and stops after unsubscribe', async () => {
    const seen = vi.fn()
    const off = matchRepo.subscribe({ categoryId: 'cat-1' }, seen)
    expect(seen).toHaveBeenCalledWith([])

    await matchRepo.create({ id: 'm1', categoryId: 'cat-1' })
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'm1' })])

    await matchRepo.create({ id: 'm2', categoryId: 'cat-2' })
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'm1' })])

    off()
    const before = seen.mock.calls.length
    await matchRepo.create({ id: 'm3', categoryId: 'cat-1' })
    expect(seen.mock.calls.length).toBe(before)
  })

  it('upserts match state by match id', async () => {
    await matchStateRepo.put('match-1', { scores: { ao: 0, aka: 0 } })
    await matchStateRepo.put('match-1', { scores: { ao: 3, aka: 0 } })
    const state = await matchStateRepo.get('match-1')
    expect(state.scores).toEqual({ ao: 3, aka: 0 })
    expect((await matchStateRepo.list({})).length).toBe(1)
  })
})

describe('legacy migration', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const seedLegacy = () => {
    localStorage.setItem('tournaments', JSON.stringify([{ id: 't1', name: 'Summer', template: 'kumite' }]))
    localStorage.setItem('categories-t1', JSON.stringify([{ id: 'cat-1', tournamentId: 't1', name: 'U10 Kumite' }]))
    localStorage.setItem('competitors-cat-1', JSON.stringify([
      { id: 'c1', bib: '101', name: 'Alice' },
      { id: 'c2', bib: '102', name: 'Bob' },
    ]))
    localStorage.setItem('matches-cat-1', JSON.stringify([{ id: 'm1', redId: 'c1', blueId: 'c2' }]))
  }

  it('flattens nested keys into collections', async () => {
    seedLegacy()
    expect(migrateLegacyData()).toBe(true)

    expect(await tournamentRepo.list({})).toHaveLength(1)
    expect(await matchRepo.list({ categoryId: 'cat-1' })).toHaveLength(1)
  })

  it('stamps migrated athletes with their tournament', async () => {
    seedLegacy()
    migrateLegacyData()
    const { athleteRepo } = await import('./repo')
    const athletes = await athleteRepo.list({ tournamentId: 't1' })
    expect(athletes.map((a) => a.name).sort()).toEqual(['Alice', 'Bob'])
  })

  it('runs once and leaves the legacy keys alone', () => {
    seedLegacy()
    expect(migrateLegacyData()).toBe(true)
    expect(migrateLegacyData()).toBe(false)
    expect(localStorage.getItem('matches-cat-1')).not.toBeNull()
  })

  it('copes with no legacy data at all', () => {
    expect(migrateLegacyData()).toBe(true)
    expect(localStorage.getItem('kt:v1:tournaments')).toBeNull()
  })
})
