import { describe, it, expect } from 'vitest'
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
