import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicTournament from './PublicTournament'

// KAN-428: a parent follows an athlete or a club on the public page, on their
// phone, and sees when they fight and how they did.

const data = vi.hoisted(() => ({ view: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: { public: { view: data.view } } }))
vi.mock('../../data/live', () => ({ watchPublicChanges: () => () => {} }))
vi.mock('../../data/channel/socket', async (importOriginal) => ({ ...(await importOriginal()), publicSocket: () => null }))

const players = [['p1', 'Meera Joshi', 'tm1'], ['p2', 'Kabir Shah', 'tm1'], ['p3', 'Diya Rao', 'tm2'], ['p4', 'Isha Patil', 'tm2']]
const name = Object.fromEntries(players.map(([id, n]) => [id, n]))
const bout = (n, akaId, aoId, extra = {}) => ({
  id: `m${n}`, matchNumber: `M-00${n}`, mat: 1, status: 'scheduled', event: 'kumite', divisionKey: 'kumite:g1:w1', category: 'Girls -40 KG', stage: 'pool', pool: 'A', round: 1,
  akaId, aoId, aka: name[akaId], ao: name[aoId], winner: null, akaScore: null, aoScore: null, scoreboard: null, ...extra,
})
const VIEW = {
  tournament: { id: 't1', name: 'Pune Open', lifecycleStatus: 'LIVE', type: 'kumite' },
  categories: [], results: [],
  teams: [{ id: 'tm1', name: 'ABC Dojo' }, { id: 'tm2', name: 'XYZ Club' }],
  players: players.map(([id, n, teamId]) => ({ id, name: n, teamId, categories: [] })),
  matches: [
    bout(0, 'p1', 'p4', { status: 'completed', winner: 'red', akaScore: 3, aoScore: 0 }),
    bout(1, 'p3', 'p4', { status: 'live', scoreboard: { akaScore: 2, aoScore: 1, senshu: null, clock: null, outcome: null, heartbeatAt: Date.now() } }),
    bout(2, 'p1', 'p3', { calledAt: '2026-10-23T09:00:00Z' }),
    bout(3, 'p2', 'p4'),
    bout(4, 'p2', 'p3', { status: 'completed', winner: 'red', akaScore: 0, aoScore: 0, resultType: 'KIKEN' }),
  ],
}

const open = () => render(<MemoryRouter initialEntries={['/t/pune-open']}><Routes><Route path="/t/:slug" element={<PublicTournament />} /></Routes></MemoryRouter>)
const card = () => within(screen.getByTestId('following'))

describe('following athletes and clubs on the public page', () => {
  beforeEach(() => {
    localStorage.clear()
    data.view.mockResolvedValue(VIEW)
  })

  it('follows an athlete from the Players tab: next bout, mat, bouts before it and latest result, kept on the phone', async () => {
    const user = userEvent.setup()
    const { unmount } = open()
    await user.click(await screen.findByRole('tab', { name: 'Live matches' }))
    expect(screen.getByText(/Tap ☆ beside an athlete/)).toBeInTheDocument()
    expect(screen.queryByTestId('following')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Players' }))
    await user.click(screen.getByRole('button', { name: 'Follow Meera Joshi' }))
    expect(screen.getByRole('button', { name: 'Stop following Meera Joshi', pressed: true })).toBeInTheDocument()
    const meera = within(card().getByTestId('follow-p1'))
    expect(meera.getByText('Called')).toBeInTheDocument()
    expect(meera.getByText('Mat 1 · M-002 against Diya Rao · 1 bout before it')).toBeInTheDocument()
    expect(meera.getByText(/Last: Won 3–0 against Isha Patil · M-000/)).toBeInTheDocument()

    // Still followed when the page is opened again on this phone.
    unmount()
    open()
    expect(within(await screen.findByTestId('follow-p1')).getByText(/M-002 against Diya Rao/)).toBeInTheDocument()
  })

  it("follows a club from the Teams tab: its athletes with a bout to come, the one on a mat first with the score", async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Teams' }))
    await user.click(screen.getByRole('button', { name: 'Follow XYZ Club' }))
    const diya = within(card().getByTestId('follow-p3'))
    expect(diya.getByText('● On Mat 1 now')).toBeInTheDocument()
    expect(diya.getByText('M-001 against Isha Patil · 2–1')).toBeInTheDocument()
    // Isha's side of the same bout: her score first.
    expect(within(card().getByTestId('follow-p4')).getByText('M-001 against Diya Rao · 1–2')).toBeInTheDocument()
    expect(card().queryByTestId('follow-p1')).not.toBeInTheDocument()

    await user.click(card().getByRole('button', { name: 'Stop following XYZ Club' }))
    expect(screen.queryByTestId('following')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('kt:v1:follow:t1'))).toEqual({ players: [], teams: [] })
  })

  it('stops following an athlete from the card', async () => {
    localStorage.setItem('kt:v1:follow:t1', JSON.stringify({ players: ['p2', 'gone'], teams: [] }))
    const user = userEvent.setup()
    open()
    // A followed athlete no longer listed is left out.
    expect(within(await screen.findByTestId('follow-p2')).getByText('Mat 1 · M-003 against Isha Patil · 2 bouts before it')).toBeInTheDocument()
    await user.click(card().getByRole('button', { name: 'Stop following Kabir Shah' }))
    expect(screen.queryByTestId('following')).not.toBeInTheDocument()
  })

  it('says how a bout that was not scored ended, rather than 0–0', async () => {
    localStorage.setItem('kt:v1:follow:t1', JSON.stringify({ players: ['p2'], teams: [] }))
    open()
    expect(within(await screen.findByTestId('follow-p2')).getByText('Last: Won (Kiken) against Diya Rao · M-004')).toBeInTheDocument()
  })
})
