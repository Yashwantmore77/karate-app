import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'

const renderLogin = (user, profile) =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login user={user} profile={profile} />} />
        <Route path="/admin" element={<div>Admin Home</div>} />
        <Route path="/referee" element={<div>Referee Home</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('Login - route redirect behavior', () => {
  it('renders the sign-in form when signed out', () => {
    renderLogin(null, null)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('redirects to the role home when already authenticated with a profile', () => {
    renderLogin({ uid: 'ref-1' }, { role: 'referee' })
    expect(screen.getByText('Referee Home')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('stays on the login form while the user is set but the profile has not resolved yet', () => {
    renderLogin({ uid: 'admin-1' }, null)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('pre-fills credentials when a quick-login chip is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderLogin(null, null)

    await user.click(screen.getByText('Admin'))
    expect(screen.getByDisplayValue('admin@kata.local')).toBeInTheDocument()
  })
})
