import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionContext'
import * as session from '../data/session'

// KAN-429: a lens tab has nothing to go "back" to — it was opened purely to
// be this lens. Ending it tells the server (so the session is really
// revoked, not just forgotten locally), clears this tab's own session, and
// closes the tab.

const sock = vi.hoisted(() => ({ disconnect: vi.fn() }))
vi.mock('../data/channel/socket', () => ({
  disconnect: sock.disconnect,
  onSocketAuthFailure: () => {},
}))

// VITE_SERVER_URL is empty in the test env (.env.test); apiUrl alone is
// overridden so the mount effect and endImpersonation have a URL to fetch,
// while getToken/setToken/clearSession stay the real implementation.
vi.mock('../data/session', async (importOriginal) => ({ ...(await importOriginal()), apiUrl: (path) => `http://test${path}` }))

const originalFetch = global.fetch
const REF = { uid: 'ref-1', email: 'ref@kata.local', role: 'referee', impersonatedBy: 'admin-1' }
const byToken = (body) => ({ ok: true, json: async () => body, headers: { get: () => null } })

function Probe() {
  const { user, endImpersonation } = useSession()
  return (
    <div>
      <span data-testid="who">{user ? `${user.email}${user.impersonatedBy ? ' (lens)' : ''}` : 'signed out'}</span>
      <button onClick={() => endImpersonation()}>end</button>
    </div>
  )
}

describe('ending a lens through the session layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.clearSession()
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('tells the server, clears this tab\'s own session, drops the socket, and closes the tab', async () => {
    session.setToken('lens-token')
    let endCalled = false
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      if (String(url).includes('/impersonate/end')) {
        endCalled = true
        expect(opts.headers.authorization).toBe('Bearer lens-token')
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return byToken({ user: REF })
    })
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})

    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('ref@kata.local (lens)'))
    sock.disconnect.mockClear() // the mount's own effect also disconnects once; only the end matters here

    screen.getByText('end').click()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    expect(endCalled).toBe(true)
    expect(sock.disconnect).toHaveBeenCalled()
    expect(session.getToken()).toBeNull()
    expect(closeSpy).toHaveBeenCalled()

    closeSpy.mockRestore()
  })
})
