import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicTournament from './PublicTournament'

// KAN-428: the public Live tab, mat by mat, with the live score of the bout on
// each mat as its scoreboard shows it, and the bouts coming next.

const data = vi.hoisted(() => ({ view: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { public: { view: data.view } } }))
vi.mock('../../data/live', () => ({ watchPublicChanges: () => () => {} }))
const sock = vi.hoisted(() => {
  const handlers = {}
  return {
    handlers,
    on: (event, fn) => { handlers[event] = fn },
    off: (event) => { delete handlers[event] },
  }
})
vi.mock('../../data/channel/socket', async (importOriginal) => ({ ...(await importOriginal()), publicSocket: () => sock }))

const bout = (n, mat, extra = {}) => ({
  id: `m${n}`, matchNumber: `M-00${n}`, mat, status: 'scheduled', event: 'kumite', divisionKey: 'kumite:g1:w1',
  category: 'Boys 12-13 -35 KG', stage: 'pool', pool: 'A', round: 1, aka: `Aka ${n}`, ao: `Ao ${n}`, scoreboard: null, ...extra,
})
const stopped = { running: false, remainingMs: 83_000, startedAt: null }

const openLive = async () => {
  render(<MemoryRouter initialEntries={['/t/pune-open']}><Routes><Route path="/t/:slug" element={<PublicTournament />} /></Routes></MemoryRouter>)
  await userEvent.setup().click(await screen.findByRole('tab', { name: 'Live matches' }))
}
const side = (card, name) => within(card).getByText(name).parentElement

describe('the public Live tab', () => {
  it('shows each mat with the bout on it, its live score and clock, and what is called and next', async () => {
    data.view.mockResolvedValue({
      tournament: { name: 'Pune Open', lifecycleStatus: 'LIVE', type: 'kata_kumite', runningEvent: 'kumite' },
      categories: [], teams: [], players: [], results: [],
      matches: [
        bout(1, 1, { status: 'live', scoreboard: { akaScore: 3, aoScore: 1, senshu: 'aka', clock: stopped, outcome: null, heartbeatAt: Date.now() } }),
        bout(2, 1, { calledAt: '2026-10-23T09:00:00Z' }),
        bout(4, 1),
        bout(3, 2),
        bout(5, 1, { status: 'completed', winner: 'red' }),
      ],
    })
    await openLive()

    const mat1 = screen.getByTestId('mat-1')
    expect(within(mat1).getByText('● LIVE')).toBeInTheDocument()
    expect(within(mat1).getByText('1:23')).toBeInTheDocument()
    expect(within(side(mat1, 'Aka 1 · senshu')).getByText('3')).toBeInTheDocument()
    expect(within(side(mat1, 'Ao 1')).getByText('1')).toBeInTheDocument()
    const next = within(mat1).getByText('Next · M-002').parentElement
    expect(within(next).getByText('Called')).toBeInTheDocument()
    expect(within(mat1).getByText('Then · M-004')).toBeInTheDocument()
    expect(within(mat1).queryByText(/M-005/)).not.toBeInTheDocument()

    const mat2 = screen.getByTestId('mat-2')
    expect(within(mat2).getByText('Mat free')).toBeInTheDocument()
    expect(within(mat2).getByText('Next · M-003')).toBeInTheDocument()
  })

  it('follows the scores the mat scoreboards push, and drops the score once the scoreboard closes', async () => {
    data.view.mockResolvedValue({
      tournament: { name: 'Pune Open', lifecycleStatus: 'LIVE', type: 'kumite' },
      categories: [], teams: [], players: [], results: [],
      matches: [bout(1, 1, { status: 'live' }), bout(2, 2, { status: 'live' })],
    })
    await openLive()
    const mat1 = screen.getByTestId('mat-1')
    // Not on a scoreboard yet: the bout, with no score.
    expect(within(mat1).getByText('NOW')).toBeInTheDocument()
    expect(within(side(mat1, 'Aka 1')).queryByText(/^\d+$/)).not.toBeInTheDocument()

    // The console scores mat 1; a scoreboard on mat 2 showing another bout leaves mat 1 alone.
    const push = (mat, display) => act(() => sock.handlers['display:mat']({ mat, display }))
    push(1, { status: 'open', matchId: 'm1', akaScore: 2, aoScore: 0, senshu: null, clock: stopped, heartbeatAt: Date.now() })
    push(2, { status: 'open', matchId: 'other', akaScore: 8, aoScore: 8, heartbeatAt: Date.now() })
    expect(within(mat1).getByText('● LIVE')).toBeInTheDocument()
    expect(within(side(mat1, 'Aka 1')).getByText('2')).toBeInTheDocument()
    expect(within(side(mat1, 'Ao 1')).getByText('0')).toBeInTheDocument()
    expect(within(screen.getByTestId('mat-2')).queryByText('8')).not.toBeInTheDocument()

    push(1, { status: 'open', matchId: 'm1', akaScore: 4, aoScore: 0, senshu: null, clock: stopped, heartbeatAt: Date.now(), outcome: 'AKA wins' })
    expect(within(side(mat1, 'Aka 1')).getByText('4')).toBeInTheDocument()
    expect(within(mat1).getByText('AKA wins')).toBeInTheDocument()

    push(1, { status: 'closed', matchId: 'm1', akaScore: 4, aoScore: 0 })
    expect(within(mat1).getByText('NOW')).toBeInTheDocument()
    expect(within(side(mat1, 'Aka 1')).queryByText('4')).not.toBeInTheDocument()
  })

  it('shows a scoreboard not heard from for a while as last known, not live', async () => {
    data.view.mockResolvedValue({
      tournament: { name: 'Pune Open', lifecycleStatus: 'LIVE', type: 'kumite' },
      categories: [], teams: [], players: [], results: [],
      matches: [bout(1, 1, { status: 'live', scoreboard: { akaScore: 1, aoScore: 0, senshu: null, clock: stopped, outcome: null, heartbeatAt: Date.now() - 60_000 } })],
    })
    await openLive()
    const mat1 = screen.getByTestId('mat-1')
    expect(within(mat1).getByText('NOW')).toBeInTheDocument()
    expect(within(side(mat1, 'Aka 1')).getByText('1')).toBeInTheDocument()
  })
})
