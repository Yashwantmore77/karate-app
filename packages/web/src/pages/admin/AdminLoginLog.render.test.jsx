import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The log only exists behind a server, so the data module is stubbed rather
// than the transport: these tests are about the screen, and the endpoint itself
// is covered against the real API in the server suite.
const loginLog = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  OUTCOMES: ['success', 'invalid_credentials', 'rate_limited'],
  list: vi.fn(),
  page: vi.fn(),
}))
vi.mock('../../data/loginLog', () => loginLog)

const AdminLoginLog = (await import('./AdminLoginLog')).default

const ENTRIES = [
  {
    id: 'e1',
    at: '2026-09-27T03:23:22.704Z',
    outcome: 'success',
    email: 'admin@kata.local',
    role: 'admin',
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Macintosh)',
    geo: { source: 'vercel', country: 'India', region: 'MH', city: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
    browserCoords: null,
  },
  {
    id: 'e2',
    at: '2026-09-27T03:20:00.000Z',
    outcome: 'invalid_credentials',
    email: 'referee@kata.local',
    role: null,
    ip: '203.0.113.9',
    userAgent: 'curl/8.21.0',
    geo: null,
    browserCoords: { source: 'browser', latitude: 12.9716, longitude: 77.5946, accuracyM: 18 },
  },
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminLoginLog />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  loginLog.isAvailable.mockReturnValue(true)
  loginLog.page.mockResolvedValue({ rows: ENTRIES, total: ENTRIES.length, pages: 1, page: 1 })
})

describe('AdminLoginLog', () => {
  it('shows each attempt with its account, address and outcome', async () => {
    renderPage()
    expect(await screen.findByText('admin@kata.local')).toBeInTheDocument()
    expect(screen.getByText('referee@kata.local')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument()
    expect(screen.getByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('names the place behind an address and marks GPS apart from it', async () => {
    renderPage()
    expect(await screen.findByText('Mumbai, MH, India')).toBeInTheDocument()

    // The browser's own fix is labelled, because it is a claim by the caller
    // rather than something observed about them.
    expect(screen.getByText('12.9716, 77.5946 (GPS)')).toBeInTheDocument()
    expect(screen.getByText('19.0760, 72.8777')).toBeInTheDocument()
  })

  it('asks the server again when the outcome filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('admin@kata.local')

    await user.click(screen.getByLabelText('Outcome'))
    await user.click(within(screen.getByRole('listbox')).getByText('Throttled'))

    expect(loginLog.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: 'rate_limited' })
    )
  })

  it('holds the account filter until it is applied, rather than firing per keystroke', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('admin@kata.local')
    const callsAfterLoad = loginLog.page.mock.calls.length

    await user.type(screen.getByLabelText('Account'), 'referee@kata.local')
    expect(loginLog.page).toHaveBeenCalledTimes(callsAfterLoad)

    await user.click(screen.getByRole('button', { name: /apply/i }))
    expect(loginLog.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: 'referee@kata.local' })
    )
  })

  it('says so plainly when there is no server to read a log from', async () => {
    loginLog.isAvailable.mockReturnValue(false)
    renderPage()
    expect(await screen.findByText(/recorded on the server/i)).toBeInTheDocument()
    expect(loginLog.page).not.toHaveBeenCalled()
  })

  it('reports a refused read instead of showing an empty log', async () => {
    loginLog.page.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 'forbidden' }))
    renderPage()
    expect(await screen.findByText(/only an administrator/i)).toBeInTheDocument()
  })
})
