import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MatchesTab from './MatchesTab'

const data = vi.hoisted(() => ({ matches: vi.fn(), correctResult: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { matches: data.matches, correctResult: data.correctResult }, describeError: (err) => err.message }))
vi.mock('../../data/officials', () => ({ listOfficials: async () => [] }))
vi.mock('../../data/domain', () => ({ matches: { update: vi.fn() } }))

const tournament = { id: 't1', name: 'Pune Open', settings: { mats: 2 } }
const BOUT = {
  id: 'm1', categoryId: 'c1', matchNumber: 'M-001', mat: 1, stage: 'pool', poolName: 'A', round: 1, categoryName: 'Boys 12-13 -35 KG',
  akaName: 'Aarav Patil', aoName: 'Rohan Kulkarni', redId: 'a', blueId: 'b',
}
const CANCELLED = { ...BOUT, status: 'cancelled', winner: null, resultType: 'CANCELLED', result: { type: 'CANCELLED', finishReason: 'Wrong pairing' } }

const openResult = async (user, bout, name) => {
  data.matches.mockResolvedValue([bout])
  const action = { run: vi.fn(async (fn) => fn()), notify: vi.fn() }
  render(<MemoryRouter><MatchesTab tournament={tournament} version={0} action={action} /></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

/** KAN-268 points 2 and 7: a cancelled bout is a decided bout in the result dialog. */
describe('the result dialog on a cancelled bout', () => {
  beforeEach(() => {
    data.matches.mockReset()
    data.correctResult.mockReset().mockResolvedValue({})
  })

  it('says it was cancelled and why, and how to put it back in the queue', async () => {
    const user = userEvent.setup()
    const dialog = await openResult(user, CANCELLED, 'Correct result')
    expect(within(dialog).getByText(/Correct result — M-001/)).toBeInTheDocument()
    expect(within(dialog).getByText(/This bout was cancelled: Wrong pairing/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Change status → Scheduled/)).toBeInTheDocument()
  })

  it('needs a reason before a result can be saved on it', async () => {
    const user = userEvent.setup()
    const dialog = await openResult(user, CANCELLED, 'Correct result')
    const save = within(dialog).getByRole('button', { name: 'Save result' })
    expect(save).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/^Reason/), 'Bout fought after all')
    expect(save).toBeEnabled()
    await user.click(save)
    expect(data.correctResult).toHaveBeenCalledWith('t1', 'm1', expect.objectContaining({ resultType: 'COMPLETED', winner: 'red' }), 'Bout fought after all')
  })

  it('leaves a bout still to be fought as a first entry, with no reason needed', async () => {
    const user = userEvent.setup()
    const dialog = await openResult(user, { ...BOUT, status: 'scheduled' }, 'Enter result')
    expect(within(dialog).getByText(/Enter result — M-001/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/This bout was cancelled/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save result' })).toBeEnabled()
  })

  it('names the scores by event and says what the reason is for (KAN-268)', async () => {
    const user = userEvent.setup()
    let dialog = await openResult(user, { ...BOUT, status: 'scheduled', divisionKey: 'kumite:g1:w1' }, 'Enter result')
    expect(within(dialog).getByLabelText('AKA points')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('AO points')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Note for the audit log (optional)')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    cleanup()
    dialog = await openResult(user, { ...CANCELLED, divisionKey: 'kata:g1:-' }, 'Correct result')
    expect(within(dialog).getByLabelText('AKA score')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Reason for the correction/)).toBeRequired()
  })
})
