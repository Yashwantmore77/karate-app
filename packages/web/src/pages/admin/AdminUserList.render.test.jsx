import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Accounts only exist when there is a server, so the data module is stubbed
// rather than the transport: these tests are about the screen's behaviour, and
// the module's own contract is covered against the live API elsewhere.
const users = vi.hoisted(() => ({
  ROLES: ['admin', 'referee', 'judge'],
  list: vi.fn(),
  page: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('../../data/users', () => users)
vi.mock('../../data/domain', () => import('../../test/fakeDomain'))

const AdminUserList = (await import('./AdminUserList')).default
const fakeDomain = await import('../../test/fakeDomain')

const ROSTER = [
  { uid: 'admin-1', email: 'admin@kata.local', role: 'admin' },
  { uid: 'ref-1', email: 'referee@kata.local', role: 'referee' },
  { uid: 'judge-1', email: 'judge1@kata.local', role: 'judge', seat: 1 },
]

const COACH = { uid: 'coach-1', email: 'coach@team.local', role: 'coach', tournamentId: 't1', teamId: 'team-1' }

const renderPage = (uid = 'admin-1') =>
  render(
    <MemoryRouter>
      <AdminUserList uid={uid} />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  fakeDomain.reset()
  fakeDomain.seed({ tournaments: [{ id: 't1', name: 'Spring Cup' }] })
  users.page.mockResolvedValue({ rows: ROSTER, total: ROSTER.length, pages: 1, page: 1 })
  users.create.mockResolvedValue({ uid: 'new-1' })
  users.update.mockResolvedValue({ uid: 'judge-1' })
  users.remove.mockResolvedValue(null)
})

describe('AdminUserList', () => {
  it('lists every account with its role and seat', async () => {
    renderPage()
    expect(await screen.findByText('referee@kata.local')).toBeInTheDocument()
    expect(screen.getByText('judge1@kata.local')).toBeInTheDocument()
    // The judge's seat, and an em dash where an account has none.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('says the page lists everyone who can sign in, not only officials', async () => {
    renderPage()
    expect(await screen.findByText('Everyone who can sign in, and their role')).toBeInTheDocument()
    expect(screen.queryByText(/Referees and judges who can sign in/)).not.toBeInTheDocument()
  })

  it('creates an account from the dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /new account/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/email/i), 'judge2@kata.local')
    await user.type(within(dialog).getByLabelText(/^password$/i), 'freshpass1')
    await user.type(within(dialog).getByLabelText(/seat/i), '2')
    await user.click(within(dialog).getByRole('button', { name: /create account/i }))

    expect(users.create).toHaveBeenCalledWith({
      email: 'judge2@kata.local', role: 'judge', seat: 2, password: 'freshpass1',
    })
  })

  it('refuses a short password without calling the server', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /new account/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/email/i), 'judge2@kata.local')
    await user.type(within(dialog).getByLabelText(/^password$/i), 'short')
    await user.click(within(dialog).getByRole('button', { name: /create account/i }))

    expect(await within(dialog).findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(users.create).not.toHaveBeenCalled()
  })

  it('leaves the password alone when editing unless a new one is typed', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /edit judge1@kata.local/i }))

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /save account/i }))

    expect(users.update).toHaveBeenCalledWith('judge-1', {
      email: 'judge1@kata.local', role: 'judge', seat: 1,
    })
    expect(users.update.mock.calls[0][1].password).toBeUndefined()
  })

  it('clears a seat by sending null, so the server can tell it from untouched', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /edit judge1@kata.local/i }))

    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText(/seat/i))
    await user.click(within(dialog).getByRole('button', { name: /save account/i }))

    expect(users.update).toHaveBeenCalledWith('judge-1', expect.objectContaining({ seat: null }))
  })

  it('will not offer to delete the account you are signed in with', async () => {
    renderPage('admin-1')
    await screen.findByText('admin@kata.local')
    expect(screen.getByRole('button', { name: /delete admin@kata.local/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete referee@kata.local/i })).toBeEnabled()
  })

  it('asks before deleting, and only then removes the account', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /delete referee@kata.local/i }))

    expect(screen.getByRole('heading', { name: /delete account\?/i })).toBeInTheDocument()
    expect(users.remove).not.toHaveBeenCalled()

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }))
    expect(users.remove).toHaveBeenCalledWith('ref-1')
  })

  it('turns a server error code into something a person can act on', async () => {
    users.create.mockRejectedValue(Object.assign(new Error('email_taken'), { code: 'email_taken', status: 409 }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /new account/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/email/i), 'referee@kata.local')
    await user.type(within(dialog).getByLabelText(/^password$/i), 'freshpass1')
    await user.click(within(dialog).getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/already has an account/i)).toBeInTheDocument()
  })

  it('reports a failed load instead of showing an empty roster', async () => {
    users.page.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 'forbidden', status: 403 }))
    renderPage()
    expect(await screen.findByText(/only an administrator can manage accounts/i)).toBeInTheDocument()
  })

  describe('a coach login (KAN-431)', () => {
    beforeEach(() => {
      users.page.mockResolvedValue({ rows: [...ROSTER, COACH], total: ROSTER.length + 1, pages: 1, page: 1 })
    })

    it('shows the one tournament it belongs to, not "All"', async () => {
      renderPage()
      await screen.findByText('coach@team.local')
      expect(screen.getByText('Spring Cup')).toBeInTheDocument()
    })

    it('limits the edit dialog to email and password', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: /edit coach@team.local/i }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/edit coach login/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/Spring Cup/)).toBeInTheDocument()
      expect(within(dialog).queryByLabelText(/^role$/i)).not.toBeInTheDocument()
      expect(within(dialog).queryByLabelText(/seat/i)).not.toBeInTheDocument()

      await user.clear(within(dialog).getByLabelText(/email/i))
      await user.type(within(dialog).getByLabelText(/email/i), 'newcoach@team.local')
      await user.click(within(dialog).getByRole('button', { name: /save account/i }))

      expect(users.update).toHaveBeenCalledWith('coach-1', { email: 'newcoach@team.local' })
    })

    it('can still be deleted or impersonated like any other account', async () => {
      renderPage()
      await screen.findByText('coach@team.local')
      expect(screen.getByRole('button', { name: /delete coach@team.local/i })).toBeEnabled()
      expect(screen.getByRole('button', { name: /impersonate coach@team.local/i })).toBeEnabled()
    })
  })
})
