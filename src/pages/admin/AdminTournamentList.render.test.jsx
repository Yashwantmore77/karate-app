import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminTournamentList from './AdminTournamentList'

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminTournamentList uid="admin-uid" />
    </MemoryRouter>
  )

describe('AdminTournamentList - rendered UI', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows an empty state when there are no tournaments', () => {
    renderPage()
    expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument()
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
    expect(localStorage.getItem('tournaments')).toBeNull()
  })

  it('renders existing tournaments in the table with an editable status dropdown', () => {
    localStorage.setItem('tournaments', JSON.stringify([
      { id: 't1', name: 'Spring Cup', location: 'NYC', date: '2026-09-20', template: 'kata', status: 'draft' }
    ]))
    renderPage()

    expect(screen.getByText('Spring Cup')).toBeInTheDocument()
    expect(screen.getByText('NYC')).toBeInTheDocument()
    expect(screen.getByText(/draft/i)).toBeInTheDocument()
  })

  it('opens the edit modal pre-filled with the tournament name', async () => {
    localStorage.setItem('tournaments', JSON.stringify([
      { id: 't1', name: 'Spring Cup', location: 'NYC', date: '2026-09-20', template: 'kata', status: 'draft' }
    ]))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('heading', { name: /edit tournament/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Spring Cup')).toBeInTheDocument()
  })

  it('opens a confirmation dialog before deleting a tournament', async () => {
    localStorage.setItem('tournaments', JSON.stringify([
      { id: 't1', name: 'Spring Cup', location: 'NYC', date: '2026-09-20', template: 'kata', status: 'draft' }
    ]))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('heading', { name: /delete tournament\?/i })).toBeInTheDocument()

    // Tournament must still exist until the delete is confirmed
    expect(localStorage.getItem('tournaments')).toContain('Spring Cup')
  })
})
