import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// KAN-429: the Impersonate button opens a lens in a new tab, with no
// password or 2FA step — see what it refuses before ever calling the server.

const users = vi.hoisted(() => ({
  ROLES: ['admin', 'super_admin', 'referee', 'judge'],
  list: vi.fn(), page: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}))
vi.mock('../../data/users', () => users)

const link = vi.hoisted(() => ({ openImpersonationTab: vi.fn() }))
vi.mock('../../data/impersonationLink', () => link)

const AdminUserList = (await import('./AdminUserList')).default

const ROSTER = [
  { uid: 'admin-1', email: 'admin@kata.local', role: 'admin' },
  { uid: 'root-1', email: 'root@kata.local', role: 'super_admin' },
  { uid: 'ref-1', email: 'referee@kata.local', role: 'referee' },
]

const renderPage = (uid = 'admin-1') =>
  render(<MemoryRouter><AdminUserList uid={uid} /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  users.page.mockResolvedValue({ rows: ROSTER, total: ROSTER.length, pages: 1, page: 1 })
})

describe('impersonating an account from Accounts', () => {
  it('offers it for a referee, never for an admin, a super admin, or your own row', async () => {
    renderPage()
    await screen.findByText('referee@kata.local')
    expect(screen.getByRole('button', { name: 'Impersonate referee@kata.local' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Impersonate admin@kata.local/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Impersonate root@kata.local/ })).not.toBeInTheDocument()
  })

  it('opens a lens in a new tab on one click, with no password or code', async () => {
    link.openImpersonationTab.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Impersonate referee@kata.local' }))

    expect(link.openImpersonationTab).toHaveBeenCalledWith(ROSTER[2])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows what the server refused', async () => {
    link.openImpersonationTab.mockRejectedValue(Object.assign(new Error('cannot_impersonate_admin'), { code: 'cannot_impersonate_admin' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Impersonate referee@kata.local' }))

    expect(await screen.findByText('An administrator account cannot be impersonated.')).toBeInTheDocument()
  })
})
