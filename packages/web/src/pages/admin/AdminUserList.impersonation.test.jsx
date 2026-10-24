import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// KAN-429: the Impersonate button, its re-auth dialog, and what it refuses
// before ever calling the server.

const users = vi.hoisted(() => ({
  ROLES: ['admin', 'super_admin', 'referee', 'judge'],
  list: vi.fn(), page: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}))
vi.mock('../../data/users', () => users)

const session = vi.hoisted(() => ({ impersonate: vi.fn() }))
vi.mock('../../state/SessionContext', () => ({ useSession: () => session }))

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

  it('opens a lens after asking for the password again, and goes to that role\'s own screen', async () => {
    session.impersonate.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Impersonate referee@kata.local' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Sign in as referee@kata.local/)).toBeInTheDocument()
    // The password is required before the button does anything.
    expect(within(dialog).getByRole('button', { name: 'Sign in as them' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Your password'), 'adminpass1')
    expect(within(dialog).getByRole('button', { name: 'Sign in as them' })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'Sign in as them' }))

    expect(session.impersonate).toHaveBeenCalledWith('ref-1', 'adminpass1', undefined)
  })

  it('shows what the server refused, and tries again rather than closing', async () => {
    session.impersonate.mockRejectedValue(Object.assign(new Error('invalid_credentials'), { code: 'invalid_credentials' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Impersonate referee@kata.local' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Your password'), 'wrong')
    await user.click(within(dialog).getByRole('button', { name: 'Sign in as them' }))

    expect(await within(dialog).findByText('Wrong password.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
