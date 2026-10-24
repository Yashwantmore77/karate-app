import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import MatCard from './MatCard'

const bout = { id: 'm1', matchNumber: 'M-001', mat: 1, status: 'live', category: 'Boys 12-13 -35 KG', stage: 'pool', pool: 'A', aka: 'Aka 1', ao: 'Ao 1' }

describe('a mat card (KAN-428)', () => {
  afterEach(() => vi.useRealTimers())

  it('stops saying LIVE once its scoreboard falls silent, even with the clock stopped', () => {
    vi.useFakeTimers()
    const board = { akaScore: 2, aoScore: 1, senshu: null, clock: { running: false, remainingMs: 60_000, startedAt: null }, heartbeatAt: Date.now() - 14_000 }
    render(<MatCard mat={1} now={bout} next={[]} board={board} />)
    expect(screen.getByText('● LIVE')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.getByText('NOW')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // the last known score stays
  })
})
