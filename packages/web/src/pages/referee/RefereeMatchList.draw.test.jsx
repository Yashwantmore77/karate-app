import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RefereeMatchList from './RefereeMatchList'
import { HttpError } from '../../data/http'

const categoryId = 'cat-1'

const field = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, bib: String(100 + i), name: `Fighter ${i}` }))

const store = vi.hoisted(() => ({
  tournaments: { get: vi.fn() },
  categories: { find: vi.fn() },
  competitors: { list: vi.fn() },
  matches: { page: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), draw: vi.fn() },
  isRemote: true,
}))
vi.mock('../../data/domain', () => store)
vi.mock('../../data/users', () => ({ isAvailable: () => true, officials: vi.fn(async () => []) }))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/referee/category/${categoryId}`]}>
      <Routes>
        <Route
          path="/referee/category/:categoryId"
          element={<RefereeMatchList uid="u" profile={{ role: 'referee' }} />}
        />
      </Routes>
    </MemoryRouter>
  )

const drawButton = async () => {
  await screen.findByText('U14 Boys')
  return screen.findByRole('button', { name: /draw round robin/i })
}

// Opens the confirmation and presses Draw in it.
const confirmDraw = async (user) => {
  await user.click(await drawButton())
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Draw' }))
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
}

beforeEach(() => {
  vi.clearAllMocks()
  store.tournaments.get.mockResolvedValue({ id: 't1', name: 'Cup', date: '2099-01-01', judgeCount: 4 })
  store.categories.find.mockResolvedValue({ id: categoryId, tournamentId: 't1', name: 'U14 Boys' })
  store.competitors.list.mockResolvedValue(field(6))
  store.matches.page.mockResolvedValue({ rows: [], total: 0, pages: 1, page: 1 })
  store.matches.list.mockResolvedValue([])
  store.matches.draw.mockResolvedValue({ created: 15, skipped: 0, total: 15 })
})

describe('drawing a round robin', () => {
  it('says how many bouts it will make before making them', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await drawButton())
    // Six entrants is fifteen bouts. The number is shown up front because a
    // large field produces far more than anyone expects.
    expect(within(screen.getByRole('dialog')).getByText(/15 in all/)).toBeInTheDocument()
    expect(store.matches.draw).not.toHaveBeenCalled()
  })

  it('does nothing when cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await drawButton())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }))
    expect(store.matches.draw).not.toHaveBeenCalled()
  })

  it('draws for this category and reports what it made', async () => {
    const user = userEvent.setup()
    renderPage()
    await confirmDraw(user)

    expect(store.matches.draw).toHaveBeenCalledWith(categoryId)
    expect(await screen.findByText(/drew 15 bouts\./i)).toBeInTheDocument()
  })

  it('reloads the table and the standings afterwards', async () => {
    const user = userEvent.setup()
    renderPage()
    await drawButton()
    const pagesBefore = store.matches.page.mock.calls.length
    const listsBefore = store.matches.list.mock.calls.length

    await confirmDraw(user)
    await screen.findByText(/drew 15 bouts/i)
    expect(store.matches.page.mock.calls.length).toBeGreaterThan(pagesBefore)
    expect(store.matches.list.mock.calls.length).toBeGreaterThan(listsBefore)
  })

  it('mentions the pairs it skipped', async () => {
    store.matches.draw.mockResolvedValue({ created: 4, skipped: 6, total: 10 })
    const user = userEvent.setup()
    renderPage()
    await confirmDraw(user)
    expect(await screen.findByText(/drew 4 bouts, skipping 6 already made/i)).toBeInTheDocument()
  })

  it('says so plainly when there was nothing left to draw', async () => {
    store.matches.draw.mockResolvedValue({ created: 0, skipped: 15, total: 15 })
    const user = userEvent.setup()
    renderPage()
    await confirmDraw(user)
    expect(await screen.findByText(/every pair already has a bout/i)).toBeInTheDocument()
  })

  it('explains a field too large for a round robin', async () => {
    store.matches.draw.mockRejectedValue(
      new HttpError(400, 'too_many_for_round_robin', { max: 32, count: 40 })
    )
    const user = userEvent.setup()
    renderPage()
    await confirmDraw(user)
    // The empty-table banner is an alert too, so the error is found by its text.
    const message = await screen.findByText(/limited to 32 competitors/i)
    expect(message).toHaveTextContent(/has 40/i)
    expect(message.closest('[role="alert"]')).toHaveClass('MuiAlert-colorError')
  })

  it('is unavailable with fewer than two competitors', async () => {
    store.competitors.list.mockResolvedValue(field(1))
    renderPage()
    expect(await drawButton()).toBeDisabled()
  })
})
