import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RefereeMatchList from './RefereeMatchList'

const categoryId = 'cat-1'

const COMPETITORS = [
  { id: 'c1', bib: '101', name: 'Aarav Deshmukh' },
  { id: 'c2', bib: '102', name: 'Rohan Kulkarni' },
  { id: 'c3', bib: '103', name: 'Ishaan Joshi' },
]

const done = (id, redId, blueId, winner) => ({
  id, categoryId, redId, blueId, status: 'completed', winner, avgRed: 0, avgBlue: 0,
})

// The whole category: Aarav has beaten both others.
const EVERY_MATCH = [
  done('m1', 'c1', 'c2', 'red'),
  done('m2', 'c1', 'c3', 'red'),
  done('m3', 'c2', 'c3', 'blue'),
]

const store = vi.hoisted(() => ({
  tournaments: { get: vi.fn() },
  categories: { find: vi.fn() },
  competitors: { list: vi.fn() },
  matches: { page: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
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
          element={<RefereeMatchList uid="u" profile={{ role: 'admin' }} />}
        />
      </Routes>
    </MemoryRouter>
  )

// The row of the standings table for one competitor, as its cell texts.
const standingsRow = async (name) => {
  const heading = await screen.findByRole('columnheader', { name: 'Played' })
  const table = heading.closest('table')
  const row = within(table).getByText(name).closest('tr')
  return within(row).getAllByRole('cell').map((cell) => cell.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
  store.tournaments.get.mockResolvedValue({ id: 't1', name: 'Cup', date: '2099-01-01', judgeCount: 4 })
  store.categories.find.mockResolvedValue({ id: categoryId, tournamentId: 't1', name: 'U14 Boys' })
  store.competitors.list.mockResolvedValue(COMPETITORS)
  // The table shows only one bout — one page, or one search hit.
  store.matches.page.mockResolvedValue({ rows: [EVERY_MATCH[0]], total: 3, pages: 3, page: 1 })
  store.matches.list.mockResolvedValue(EVERY_MATCH)
  store.matches.remove.mockResolvedValue()
})

describe('standings', () => {
  it('count every bout in the category, not the page on screen', async () => {
    renderPage()
    // [#, competitor, played, W, L, T, diff]: two played, two won. Built from
    // the one visible row it would have read one played, one won.
    const cells = await standingsRow('Aarav Deshmukh')
    expect(cells.slice(2, 5)).toEqual(['2', '2', '0'])
  })

  it('include a competitor who does not appear on the visible page', async () => {
    renderPage()
    // Ishaan is only in m2 and m3, neither of which is on the page shown.
    const cells = await standingsRow('Ishaan Joshi')
    expect(cells.slice(2, 5)).toEqual(['2', '1', '1'])
  })

  it('are re-read after a bout is deleted', async () => {
    const user = userEvent.setup()
    renderPage()
    await standingsRow('Aarav Deshmukh')
    expect(store.matches.list).toHaveBeenCalledTimes(1)

    store.matches.list.mockResolvedValue(EVERY_MATCH.slice(1))
    await user.click(screen.getByTitle('Delete Match'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(store.matches.list).toHaveBeenCalledTimes(2)
    // m1 is gone, so Aarav has played one.
    await vi.waitFor(async () => {
      expect((await standingsRow('Aarav Deshmukh')).slice(2, 4)).toEqual(['1', '1'])
    })
  })
})
