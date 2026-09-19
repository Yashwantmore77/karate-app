import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMatchClock } from './useMatchClock'
import { useMatchState } from './useMatchState'
import { useServerNow } from './useServerNow'
import { makeClock, startClock } from '../shared/clock'
import { matchStateRepo } from '../data/repo'

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

describe('useMatchState', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const initial = () => ({ scores: { ao: 0, aka: 0 } })

  it('seeds state for a match that has none', async () => {
    const { result } = renderHook(() => useMatchState('m1', initial))
    await waitFor(() => expect(result.current[0]).toMatchObject({ scores: { ao: 0, aka: 0 } }))
  })

  it('persists a dispatched change through the repo', async () => {
    const { result } = renderHook(() => useMatchState('m1', initial))
    await waitFor(() => expect(result.current[0]).not.toBeNull())

    act(() => {
      result.current[1]((s) => ({ ...s, scores: { ...s.scores, ao: 3 } }))
    })

    await waitFor(() => expect(result.current[0].scores.ao).toBe(3))
    const stored = await matchStateRepo.get('m1')
    expect(stored.scores.ao).toBe(3)
  })

  it('picks up a change made by another window', async () => {
    const { result } = renderHook(() => useMatchState('m1', initial))
    await waitFor(() => expect(result.current[0]).not.toBeNull())

    // a second controller writing to the same match
    await act(async () => {
      await matchStateRepo.put('m1', { scores: { ao: 0, aka: 7 } })
    })

    await waitFor(() => expect(result.current[0].scores.aka).toBe(7))
  })

  it('keeps two views of the same match in step', async () => {
    const a = renderHook(() => useMatchState('m1', initial))
    const b = renderHook(() => useMatchState('m1', initial))
    await waitFor(() => expect(b.result.current[0]).not.toBeNull())

    act(() => {
      a.result.current[1]((s) => ({ ...s, scores: { ...s.scores, ao: 2 } }))
    })

    await waitFor(() => expect(b.result.current[0].scores.ao).toBe(2))
  })
})
