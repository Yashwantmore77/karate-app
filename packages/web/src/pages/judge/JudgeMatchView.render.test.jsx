import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import JudgeMatchView from './JudgeMatchView'
import RefereeMatchControl from '../referee/RefereeMatchControl'
import * as fake from '../../test/fakeDomain'
import { resetMemoryMatches } from '../../test/memoryMatchChannel'
import { resetDisplay } from '../../test/memoryDisplay'

vi.mock('../../data/domain', () => import('../../test/fakeDomain'))
vi.mock('../../data/channel', () => import('../../test/memoryMatchChannel'))
vi.mock('../../data/display', () => import('../../test/memoryDisplay'))

const categoryId = 'cat-kumite'
const matchId = 'match-1'

const seed = ({ withMatch = true } = {}) => {
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  fake.seed({
    tournaments: [{ id: 't1', name: 'Summer Open', date: future.toISOString().split('T')[0], template: 'kumite', status: 'active' }],
    categories: [{ id: categoryId, tournamentId: 't1', name: 'U10 Boys Kumite' }],
    competitors: [
      { id: 'c1', categoryId, bib: '101', name: 'Ryan Thomas' },
      { id: 'c2', categoryId, bib: '102', name: 'Samuel Brown' },
    ],
    matches: withMatch ? [{ id: matchId, categoryId, redId: 'c1', blueId: 'c2', status: 'open' }] : [],
  })
}

const renderJudge = () =>
  render(
    <MemoryRouter initialEntries={[`/judge/match/${matchId}`]}>
      <Routes>
        <Route path="/judge/match/:matchId" element={<JudgeMatchView profile={{ seat: 2 }} />} />
      </Routes>
    </MemoryRouter>
  )

const renderReferee = () =>
  render(
    <MemoryRouter initialEntries={[`/referee/match/${matchId}`]}>
      <Routes>
        <Route path="/referee/match/:matchId" element={<RefereeMatchControl />} />
      </Routes>
    </MemoryRouter>
  )

describe('JudgeMatchView', () => {
  beforeEach(() => { fake.reset(); resetDisplay(); resetMemoryMatches() })
  afterEach(() => resetMemoryMatches())

  it('opens a bout read from the API, not from this browser', async () => {
    // The lookup behind this screen used to read the browser's own storage,
    // which is empty against the API: in production every judge saw "Match not
    // found". The data here exists only in the (fake) API.
    seed()
    renderJudge()
    // Shown as 'name • #bib' on each side's panel.
    expect(await screen.findByText('Ryan Thomas • #101')).toBeInTheDocument()
    expect(screen.getByText('Samuel Brown • #102')).toBeInTheDocument()
  })

  it('puts the judge on the kumite console', async () => {
    seed()
    renderJudge()
    await waitFor(() => expect(screen.getByText('Kumite WKF')).toBeInTheDocument())
    expect(screen.getByText('Ao')).toBeInTheDocument()
    expect(screen.getByText('Aka')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText(/Judge #2/)).toBeInTheDocument()
  })

  it('shows the judge as watching, with no control over the match', async () => {
    seed()
    renderJudge()
    await waitFor(() => expect(screen.getByText('Watching')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: 'Ippon' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('follows the referee\'s scoring live', async () => {
    seed()
    const user = userEvent.setup()
    const referee = renderReferee()
    await waitFor(() => expect(referee.getAllByRole('button', { name: 'Ippon' }).length).toBe(2))
    await user.click(referee.getAllByRole('button', { name: 'Ippon' })[0])

    const judge = renderJudge()
    await waitFor(() => {
      expect(judge.container.querySelector('h1')?.textContent).toBe('3')
    })
  })

  it('says so plainly when the match does not exist', async () => {
    seed({ withMatch: false })
    renderJudge()
    await waitFor(() => expect(screen.getByText('Match not found')).toBeInTheDocument())
  })
})
