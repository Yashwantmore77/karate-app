import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MatchesTab from './MatchesTab'

const data = vi.hoisted(() => ({ matches: vi.fn(), correctResult: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { matches: data.matches, correctResult: data.correctResult }, describeError: (err) => err.message }))
vi.mock('../../data/officials', () => ({ listOfficials: async () => [] }))
vi.mock('../../data/domain', () => ({ matches: { update: vi.fn() } }))

const BOUT = {
  id: 'm1', categoryId: 'c1', matchNumber: 'M-001', mat: 1, status: 'scheduled', stage: 'pool', poolName: 'A', round: 1,
  categoryName: 'Boys 12-13 -35 KG', akaName: 'Aarav Patil', aoName: 'Rohan Kulkarni', redId: 'a', blueId: 'b',
}

/** KAN-268 point 3: a cancellation is asked for its reason and named on the button. */
describe('cancelling a bout from the result dialog', () => {
  beforeEach(() => {
    data.matches.mockReset().mockResolvedValue([BOUT])
    data.correctResult.mockReset().mockResolvedValue({})
  })

  it('asks why before cancelling, and says so on the button', async () => {
    const user = userEvent.setup()
    const action = { run: vi.fn(async (fn) => fn()), notify: vi.fn() }
    render(<MemoryRouter><MatchesTab tournament={{ id: 't1', name: 'Pune Open', settings: { mats: 2 } }} version={0} action={action} /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Enter result' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Result' }))
    await user.click(await screen.findByRole('option', { name: 'Cancelled (no result)' }))
    expect(within(dialog).getByText(/counts for nobody/)).toBeInTheDocument()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel this bout' })
    expect(cancel).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Why is it cancelled/), 'Wrong pairing')
    await user.click(cancel)
    expect(data.correctResult).toHaveBeenCalledWith('t1', 'm1', expect.objectContaining({ resultType: 'CANCELLED', winner: null, finishReason: 'Wrong pairing' }), null)
  })
})
