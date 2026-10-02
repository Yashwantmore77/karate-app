import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import AppNav, { activeItem } from './AppNav'

const USER = { uid: 'u1', email: 'referee@kata.local' }

const ShowPath = () => <span data-testid="path">{useLocation().pathname}</span>

const renderNav = ({ role = 'admin', at = '/admin', user = USER } = {}) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <AppNav user={user} profile={role ? { role } : null} />
      <Routes>
        <Route path="*" element={<ShowPath />} />
      </Routes>
    </MemoryRouter>
  )

// The nav renders both a desktop row and a drawer list, so a label can legitimately
// appear more than once; the visible row is the first.
const navButton = (name) => screen.getAllByRole('button', { name })[0]

describe('activeItem', () => {
  const items = [
    { label: 'Tournaments', to: '/admin' },
    { label: 'Accounts', to: '/admin/accounts' },
    { label: 'Scoreboard', to: '/display' },
  ]

  it('picks the most specific entry, not merely the first that matches', () => {
    // Every admin path begins with /admin, so a plain prefix test would light up
    // Tournaments and Accounts at the same time.
    expect(activeItem(items, '/admin/accounts').label).toBe('Accounts')
  })

  it('keeps a deep page under the section it belongs to', () => {
    expect(activeItem(items, '/admin/tournament/t1').label).toBe('Tournaments')
    expect(activeItem(items, '/admin/tournament/t1/category/c1').label).toBe('Tournaments')
  })

  it('matches a section exactly', () => {
    expect(activeItem(items, '/admin').label).toBe('Tournaments')
    expect(activeItem(items, '/display').label).toBe('Scoreboard')
  })

  it('does not treat a longer name as a child path', () => {
    // /administration is not inside /admin.
    expect(activeItem(items, '/administration')).toBeNull()
  })

  it('reports nothing when the URL is outside the menu', () => {
    expect(activeItem(items, '/referee')).toBeNull()
  })
})

describe('AppNav', () => {
  it('shows every option for the role, so nothing is hidden behind a page', async () => {
    renderNav({ role: 'admin' })
    expect(navButton('Tournaments')).toBeInTheDocument()
    expect(navButton('Accounts')).toBeInTheDocument()
    expect(navButton('Scoreboard')).toBeInTheDocument()
  })

  it('offers each role only what it can reach', () => {
    renderNav({ role: 'judge', at: '/judge' })
    expect(navButton('Matches')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tournaments' })).not.toBeInTheDocument()
  })

  it('gives an admin the match screens, and marks them while there', () => {
    // An admin schedules, draws and deletes bouts on the referee screens, so
    // the menu has to lead there, and show where they are once inside.
    renderNav({ role: 'admin', at: '/referee/category/c1' })
    expect(navButton('Matches')).toHaveAttribute('aria-current', 'page')
    expect(navButton('Tournaments')).not.toHaveAttribute('aria-current')
  })

  it('marks the item matching the URL as the current page', () => {
    renderNav({ role: 'admin', at: '/admin/accounts' })
    expect(navButton('Accounts')).toHaveAttribute('aria-current', 'page')
    expect(navButton('Tournaments')).not.toHaveAttribute('aria-current')
  })

  it('keeps the section marked while on one of its detail pages', () => {
    renderNav({ role: 'admin', at: '/admin/tournament/t1' })
    expect(navButton('Tournaments')).toHaveAttribute('aria-current', 'page')
    expect(navButton('Accounts')).not.toHaveAttribute('aria-current')
  })

  it('navigates when an item is clicked', async () => {
    const user = userEvent.setup()
    renderNav({ role: 'admin', at: '/admin' })
    await user.click(navButton('Accounts'))
    expect(screen.getByTestId('path')).toHaveTextContent('/admin/accounts')
  })

  it('carries a logo image with a text alternative', () => {
    renderNav()
    expect(screen.getByRole('img', { name: /kumite/i })).toHaveAttribute('src', '/icon-192.png')
  })

  it('offers a way out', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('stays out of the way before sign-in', () => {
    const { container } = renderNav({ user: null })
    expect(container.querySelector('header')).toBeNull()
  })

  it('stays out of the way for a session with no role yet', () => {
    const { container } = renderNav({ role: null })
    expect(container.querySelector('header')).toBeNull()
  })

  it('does not dress the public scoreboard in app chrome', () => {
    // A hall screen is not being navigated by anyone.
    const { container } = renderNav({ role: 'admin', at: '/display' })
    expect(container.querySelector('header')).toBeNull()
  })

  it('leaves the sign-in page alone', () => {
    const { container } = renderNav({ role: 'admin', at: '/login' })
    expect(container.querySelector('header')).toBeNull()
  })
})
