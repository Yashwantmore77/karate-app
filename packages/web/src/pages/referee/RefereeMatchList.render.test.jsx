import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RefereeMatchList from './RefereeMatchList'
import * as fake from '../../test/fakeDomain'

vi.mock('../../data/domain', () => import('../../test/fakeDomain'))
vi.mock('../../data/users', () => ({ officials: vi.fn(async () => []) }))

const categoryId = 'cat-1'

const seed = () => {
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  fake.seed({ tournaments: [
    { id: 't1', name: 'Spring Cup', location: 'NYC', date: future.toISOString().split('T')[0], template: 'kumite', status: 'active' }
  ] })
  fake.seed({ categories: [
    { id: categoryId, tournamentId: 't1', name: 'U12 Boys Kumite', ageGroup: 'U12', gender: 'M', division: 'Beginner' }
  ] })
  fake.seed({ competitors: [
    { id: 'comp-1', bib: '101', name: 'Alice' },
    { id: 'comp-2', bib: '102', name: 'Bob' }
  ].map((row) => ({ ...row, categoryId: categoryId })) })
}

// Opened as an admin, the one role that may also delete a bout.
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/referee/category/${categoryId}`]}>
      <Routes>
        <Route path="/referee/category/:categoryId" element={<RefereeMatchList uid="ref-uid" profile={{ role: 'admin' }} />} />
      </Routes>
    </MemoryRouter>
  )

describe('RefereeMatchList - rendered UI', () => {
  beforeEach(() => {
    fake.reset()
    seed()
  })

  it('shows the category name and an empty matches state', async () => {
    renderPage()
    expect(await screen.findByText('U12 Boys Kumite')).toBeInTheDocument()
    expect(screen.getByText(/no matches yet/i)).toBeInTheDocument()
  })

  it('creates a match end-to-end through the modal and lists it in the table', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /new match/i }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getAllByRole('combobox')[0])
    await user.click(await screen.findByRole('option', { name: /alice/i }))

    await user.click(within(dialog).getAllByRole('combobox')[1])
    await user.click(await screen.findByRole('option', { name: /bob/i }))

    await user.click(within(dialog).getByRole('button', { name: /create match/i }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()

    const stored = fake.rows('matches')
    expect(stored).toHaveLength(1)
    expect(stored[0].redId).toBe('comp-1')
    expect(stored[0].blueId).toBe('comp-2')
  })

  it('rejects submitting the same competitor for both sides', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /new match/i }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getAllByRole('combobox')[0])
    await user.click(await screen.findByRole('option', { name: /alice/i }))

    await user.click(within(dialog).getAllByRole('combobox')[1])
    await user.click(await screen.findByRole('option', { name: /alice/i }))

    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    expect(await within(dialog).findByText(/must be different/i)).toBeInTheDocument()
    expect(fake.rows('matches')).toHaveLength(0)
  })

  it('deletes a match after confirmation', async () => {
    fake.seed({ matches: [
      { id: 'match-1', categoryId, redId: 'comp-1', blueId: 'comp-2', status: 'open', createdAt: new Date().toISOString() }
    ].map((row) => ({ ...row, categoryId: categoryId })) })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /delete match/i }))
    expect(screen.getByRole('heading', { name: /delete match\?/i })).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    expect(await screen.findByText(/no matches yet/i)).toBeInTheDocument()
    expect(fake.rows('matches')).toHaveLength(0)
  })
})
