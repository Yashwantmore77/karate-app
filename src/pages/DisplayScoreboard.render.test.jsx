import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DisplayScoreboard from './DisplayScoreboard'
import RefereeKumiteScoring from './referee/RefereeKumiteScoring'
import { displayRepo } from '../data/repo'
import { makeClock, startClock } from '../shared/clock'

const renderDisplay = () => render(<MemoryRouter><DisplayScoreboard /></MemoryRouter>)

describe('DisplayScoreboard', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('says there is nothing on when no match is published', () => {
    renderDisplay()
    expect(screen.getByText('No live match')).toBeInTheDocument()
  })

  it('shows the published names, scores and clock', async () => {
    await displayRepo.put({
      status: 'open',
      aoName: 'Samuel Brown',
      akaName: 'Ryan Thomas',
      aoScore: 3,
      akaScore: 2,
      senshu: 'ao',
      fieldNumber: '1',
      clock: makeClock(90_000),
      heartbeatAt: Date.now(),
    })
    renderDisplay()

    await waitFor(() => expect(screen.getByText('Samuel Brown')).toBeInTheDocument())
    expect(screen.getByText('Ryan Thomas')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText('SENSHU')).toBeInTheDocument()
  })

  it('goes back to idle when the scoreboard is closed', async () => {
    await displayRepo.put({ status: 'open', aoName: 'A', akaName: 'B', aoScore: 0, akaScore: 0, clock: makeClock(1000) })
    renderDisplay()
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())

    await displayRepo.put({ status: 'closed' })
    await waitFor(() => expect(screen.getByText('No live match')).toBeInTheDocument())
  })

  it('marks the feed not live when the heartbeat goes quiet', async () => {
    await displayRepo.put({
      status: 'open',
      aoName: 'A', akaName: 'B', aoScore: 0, akaScore: 0,
      clock: startClock(makeClock(90_000), Date.now()),
      heartbeatAt: Date.now() - 20_000,
    })
    renderDisplay()
    await waitFor(() => expect(screen.getByText('NOT LIVE')).toBeInTheDocument())
  })
})

describe('console observe mode', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const props = {
    matchId: 'm1',
    redComp: { name: 'Ryan Thomas', bib: '501' },
    blueComp: { name: 'Samuel Brown', bib: '502' },
    tournamentExpired: false,
    onBack: () => {},
    onFinalize: () => {},
  }

  it('renders the same panels as the control view', () => {
    render(<RefereeKumiteScoring {...props} mode="observe" />)
    expect(screen.getByText('Ao')).toBeInTheDocument()
    expect(screen.getByText('Aka')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Ippon' })).toHaveLength(2)
  })

  it('makes every control inert', () => {
    render(<RefereeKumiteScoring {...props} mode="observe" />)
    expect(screen.getAllByRole('button', { name: 'Ippon' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset time' })).toBeDisabled()
  })

  it('follows a change made by the controlling view', async () => {
    const user = userEvent.setup()
    const control = render(<RefereeKumiteScoring {...props} mode="control" />)
    await user.click(control.getAllByRole('button', { name: 'Ippon' })[0])

    const observer = render(<RefereeKumiteScoring {...props} mode="observe" />)
    await waitFor(() => {
      expect(observer.container.querySelector('h1')?.textContent).toBe('3')
    })
  })
})
