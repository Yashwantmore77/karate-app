import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TournamentSelector from './TournamentSelector'
import * as fake from '../../test/fakeDomain'

vi.mock('../../data/domain', () => import('../../test/fakeDomain'))

const CUPS = [
  { id: 't1', name: 'Draft Cup', location: 'Pune', startDate: '2026-12-20', lifecycleStatus: 'DRAFT' },
  { id: 't2', name: 'State Championship', location: 'Mumbai', startDate: '2026-10-21', lifecycleStatus: 'LIVE' },
]

/** Officers pick their tournament from a table: one row each, not a card. */
describe('TournamentSelector', () => {
  beforeEach(() => { fake.reset(); fake.seed({ tournaments: CUPS }) })

  it('lists each tournament as a row with its venue, date and stage', async () => {
    render(<TournamentSelector title="Registration Officer: choose a tournament" onPick={() => {}} />)
    const row = (await screen.findByText('State Championship')).closest('tr')
    expect(within(row).getByText('Mumbai')).toBeInTheDocument()
    expect(within(row).getByText('2026-10-21')).toBeInTheDocument()
    expect(within(row).getByText(/Live/)).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Tournament', 'Venue', 'Date', 'Stage', ''])
  })

  it('opens a tournament from its row or its Open button, once', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<TournamentSelector onPick={onPick} />)
    await user.click(await screen.findByText('Draft Cup'))
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't1' }))
    await user.click(within(screen.getByText('State Championship').closest('tr')).getByRole('button', { name: 'Open' }))
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't2' }))
  })

  it('finds a tournament by name or venue', async () => {
    const user = userEvent.setup()
    render(<TournamentSelector onPick={() => {}} />)
    await user.type(await screen.findByPlaceholderText('Search tournament or venue'), 'mumbai')
    expect(screen.getByText('State Championship')).toBeInTheDocument()
    expect(screen.queryByText('Draft Cup')).not.toBeInTheDocument()
  })
})
