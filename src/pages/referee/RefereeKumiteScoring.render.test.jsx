import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RefereeMatchControl from './RefereeMatchControl'

const categoryId = 'cat-kumite'
const matchId = 'match-kumite-1'

const seed = () => {
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  localStorage.setItem('tournaments', JSON.stringify([
    { id: 't1', name: 'Summer Open', location: 'LA', date: future.toISOString().split('T')[0], template: 'kumite', status: 'active' }
  ]))
  localStorage.setItem('categories-t1', JSON.stringify([
    { id: categoryId, tournamentId: 't1', name: 'U18 Boys Kumite', ageGroup: 'U18', gender: 'M', division: 'Advanced' }
  ]))
  localStorage.setItem(`competitors-${categoryId}`, JSON.stringify([
    { id: 'comp-1', bib: '101', name: 'Alice' },
    { id: 'comp-2', bib: '102', name: 'Bob' }
  ]))
  localStorage.setItem(`matches-${categoryId}`, JSON.stringify([
    { id: matchId, categoryId, redId: 'comp-1', blueId: 'comp-2', status: 'open', createdAt: new Date().toISOString() }
  ]))
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/referee/match/${matchId}`]}>
      <Routes>
        <Route path="/referee/match/:matchId" element={<RefereeMatchControl uid="ref-uid" profile={{}} />} />
      </Routes>
    </MemoryRouter>
  )

describe('RefereeMatchControl - kumite template shows the WKF scoring console', () => {
  beforeEach(() => {
    localStorage.clear()
    seed()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders the Ao/Aka score panel with the configured match time', () => {
    renderPage()
    expect(screen.getByText('Kumite WKF')).toBeInTheDocument()
    expect(screen.getByText('Ao')).toBeInTheDocument()
    expect(screen.getByText('Aka')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('shows the console for a kata tournament too, with the judge panel kept below it', () => {
    const tournaments = JSON.parse(localStorage.getItem('tournaments'))
    tournaments[0].template = 'kata'
    localStorage.setItem('tournaments', JSON.stringify(tournaments))

    renderPage()

    expect(screen.getByText('Ao')).toBeInTheDocument()
    expect(screen.getByText('Aka')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Ippon' })).toHaveLength(2)
    expect(screen.getByText('Judge panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Round' })).toBeInTheDocument()
  })

  it('omits the judge panel for a kumite tournament', () => {
    renderPage()
    expect(screen.queryByText('Judge panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Round' })).not.toBeInTheDocument()
  })

  it('awards points via Ippon/Waza-ari and updates each side\'s total independently', async () => {
    const user = userEvent.setup()
    renderPage()

    const aoPanel = screen.getByText('Ao').closest('div')
    const akaPanel = screen.getByText('Aka').closest('div')

    await user.click(within(aoPanel).getByRole('button', { name: 'Ippon' }))
    await user.click(within(akaPanel).getByRole('button', { name: 'Waza-ari' }))

    expect(within(aoPanel).getByText('3')).toBeInTheDocument()
    expect(within(akaPanel).getByText('2')).toBeInTheDocument()
  })

  it('finalizes the match and persists the winner when Close is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    const aoPanel = screen.getByText('Ao').closest('div')
    await user.click(within(aoPanel).getByRole('button', { name: 'Ippon' }))

    await user.click(screen.getByRole('button', { name: 'Close' }))

    const matches = JSON.parse(localStorage.getItem(`matches-${categoryId}`))
    const updated = matches.find((m) => m.id === matchId)
    expect(updated.status).toBe('completed')
    expect(updated.winner).toBe('blue')
    expect(updated.avgBlue).toBe(3)
    expect(updated.avgRed).toBe(0)
  })

  describe('while the match clock is running', () => {
    const startClock = async (user) => {
      await user.click(screen.getByRole('button', { name: 'Start' }))
    }

    it('asks for confirmation before resetting the time and leaves the clock alone on cancel', async () => {
      const user = userEvent.setup()
      renderPage()
      await startClock(user)

      await user.click(screen.getByRole('button', { name: 'Reset time' }))
      expect(screen.getByRole('heading', { name: /match clock is running/i })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    })

    it('runs the guarded action only after Confirm', async () => {
      const user = userEvent.setup()
      renderPage()
      await startClock(user)

      await user.click(screen.getByRole('button', { name: '60 seconds' }))
      await user.click(screen.getByRole('button', { name: 'Confirm' }))
      await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))

      expect(screen.getByText('1:00')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    })

    it('does not guard scoring or penalties', async () => {
      const user = userEvent.setup()
      renderPage()
      await startClock(user)

      const aoPanel = screen.getByText('Ao').closest('div')
      await user.click(within(aoPanel).getByRole('button', { name: 'Ippon' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(within(aoPanel).getByText('3')).toBeInTheDocument()
    })

    it('does not guard actions once the clock is stopped', async () => {
      const user = userEvent.setup()
      renderPage()
      await startClock(user)
      await user.click(screen.getByRole('button', { name: 'Stop' }))

      await user.click(screen.getByRole('button', { name: 'Reset time' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
