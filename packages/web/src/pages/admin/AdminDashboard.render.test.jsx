import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const data = vi.hoisted(() => ({
  list: vi.fn(),
  summaries: vi.fn(),
}))
vi.mock('../../data/domain', () => ({ tournaments: { list: data.list } }))
vi.mock('../../data/tms', () => ({ tms: { summaries: data.summaries } }))

const AdminDashboard = (await import('./AdminDashboard')).default

const TOURNAMENTS = [
  { id: 'live', name: 'State Championship', lifecycleStatus: 'LIVE' },
  { id: 'open', name: 'District Open', lifecycleStatus: 'REGISTRATION_OPEN' },
  { id: 'old', name: 'Winter Open 2025', lifecycleStatus: 'ARCHIVED' },
]
// 10 bouts in the live one: 6 done, 3 to fight, 1 cancelled.
const STATS = {
  live: { players: 40, matches: 10, completedMatches: 6, pendingMatches: 3, liveMatches: 1, gold: 2, silver: 2, bronze: 4 },
  open: { players: 12, matches: 0, completedMatches: 0, pendingMatches: 0, gold: 0, silver: 0, bronze: 0 },
  old: { players: 100, matches: 50, completedMatches: 50, pendingMatches: 0, gold: 10, silver: 10, bronze: 20 },
}

const card = (label) => screen.getByText(label, { selector: 'p' }).parentElement.querySelector('p:last-child').textContent

/** KAN-369 point 5: the admin home's totals count what is current and real. */
describe('AdminDashboard totals', () => {
  it('counts Live tournaments as live, leaves archived ones out, and ignores cancelled bouts', async () => {
    data.list.mockResolvedValue(TOURNAMENTS)
    data.summaries.mockResolvedValue(STATS)
    render(<MemoryRouter><AdminDashboard profile={{ role: 'admin' }} /></MemoryRouter>)
    await screen.findByText('State Championship')

    expect(card('Tournaments')).toBe('2')
    expect(card('Live now')).toBe('1')
    expect(card('Players')).toBe('52')
    expect(card('Medals')).toBe('8')
    expect(card('Matches done')).toBe('6 / 9')
    // The archived tournament is still listed, with its own figures.
    expect(screen.getByText('Winter Open 2025')).toBeInTheDocument()
    expect(screen.getByText('6/9')).toBeInTheDocument()
  })
})
