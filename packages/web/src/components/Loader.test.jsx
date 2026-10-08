import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, renderHook, waitFor } from '@testing-library/react'
import DataTable from './tms/DataTable'
import { useLoading } from './Loader'

describe('loaders', () => {
  it('shows a spinner in an empty table while it loads, then the empty message', () => {
    const columns = [{ key: 'name', label: 'Name' }]
    const { rerender } = render(<DataTable rows={[]} columns={columns} loading empty="Nothing here." />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument()
    rerender(<DataTable rows={[]} columns={columns} empty="Nothing here." />)
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  })

  it('is loading until the first load settles, and refreshing on later ones', async () => {
    const { result } = renderHook(() => useLoading())
    expect(result.current.loading).toBe(true)
    let finish
    await act(async () => { await result.current.wrap(Promise.resolve()) })
    expect(result.current).toMatchObject({ loading: false, refreshing: false })
    act(() => { result.current.wrap(new Promise((r) => { finish = r })) })
    expect(result.current).toMatchObject({ loading: false, refreshing: true })
    await act(async () => { finish() })
    await waitFor(() => expect(result.current.refreshing).toBe(false))
  })
})

describe('spinners on every request', () => {
  it('counts requests and writes, and puts a spinner on the button that asked until it is answered', async () => {
    vi.useFakeTimers()
    const { track, getInFlight, getWrites } = await import('../data/http')
    const { trackButtonRequests } = await import('./Loader')
    const stop = trackButtonRequests(document)
    const button = document.createElement('button')
    button.className = 'MuiButton-root'
    document.body.appendChild(button)
    button.click()
    let finish
    const pending = track(new Promise((r) => { finish = r }), { method: 'POST' })
    expect([getInFlight(), getWrites()]).toEqual([1, 1])
    // A quick answer never flickers; a slower one shows the spinner.
    expect(button.hasAttribute('data-kt-busy')).toBe(false)
    vi.advanceTimersByTime(200)
    expect(button.hasAttribute('data-kt-busy')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    finish()
    await pending
    expect([getInFlight(), getWrites()]).toEqual([0, 0])
    expect(button.hasAttribute('data-kt-busy')).toBe(false)
    // A request nobody clicked for (a background load) marks no button.
    vi.advanceTimersByTime(5000)
    await track(Promise.resolve())
    vi.advanceTimersByTime(200)
    expect(button.hasAttribute('data-kt-busy')).toBe(false)
    stop()
    button.remove()
    vi.useRealTimers()
  })
})
