import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { track } from '../../data/http'
import useDashboard from './useDashboard'

const data = vi.hoisted(() => ({ dashboard: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { dashboard: data.dashboard } }))

const settle = () => act(async () => { await vi.runOnlyPendingTimersAsync() })

/** KAN-368: the guide bar and the Dashboard tab share one load of the numbers. */
describe('useDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    data.dashboard.mockReset().mockResolvedValue({ players: 12 })
  })
  afterEach(() => vi.useRealTimers())

  it('loads once, and once more after a burst of saves', async () => {
    const { result } = renderHook(() => useDashboard('t1', 1))
    await settle()
    expect(result.current).toEqual({ players: 12 })
    expect(data.dashboard).toHaveBeenCalledTimes(1)

    // Three saves in a row ("approve all"), then the burst settles: one reload.
    await act(async () => { await Promise.all([1, 2, 3].map(() => track(Promise.resolve(), { method: 'POST' }))) })
    await settle()
    expect(data.dashboard).toHaveBeenCalledTimes(2)
    // Reading something does not reload it.
    await act(async () => { await track(Promise.resolve(), { method: 'GET' }) })
    await settle()
    expect(data.dashboard).toHaveBeenCalledTimes(2)
  })

  it('does not load twice when the tournament reloads right after a save', async () => {
    const { rerender } = renderHook(({ version }) => useDashboard('t1', version), { initialProps: { version: 1 } })
    await settle()
    // A lock saved, then the tournament reloaded (version + 1) before the save burst settles.
    await act(async () => { await track(Promise.resolve(), { method: 'POST' }) })
    rerender({ version: 2 })
    await settle()
    expect(data.dashboard).toHaveBeenCalledTimes(2)
  })

  it('waits for the tournament before loading anything', async () => {
    const { rerender } = renderHook(({ version }) => useDashboard('t1', version), { initialProps: { version: 0 } })
    await settle()
    expect(data.dashboard).not.toHaveBeenCalled()
    rerender({ version: 1 })
    await settle()
    expect(data.dashboard).toHaveBeenCalledTimes(1)
  })
})
