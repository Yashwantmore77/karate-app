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
  testCredentials: vi.fn(async () => null),
  tokenExpiresAt: () => null,
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

  it('offers no credentials of its own when the server shows none', async () => {
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    // The app ships no accounts, so with the server quiet there is nothing to
    // offer and no chips promising a sign-in that would be refused.
    expect(screen.queryByText(/administrator, for testing/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fill these in/i })).not.toBeInTheDocument()
  })

  it('shows the administrator credentials the server reports', async () => {
    session.testCredentials.mockResolvedValue({ email: 'boss@club.test', password: 'open-sesame-9' })
    renderLogin()
    expect(await screen.findByText('boss@club.test')).toBeInTheDocument()
    expect(screen.getByText('open-sesame-9')).toBeInTheDocument()
  })

  it('fills the form from the credentials it was shown', async () => {
    session.testCredentials.mockResolvedValue({ email: 'boss@club.test', password: 'open-sesame-9' })
    const user = userEvent.setup()
    renderLogin()
    await user.click(await screen.findByRole('button', { name: /fill these in/i }))
    expect(screen.getByLabelText(/email/i)).toHaveValue('boss@club.test')
    expect(screen.getByLabelText(/password/i)).toHaveValue('open-sesame-9')
  })

  it('signs in with the credentials it filled in', async () => {
    session.testCredentials.mockResolvedValue({ email: 'boss@club.test', password: 'open-sesame-9' })
    session.loginToServer.mockResolvedValue({ uid: 'a1', email: 'boss@club.test', role: 'admin' })
    const user = userEvent.setup()
    renderLogin()
    await user.click(await screen.findByRole('button', { name: /fill these in/i }))
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Admin Home')).toBeInTheDocument())
    expect(session.loginToServer).toHaveBeenCalledWith('boss@club.test', 'open-sesame-9', null)
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

  it('says the server address is missing, not that the connection is down', async () => {
    session.loginToServer.mockRejectedValue(Object.assign(new Error('VITE_SERVER_URL is not set'), { code: 'no_server_url' }))
    await signIn()
    expect(await screen.findByText(/set up without a server address \(VITE_SERVER_URL\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not reach the sign-in service/i)).not.toBeInTheDocument()
  })

  it('stays on the form after a failure, ready to try again', async () => {
    failWith(401)
    await signIn()
    await screen.findByText('Wrong email or password')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('asks for the authenticator code only when the server wants one', async () => {
    session.loginToServer
      .mockRejectedValueOnce(Object.assign(new Error('login failed'), { status: 401, code: 'two_factor_required' }))
      .mockResolvedValueOnce({ uid: 'u1', email: 'ref@club.test', role: 'referee' })
    const user = userEvent.setup()
    await signIn('ref@club.test')
    const code = await screen.findByLabelText(/6-digit code/i)
    expect(screen.queryByText('Wrong email or password')).not.toBeInTheDocument()
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Referee Home')).toBeInTheDocument())
    expect(session.loginToServer).toHaveBeenLastCalledWith('ref@club.test', 'correct horse', null, '123456')
  })
})
