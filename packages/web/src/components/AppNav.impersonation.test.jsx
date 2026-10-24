import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppNav from './AppNav'

// KAN-429: the "Signed in as X" banner, shown on every screen for as long as
// the token is a lens into someone else's account, not only on Accounts.

const session = vi.hoisted(() => ({ logout: vi.fn(), returnToSelf: vi.fn() }))
vi.mock('../state/SessionContext', () => ({ useSession: () => session }))

const renderNav = (user) =>
  render(
    <MemoryRouter initialEntries={['/referee']}>
      <AppNav user={user} profile={{ role: 'referee' }} />
      <Routes><Route path="*" element={<span>page</span>} /></Routes>
    </MemoryRouter>
  )

describe('the impersonation banner', () => {
  it('stays off for an ordinary sign-in', () => {
    renderNav({ uid: 'u1', email: 'ref@kata.local', impersonatedBy: null })
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
  })

  it('names the account and returns to the admin on click', async () => {
    const user = userEvent.setup()
    renderNav({ uid: 'u1', email: 'ref@kata.local', impersonatedBy: 'admin-uid' })
    expect(screen.getByText('Signed in as ref@kata.local')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to my account' }))
    expect(session.returnToSelf).toHaveBeenCalled()
  })
})
