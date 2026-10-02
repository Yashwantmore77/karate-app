import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import { SessionProvider } from '../state/SessionContext'

// The real session, with only the network edge replaced: what goes to the API
// and what comes back.
const session = vi.hoisted(() => ({
  apiUrl: (path) => `http://api.test/api/v1${path}`,
  getToken: () => null,
  clearSession: vi.fn(),
  loginToServer: vi.fn(),
}))
vi.mock('../data/session', () => session)
vi.mock('../data/geolocation', () => ({ currentCoords: vi.fn(async () => null) }))

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

const signIn = async (email = 'ref@club.test', password = 'correct horse') => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(await screen.findByLabelText(/email/i), email)
  await user.type(screen.getByLabelText(/password/i), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
}

const failWith = (status) =>
  session.loginToServer.mockRejectedValue(Object.assign(new Error('login failed'), { status }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Login', () => {
  it('renders the sign-in form when signed out', async () => {
    renderLogin()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('offers a one-click sign-in for each seeded account', async () => {
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    for (const label of ['Admin', 'Referee', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('fills the form when a role is picked', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(await screen.findByRole('button', { name: 'Admin' }))
    expect(screen.getByLabelText(/email/i)).toHaveValue('admin@kata.local')
    expect(screen.getByLabelText(/password/i)).toHaveValue('test123')
  })

  it('signs in as the picked account', async () => {
    session.loginToServer.mockResolvedValue({ uid: 'r1', email: 'referee@kata.local', role: 'referee' })
    const user = userEvent.setup()
    renderLogin()
    await user.click(await screen.findByRole('button', { name: 'Referee' }))
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Referee Home')).toBeInTheDocument())
    expect(session.loginToServer).toHaveBeenCalledWith('referee@kata.local', 'test123', null)
  })

  it('signs in against the API and goes to the role home', async () => {
    session.loginToServer.mockResolvedValue({ uid: 'u1', email: 'ref@club.test', role: 'referee' })
    await signIn('  ref@club.test  ')

    await waitFor(() => expect(screen.getByText('Referee Home')).toBeInTheDocument())
    // Trimmed, because a stray space from a paste is not part of an address.
    expect(session.loginToServer).toHaveBeenCalledWith('ref@club.test', 'correct horse', null)
  })

  it('says the password is wrong only when the API says so', async () => {
    failWith(401)
    await signIn()
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument()
  })

  it('tells someone rate-limited to wait, not that their password is wrong', async () => {
    failWith(429)
    await signIn()
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument()
  })

  it('tells someone the service is unreachable, not that their password is wrong', async () => {
    session.loginToServer.mockRejectedValue(new TypeError('Failed to fetch'))
    await signIn()
    expect(await screen.findByText(/could not reach the sign-in service/i)).toBeInTheDocument()
    expect(screen.queryByText('Wrong email or password')).not.toBeInTheDocument()
  })

  it('stays on the form after a failure, ready to try again', async () => {
    failWith(401)
    await signIn()
    await screen.findByText('Wrong email or password')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })
})
