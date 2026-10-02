import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMatchClock } from './useMatchClock'
import { useMatchRecord } from './useMatchRecord'
import { useServerNow } from './useServerNow'
import { makeClock, startClock } from '@kumite/shared/clock.js'
import * as fake from '../test/fakeDomain'

vi.mock('../data/domain', () => import('../test/fakeDomain'))

describe('useServerNow', () => {
  it('returns wall clock time when there is no offset', () => {
    const { result } = renderHook(() => useServerNow())
    expect(Math.abs(result.current() - Date.now())).toBeLessThan(50)
  })
})

describe('useMatchClock', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the stored remainder while stopped and does not tick', () => {
    const { result } = renderHook(() => useMatchClock(makeClock(90_000)))
    expect(result.current.display).toBe('1:30')
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(result.current.display).toBe('1:30')
  })

  it('counts down from the anchor while running', () => {
    const clock = startClock(makeClock(90_000), Date.now())
    const { result } = renderHook(() => useMatchClock(clock))
    expect(result.current.display).toBe('1:30')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(result.current.display).toBe('1:27')
  })

  it('is correct even when renders are late, because it samples not counts', () => {
    const clock = startClock(makeClock(90_000), Date.now())
    const { result } = renderHook(() => useMatchClock(clock))
    // one long gap instead of many ticks: a throttled background tab
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.display).toBe('1:00')
  })

  it('stops at zero and reports expiry', () => {
    const clock = startClock(makeClock(2_000), Date.now())
    const { result } = renderHook(() => useMatchClock(clock))
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(result.current.display).toBe('0:00')
    expect(result.current.expired).toBe(true)
  })

  it('handles a missing clock without throwing', () => {
    const { result } = renderHook(() => useMatchClock(null))
    expect(result.current.display).toBe('0:00')
  })
})


describe('useMatchRecord', () => {
  // A judge opens a bout from a link, knowing only its id. This used to be
  // answered from the browser's own storage, which is empty on any device
  // talking to the API — so in production every judge got "Match not found".
  beforeEach(() => {
    fake.reset()
    fake.seed({
      tournaments: [{ id: 't1', name: 'Spring Cup', date: '2099-05-15' }],
      categories: [{ id: 'cat-1', tournamentId: 't1', name: 'U14 Boys' }],
      competitors: [
        { id: 'c1', categoryId: 'cat-1', name: 'Aarav', bib: '101' },
        { id: 'c2', categoryId: 'cat-1', name: 'Rohan', bib: '102' },
      ],
      matches: [{ id: 'm1', categoryId: 'cat-1', redId: 'c1', blueId: 'c2', status: 'open' }],
    })
  })

  it('starts out loading, with nothing to show yet', () => {
    const { result } = renderHook(() => useMatchRecord('m1'))
    expect(result.current).toMatchObject({ loading: true, match: null })
  })

  it('reads the bout, its category, tournament and both competitors from the API', async () => {
    const { result } = renderHook(() => useMatchRecord('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.match.id).toBe('m1')
    expect(result.current.category.name).toBe('U14 Boys')
    expect(result.current.tournament.name).toBe('Spring Cup')
    expect(result.current.redComp.name).toBe('Aarav')
    expect(result.current.blueComp.name).toBe('Rohan')
  })

  it('settles as not found for a bout that does not exist', async () => {
    const { result } = renderHook(() => useMatchRecord('nope'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.match).toBeNull()
  })

  it('settles rather than spinning forever when the read fails', async () => {
    const find = vi.spyOn(fake.matches, 'find').mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useMatchRecord('m1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.match).toBeNull()
    find.mockRestore()
  })

  it('loads the new bout when the id changes', async () => {
    fake.seed({ matches: [{ id: 'm2', categoryId: 'cat-1', redId: 'c2', blueId: 'c1', status: 'open' }] })
    const { result, rerender } = renderHook(({ id }) => useMatchRecord(id), { initialProps: { id: 'm1' } })
    await waitFor(() => expect(result.current.match?.id).toBe('m1'))
    rerender({ id: 'm2' })
    await waitFor(() => expect(result.current.match?.id).toBe('m2'))
    expect(result.current.redComp.name).toBe('Rohan')
  })
})
