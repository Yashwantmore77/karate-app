import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import { SessionProvider } from '../state/SessionContext'
import { signOut, auth } from '../firebase'

// With no VITE_SERVER_URL configured, SessionProvider resolves to the local
// mock-Firebase session — so these drive the mock's own sign-in state
// directly instead of passing user/profile as props, matching how the real
// app is wired now.
const renderLogin = () =>
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<div>Admin Home</div>} />
          <Route path="/referee" element={<div>Referee Home</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  )

describe('Login - route redirect behavior', () => {
  beforeEach(() => signOut(auth))
  afterEach(() => signOut(auth))

  it('renders the sign-in form when signed out', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('redirects to the role home once sign-in resolves a profile', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByText('Referee'))
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Referee Home')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('stays on the login form while signed in but the profile has not resolved yet', async () => {
    // Sign in via the mock directly, before render: the very first
    // onAuthStateChanged callback sets `user` synchronously and only then
    // awaits the Firestore-shaped roles lookup, so profile is genuinely
    // still null the instant this renders.
    await signInWithMock('referee@kata.local', 'test123')
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('pre-fills credentials when a quick-login chip is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByText('Admin'))
    expect(screen.getByDisplayValue('admin@kata.local')).toBeInTheDocument()
  })
})

// A thin wrapper so the "profile not resolved yet" test reads its intent
// clearly: it signs in through the same mock Login itself uses, without
// waiting for the async roles lookup that follows.
async function signInWithMock(email, password) {
  const { signInWithEmailAndPassword } = await import('../firebase')
  await signInWithEmailAndPassword(auth, email, password)
}
