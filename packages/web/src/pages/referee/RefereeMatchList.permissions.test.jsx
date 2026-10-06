import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// What the API refuses, and how the page shows it: the data module is stubbed
// with writes that can fail.
const domain = vi.hoisted(() => ({
  tournaments: { get: vi.fn() },
  categories: { find: vi.fn() },
  competitors: { list: vi.fn() },
  matches: { list: vi.fn(), page: vi.fn(), create: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../data/domain', () => domain)

const RefereeMatchList = (await import('./RefereeMatchList')).default

const categoryId = 'cat-1'

const COMPETITORS = [
  { id: 'comp-1', bib: '101', name: 'Alice' },
  { id: 'comp-2', bib: '102', name: 'Bob' },
]

const A_MATCH = { id: 'match-1', categoryId, redId: 'comp-1', blueId: 'comp-2', status: 'open' }

const renderPage = (role) =>
  render(
    <MemoryRouter initialEntries={[`/referee/category/${categoryId}`]}>
      <Routes>
        <Route
          path="/referee/category/:categoryId"
          element={<RefereeMatchList uid="uid-1" profile={{ role }} />}
        />
      </Routes>
    </MemoryRouter>
  )

const openCreateDialog = async (user) => {
  await user.click(await screen.findByRole('button', { name: /new match/i }))
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getAllByRole('combobox')[0])
  await user.click(await screen.findByRole('option', { name: /alice/i }))
  await user.click(within(dialog).getAllByRole('combobox')[1])
  await user.click(await screen.findByRole('option', { name: /bob/i }))
  return dialog
}

beforeEach(() => {
  vi.clearAllMocks()
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)

  domain.categories.find.mockResolvedValue({ id: categoryId, tournamentId: 't1', name: 'U12 Boys Kumite' })
  domain.tournaments.get.mockResolvedValue({ id: 't1', date: future.toISOString().split('T')[0] })
  domain.competitors.list.mockResolvedValue(COMPETITORS)
  domain.matches.list.mockResolvedValue([A_MATCH])
  domain.matches.page.mockResolvedValue({ rows: [A_MATCH], total: 1, pages: 1, page: 1 })
  domain.matches.create.mockResolvedValue(A_MATCH)
  domain.matches.remove.mockResolvedValue(null)
})

describe('RefereeMatchList against a server', () => {
  it('offers a referee no delete button, because the server would refuse it', async () => {
    renderPage('referee')
    await screen.findByText('U12 Boys Kumite')
    expect(screen.queryByTitle('Delete Match')).not.toBeInTheDocument()
  })

  it('still offers delete to an administrator', async () => {
    renderPage('admin')
    await screen.findByText('U12 Boys Kumite')
    expect(await screen.findByTitle('Delete Match')).toBeInTheDocument()
  })

  it('lets a referee schedule a bout', async () => {
    const user = userEvent.setup()
    renderPage('referee')
    await screen.findByText('U12 Boys Kumite')

    const dialog = await openCreateDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    expect(domain.matches.create).toHaveBeenCalledWith(categoryId, {
      redId: 'comp-1',
      blueId: 'comp-2',
      status: 'open',
    })
  })

  it('says why a refused schedule failed instead of doing nothing', async () => {
    domain.matches.create.mockRejectedValue(
      Object.assign(new Error('forbidden'), { code: 'forbidden' })
    )
    const user = userEvent.setup()
    renderPage('referee')
    await screen.findByText('U12 Boys Kumite')

    const dialog = await openCreateDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    // The whole point: the dialog stays put, with the reason on it. Closing
    // over a failure is what made this look like a dead button.
    expect(await within(dialog).findByText(/cannot schedule matches/i)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reports a failure that is not about permissions in plain words', async () => {
    domain.matches.create.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    renderPage('referee')
    await screen.findByText('U12 Boys Kumite')

    const dialog = await openCreateDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    expect(await within(dialog).findByText(/could not save that/i)).toBeInTheDocument()
  })
})
