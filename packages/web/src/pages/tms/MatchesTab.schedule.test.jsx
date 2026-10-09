import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MatchesTab from './MatchesTab'

// The tests run on Indian time (vitest.config.js), five and a half hours
// ahead of UTC, where reading a stored time as if it were local shows.

const data = vi.hoisted(() => ({ matches: vi.fn(), update: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { matches: data.matches }, describeError: (err) => err.message }))
vi.mock('../../data/officials', () => ({ listOfficials: async () => [] }))
vi.mock('../../data/domain', () => ({ matches: { update: data.update } }))

const tournament = { id: 't1', name: 'Pune Open', settings: { mats: 2 } }
// 10:00 in the hall in Pune is 04:30 UTC.
const BOUT = {
  id: 'm1', categoryId: 'c1', matchNumber: 'M-001', mat: 1, scheduledAt: '2027-01-15T04:30:00.000Z', status: 'scheduled',
  stage: 'pool', poolName: 'A', round: 1, categoryName: 'Boys 12-13 -35 KG', akaName: 'Aarav Patil', aoName: 'Rohan Kulkarni', redId: 'a', blueId: 'b',
}

const openSchedule = async (user) => {
  render(<MemoryRouter><MatchesTab tournament={tournament} version={0} action={{ run: vi.fn(), notify: vi.fn() }} /></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: 'Schedule' }))
  return screen.findByRole('dialog')
}

describe('scheduling a bout', () => {
  beforeEach(() => {
    data.matches.mockReset().mockResolvedValue([BOUT])
    data.update.mockReset().mockResolvedValue({})
  })

  it('shows the time as the clock in the hall reads it, and saving leaves it alone', async () => {
    const user = userEvent.setup()
    const dialog = await openSchedule(user)
    expect(within(dialog).getByLabelText('Time')).toHaveValue('2027-01-15T10:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(data.update).toHaveBeenCalledWith('c1', 'm1', expect.objectContaining({ mat: 1, scheduledAt: '2027-01-15T04:30:00.000Z' }))
  })

  it('saves a time typed in as that time in the hall', async () => {
    const user = userEvent.setup()
    const dialog = await openSchedule(user)
    const time = within(dialog).getByLabelText('Time')
    await user.clear(time)
    await user.type(time, '2027-01-15T11:15')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(data.update).toHaveBeenCalledWith('c1', 'm1', expect.objectContaining({ scheduledAt: '2027-01-15T05:45:00.000Z' }))
  })
})
