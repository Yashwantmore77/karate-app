import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminTournamentList from './AdminTournamentList'
import * as fake from '../../test/fakeDomain'

vi.mock('../../data/domain', () => import('../../test/fakeDomain'))

const OWNED = {
  id: 't1', name: 'Spring Cup', location: 'NYC', date: '2026-09-20',
  template: 'kata', status: 'draft', judgeCount: 4, slotMinutes: 15,
}

const renderAs = (role) =>
  render(
    <MemoryRouter>
      <AdminTournamentList uid="uid-1" profile={{ role }} basePath={role === 'tournament_owner' ? '/tournament_owner' : '/admin'} />
    </MemoryRouter>
  )

/**
 * An owner runs the tournaments it was given but does not add or remove one,
 * so the screen offers neither. The API refuses both as well; this keeps the
 * buttons from promising what the server would turn down.
 */
describe('AdminTournamentList - a tournament owner', () => {
  beforeEach(() => fake.reset())

  it('offers no way to create or delete a tournament', async () => {
    fake.seed({ tournaments: [OWNED] })
    renderAs('tournament_owner')

    expect(await screen.findByText('Spring Cup')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new tournament/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    expect(screen.getByRole('heading', { name: /my tournaments/i })).toBeInTheDocument()
  })

  it('still offers both to an administrator', async () => {
    fake.seed({ tournaments: [OWNED] })
    renderAs('admin')

    expect(await screen.findByText('Spring Cup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new tournament/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })
})
