import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyAccount from './MyAccount'

// Signing out a lost tablet must say whether it worked: one left signed in by
// a failure nobody saw is exactly the device that should have been.

const http = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../data/http', async (importOriginal) => ({ ...(await importOriginal()), request: http.request }))

const ACCOUNT = { email: 'admin@kata.local', role: 'admin', tournamentIds: [], tournamentRoles: {}, twoFactorEnabled: false }
const SESSIONS = [
  { sid: 's1', current: true, userAgent: 'This laptop', ip: '10.0.0.2', createdAt: '2027-01-15T04:30:00Z', lastSeenAt: '2027-01-15T05:30:00Z' },
  { sid: 's2', current: false, userAgent: 'Mat 2 tablet', ip: '10.0.0.7', createdAt: '2027-01-15T04:00:00Z', lastSeenAt: '2027-01-15T05:00:00Z' },
]

const answer = (revokeOthers) => http.request.mockImplementation(async (path) => {
  if (path === '/auth/account') return { account: ACCOUNT }
  if (path === '/auth/sessions') return { sessions: SESSIONS }
  if (path === '/auth/sessions/revoke-others') return revokeOthers()
  throw new Error(`unexpected ${path}`)
})

describe('signing out other devices', () => {
  beforeEach(() => { http.request.mockReset() })

  it('says so when it could not, instead of nothing', async () => {
    answer(() => { throw new TypeError('Failed to fetch') })
    const user = userEvent.setup()
    render(<MyAccount />)
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }))
    expect(await screen.findByText(/The other devices were not signed out: there is no connection to the server/)).toBeInTheDocument()
  })

  it('says how many were signed out', async () => {
    answer(() => ({ revoked: 1 }))
    const user = userEvent.setup()
    render(<MyAccount />)
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }))
    expect(await screen.findByText('Signed out on 1 other device.')).toBeInTheDocument()
  })
})
