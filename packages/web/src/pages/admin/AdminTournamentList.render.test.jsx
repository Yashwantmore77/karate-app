import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminTournamentList from './AdminTournamentList'
import * as fake from '../../test/fakeDomain'

vi.mock('../../data/domain', () => import('../../test/fakeDomain'))

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminTournamentList uid="admin-uid" />
    </MemoryRouter>
  )

const SPRING_CUP = {
  id: 't1', name: 'Spring Cup', location: 'NYC', date: '2026-09-20',
  template: 'kata', status: 'draft', judgeCount: 4, slotMinutes: 15,
}

describe('AdminTournamentList - rendered UI', () => {
  beforeEach(() => fake.reset())

  it('shows an empty state when there are no tournaments', async () => {
    renderPage()
    expect(await screen.findByText(/no tournaments yet/i)).toBeInTheDocument()
  })

  it('opens the create modal when "New Tournament" is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /new tournament/i }))
    expect(screen.getByRole('heading', { name: /create tournament/i })).toBeInTheDocument()
  })

  it('shows inline validation errors instead of submitting when required fields are empty', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /new tournament/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /create tournament/i }))

    expect(await within(dialog).findByText(/tournament name required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/location required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/date required/i)).toBeInTheDocument()

    // Nothing should have been persisted
    expect(fake.rows('tournaments')).toHaveLength(0)
  })

  it('renders existing tournaments in the table with an editable status dropdown', async () => {
    fake.seed({ tournaments: [SPRING_CUP] })
    renderPage()

    expect(await screen.findByText('Spring Cup')).toBeInTheDocument()
    expect(screen.getByText('NYC')).toBeInTheDocument()
    expect(screen.getByText(/draft/i)).toBeInTheDocument()
  })

  it('opens the edit modal pre-filled with the tournament name', async () => {
    fake.seed({ tournaments: [SPRING_CUP] })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /edit/i }))
    expect(screen.getByRole('heading', { name: /edit tournament/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Spring Cup')).toBeInTheDocument()
  })

  it('opens a confirmation dialog before deleting a tournament', async () => {
    fake.seed({ tournaments: [SPRING_CUP] })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /delete/i }))
    expect(screen.getByRole('heading', { name: /delete tournament\?/i })).toBeInTheDocument()

    // Tournament must still exist until the delete is confirmed
    expect(fake.rows('tournaments').map((t) => t.name)).toContain('Spring Cup')
  })

  it('saves the slot length and panel size as numbers', async () => {
    // The fields are text inputs, and the API types both strictly, so a "20"
    // sent as a string is refused rather than stored.
    fake.seed({ tournaments: [SPRING_CUP] })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /edit/i }))
    const dialog = screen.getByRole('dialog')
    const slot = within(dialog).getByLabelText(/slot length/i)
    await user.clear(slot)
    await user.type(slot, '20')
    const judges = within(dialog).getByLabelText(/judges on a panel/i)
    await user.clear(judges)
    await user.type(judges, '3')
    await user.click(within(dialog).getByRole('button', { name: /update tournament/i }))

    await vi.waitFor(() => expect(fake.rows('tournaments')[0].slotMinutes).toBe(20))
    expect(fake.rows('tournaments')[0].judgeCount).toBe(3)
  })

  it('refuses a slot length outside 1 to 240 minutes', async () => {
    fake.seed({ tournaments: [SPRING_CUP] })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /edit/i }))
    const dialog = screen.getByRole('dialog')
    const slot = within(dialog).getByLabelText(/slot length/i)
    await user.clear(slot)
    await user.type(slot, '500')
    await user.click(within(dialog).getByRole('button', { name: /update tournament/i }))

    expect(await within(dialog).findByText(/at most four hours/i)).toBeInTheDocument()
    expect(fake.rows('tournaments')[0].slotMinutes).toBe(15)
  })
})
