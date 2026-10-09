import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LiveBoard from './LiveBoard'
import { hallInfo } from '../referee/RefereeMatchControl'

// Kata and Kumite take turns on the mats: what the hall shows as next is a
// bout of the event on now, even where the other event's bouts have lower
// numbers on the same mat.

const data = vi.hoisted(() => ({ view: vi.fn(), matches: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { public: { view: data.view, list: vi.fn() }, matches: data.matches } }))
vi.mock('../../data/live', () => ({ watchPublicChanges: () => () => {} }))
vi.mock('../../data/display', () => ({ displayRepo: { subscribe: () => () => {} } }))

const bout = (n, event, extra = {}) => ({
  id: `m${n}`, matchNumber: `M-00${n}`, mat: 1, status: 'scheduled', event, divisionKey: event === 'kata' ? 'kata:g1:-' : 'kumite:g1:w1',
  category: event === 'kata' ? 'Boys 12-13 Kata' : 'Boys 12-13 -35 KG', stage: 'pool', pool: 'A', aka: `Aka ${n}`, ao: `Ao ${n}`, ...extra,
})

describe('the live board (/live)', () => {
  it('shows as next only bouts of the event on the mats', async () => {
    data.view.mockResolvedValue({
      tournament: { name: 'Pune Open', venue: 'Pune', runningEvent: 'kumite' },
      matches: [bout(1, 'kata'), bout(2, 'kata'), bout(3, 'kumite', { status: 'live' }), bout(4, 'kumite'), bout(5, 'kata'), bout(6, 'kumite')],
      results: [],
    })
    render(<MemoryRouter initialEntries={['/live?t=pune-open']}><LiveBoard /></MemoryRouter>)
    expect(await screen.findByText(/M-003/)).toBeInTheDocument() // on the mat now
    expect(screen.getByText(/Next · M-004/)).toBeInTheDocument()
    expect(screen.getByText(/Then · M-006/)).toBeInTheDocument()
    for (const kata of ['M-001', 'M-002', 'M-005']) expect(screen.queryByText(new RegExp(kata))).not.toBeInTheDocument()
  })
})

describe('the live board during the other event', () => {
  it('says which event is on, rather than listing bouts that are not next', async () => {
    data.view.mockResolvedValue({
      tournament: { name: 'Pune Open', venue: 'Pune', runningEvent: 'kata' }, // judged by a panel: no kata bouts
      matches: [bout(1, 'kumite'), bout(2, 'kumite')],
      results: [],
    })
    render(<MemoryRouter initialEntries={['/live?t=pune-open']}><LiveBoard /></MemoryRouter>)
    expect(await screen.findByText('Kata is on the mats now. The Kumite bouts come after it.')).toBeInTheDocument()
    expect(screen.queryByText(/M-001/)).not.toBeInTheDocument()
  })
})

describe('the hall screen around the scores', () => {
  it("names the next bout of the same event on the mat", async () => {
    const row = (n, event, extra = {}) => ({
      id: `m${n}`, matchNumber: `M-00${n}`, mat: 1, status: 'scheduled', redId: `r${n}`, blueId: `b${n}`,
      divisionKey: event === 'kata' ? 'kata:g1:-' : 'kumite:g1:w1', categoryName: event, stage: 'pool', poolName: 'A', akaName: `Aka ${n}`, aoName: `Ao ${n}`, ...extra,
    })
    data.matches.mockResolvedValue([row(3, 'kumite', { status: 'live' }), row(4, 'kata'), row(5, 'kata'), row(6, 'kumite')])
    const info = await hallInfo('t1', { id: 'm3', mat: 1 })
    expect(info.next).toMatchObject({ matchNumber: 'M-006', akaName: 'Aka 6' })
  })
})
