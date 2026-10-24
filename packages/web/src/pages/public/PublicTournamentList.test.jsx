import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PublicTournamentList from './PublicTournamentList'

const list = vi.hoisted(() => vi.fn())
vi.mock('../../data/tms', () => ({ tms: { public: { list } } }))

const open = (search) => {
  window.history.pushState({}, '', `/tournaments${search}`)
  render(<MemoryRouter><PublicTournamentList /></MemoryRouter>)
}

describe('the public tournament list (KAN-375)', () => {
  it("names the organisation on each card, and in the heading for one organisation's list", async () => {
    list.mockResolvedValue([{ id: 't1', name: 'Goa Open', lifecycleStatus: 'LIVE', organization: { name: 'Goa KA', slug: 'goa-ka' } }])
    open('?org=goa-ka')
    expect(await screen.findByRole('heading', { name: 'Goa KA tournaments' })).toBeInTheDocument()
    expect(screen.getByText('Goa KA')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith('goa-ka')
  })

  it('says when the short name matches no organisation', async () => {
    list.mockRejectedValue(Object.assign(new Error('organization_not_found'), { code: 'organization_not_found' }))
    open('?org=goa-kaa')
    expect(await screen.findByText('No organisation has the short name "goa-kaa".')).toBeInTheDocument()
  })
})
