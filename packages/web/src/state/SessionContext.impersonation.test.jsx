import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionContext'
import * as session from '../data/session'

// KAN-429: the socket must be dropped on both the way in and the way back —
// it caches the token it first connected with, so a swap that leaves it
// running would keep acting as whoever it first connected as. And the
// admin's own token must come back exactly as it was, re-validated the same
// way a token that survived a reload is — not trusted from state kept
// around since before the lens opened.

const sock = vi.hoisted(() => ({ disconnect: vi.fn() }))
vi.mock('../data/channel/socket', () => ({
  disconnect: sock.disconnect,
  onSocketAuthFailure: () => {},
}))

// VITE_SERVER_URL is empty in the test env (.env.test); apiUrl alone is
// overridden so the mount effect has a URL to fetch, while getToken,
// setToken, stashAdminToken and clearSession stay the real implementation —
// what this test is actually about.
vi.mock('../data/session', async (importOriginal) => ({ ...(await importOriginal()), apiUrl: (path) => `http://test${path}` }))

const api = vi.hoisted(() => ({ impersonate: vi.fn() }))
vi.mock('../data/users', () => ({ impersonate: api.impersonate }))

const originalFetch = global.fetch
const ADMIN = { uid: 'admin-1', email: 'admin@kata.local', role: 'admin', impersonatedBy: null }
const REF = { uid: 'ref-1', email: 'ref@kata.local', role: 'referee', impersonatedBy: 'admin-1' }
const byToken = (token, body) => ({ ok: true, json: async () => body, headers: { get: () => null } })

function Probe() {
  const { user, impersonate, returnToSelf } = useSession()
  return (
    <div>
      <span data-testid="who">{user ? `${user.email}${user.impersonatedBy ? ' (lens)' : ''}` : 'signed out'}</span>
      {/* A bare probe, not the real Accounts dialog: it only needs to show the
          failure doesn't corrupt session state, not to display the error. */}
      <button onClick={() => impersonate('ref-1', 'adminpass1').catch(() => {})}>go</button>
      <button onClick={() => returnToSelf()}>back</button>
    </div>
  )
}

describe('impersonation through the session layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.clearSession()
    session.stashAdminToken(null)
  })

  it('drops the socket and swaps the token on the way in, stashing the admin token for the way back', async () => {
    session.setToken('admin-token')
    api.impersonate.mockResolvedValue({ token: 'lens-token' })
    global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      const token = opts?.headers?.authorization
      if (token === 'Bearer admin-token') return byToken(token, { user: ADMIN })
      if (token === 'Bearer lens-token') return byToken(token, { user: REF })
      return { ok: false }
    })

    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('admin@kata.local'))
    expect(screen.getByTestId('who')).not.toHaveTextContent('(lens)')
    sock.disconnect.mockClear() // the mount's own effect also disconnects once; only the swap matters here

    screen.getByText('go').click()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('ref@kata.local (lens)'))
    expect(sock.disconnect).toHaveBeenCalled()
    expect(session.getToken()).toBe('lens-token')
    expect(session.getAdminToken()).toBe('admin-token')

    global.fetch = originalFetch
  })

  it('restores the admin\'s own token and re-validates it, not the stashed user object, on return', async () => {
    session.setToken('lens-token')
    session.stashAdminToken('admin-token')
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      if (String(url).includes('/impersonate/end')) return { ok: true, json: async () => ({ ok: true }) }
      const token = opts?.headers?.authorization
      if (token === 'Bearer admin-token') return byToken(token, { user: ADMIN })
      if (token === 'Bearer lens-token') return byToken(token, { user: REF })
      return { ok: false }
    })

    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('ref@kata.local (lens)'))
    sock.disconnect.mockClear()

    screen.getByText('back').click()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('admin@kata.local'))
    expect(screen.getByTestId('who')).not.toHaveTextContent('(lens)')
    expect(sock.disconnect).toHaveBeenCalled()
    expect(session.getToken()).toBe('admin-token')
    expect(session.getAdminToken()).toBeNull()

    global.fetch = originalFetch
  })

  it('leaves the admin signed in exactly as before if the lens itself never took', async () => {
    session.setToken('admin-token')
    api.impersonate.mockRejectedValue(Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' }))
    global.fetch = vi.fn().mockImplementation(async (_url, opts) =>
      (opts?.headers?.authorization === 'Bearer admin-token' ? byToken('admin', { user: ADMIN }) : { ok: false }))

    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('admin@kata.local'))

    screen.getByText('go').click()
    await waitFor(() => expect(session.getToken()).toBe('admin-token'))
    expect(screen.getByTestId('who')).toHaveTextContent('admin@kata.local')
    expect(screen.getByTestId('who')).not.toHaveTextContent('(lens)')
    expect(session.getAdminToken()).toBeNull()

    global.fetch = originalFetch
  })
})
