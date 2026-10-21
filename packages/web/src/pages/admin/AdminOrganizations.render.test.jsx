import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const organizations = vi.hoisted(() => ({ list: vi.fn(), mine: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../../data/organizations', () => organizations)

const AdminOrganizations = (await import('./AdminOrganizations')).default

const BUSY = { id: 'o1', name: 'Maharashtra KA', slug: 'mka', tournaments: 2, accounts: 3, active: true, createdAt: 'x', updatedAt: 'y' }
const EMPTY = { id: 'o2', name: 'Goa KA', slug: 'gka', tournaments: 0, accounts: 0, active: true }

const rowOf = async (name) => (await screen.findByText(name)).closest('tr')

/** KAN-376 point 5: the Organisations screen. */
describe('AdminOrganizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    organizations.list.mockResolvedValue([BUSY, EMPTY])
    organizations.create.mockResolvedValue({ id: 'o3' })
    organizations.update.mockResolvedValue({ id: 'o1' })
    organizations.remove.mockResolvedValue(null)
  })

  it('fills the short name from the name when adding, and saves only what was filled in', async () => {
    const user = userEvent.setup()
    render(<AdminOrganizations />)
    await user.click(await screen.findByRole('button', { name: 'Add organisation' }))
    const dialog = screen.getByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/^Name/), 'Karnataka Karate Assn.')
    expect(within(dialog).getByLabelText(/^Short name/)).toHaveValue('karnataka-karate-assn')
    expect(save).toBeEnabled()
    await user.click(save)
    expect(organizations.create).toHaveBeenCalledWith({ name: 'Karnataka Karate Assn.', slug: 'karnataka-karate-assn', active: true })
  })

  it('lets a dash be typed in the short name', async () => {
    const user = userEvent.setup()
    render(<AdminOrganizations />)
    await user.click(await screen.findByRole('button', { name: 'Add organisation' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name/), 'Mumbai')
    const slug = within(dialog).getByLabelText(/^Short name/)
    await user.clear(slug)
    await user.type(slug, 'MKA-2026')
    expect(slug).toHaveValue('mka-2026')
  })

  it('keeps the short name when the name is edited, and sends no counts or dates', async () => {
    const user = userEvent.setup()
    render(<AdminOrganizations />)
    await user.click(within(await rowOf('Maharashtra KA')).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    const name = within(dialog).getByLabelText(/^Name/)
    await user.clear(name)
    await user.type(name, 'Maharashtra Karate')
    expect(within(dialog).getByLabelText(/^Short name/)).toHaveValue('mka')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(organizations.update).toHaveBeenCalledWith('o1', { name: 'Maharashtra Karate', slug: 'mka', active: true })
  })

  it('offers Delete only for an organisation with no tournaments or accounts', async () => {
    const user = userEvent.setup()
    render(<AdminOrganizations />)
    expect(within(await rowOf('Maharashtra KA')).getByRole('button', { name: 'Delete' })).toBeDisabled()
    await user.click(within(await rowOf('Goa KA')).getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(organizations.remove).toHaveBeenCalledWith('o2')
  })
})
