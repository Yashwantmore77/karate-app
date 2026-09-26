import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import JudgeMatchView from './JudgeMatchView'
import RefereeMatchControl from '../referee/RefereeMatchControl'

const categoryId = 'cat-kumite'
const matchId = 'match-1'

const seed = () => {
  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  localStorage.setItem('tournaments', JSON.stringify([
    { id: 't1', name: 'Summer Open', date: future.toISOString().split('T')[0], template: 'kumite', status: 'active' }
  ]))
  localStorage.setItem('categories-t1', JSON.stringify([
    { id: categoryId, tournamentId: 't1', name: 'U10 Boys Kumite' }
  ]))
  localStorage.setItem(`competitors-${categoryId}`, JSON.stringify([
    { id: 'c1', bib: '101', name: 'Ryan Thomas' },
    { id: 'c2', bib: '102', name: 'Samuel Brown' },
  ]))
  localStorage.setItem(`matches-${categoryId}`, JSON.stringify([
    { id: matchId, categoryId, redId: 'c1', blueId: 'c2', status: 'open' }
  ]))
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
        <Route path="/referee/match/:matchId" element={<RefereeMatchControl uid="ref" profile={{}} />} />
      </Routes>
    </MemoryRouter>
  )

describe('JudgeMatchView', () => {
  beforeEach(() => { localStorage.clear(); seed() })
  afterEach(() => localStorage.clear())

  it('puts the judge on the kumite console, not the old scoring form', async () => {
    renderJudge()
    await waitFor(() => expect(screen.getByText('Kumite WKF')).toBeInTheDocument())
    expect(screen.getByText('Ao')).toBeInTheDocument()
    expect(screen.getByText('Aka')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText(/Judge #2/)).toBeInTheDocument()
  })

  it('shows the judge as watching, with no control over the match', async () => {
    renderJudge()
    await waitFor(() => expect(screen.getByText('Watching')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: 'Ippon' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('follows the referee\'s scoring live', async () => {
    const user = userEvent.setup()
    const referee = renderReferee()
    await waitFor(() => expect(referee.getAllByRole('button', { name: 'Ippon' }).length).toBe(2))
    await user.click(referee.getAllByRole('button', { name: 'Ippon' })[0])

    const judge = renderJudge()
    await waitFor(() => {
      expect(judge.container.querySelector('h1')?.textContent).toBe('3')
    })
  })

  it('says so plainly when the match is not on this device', async () => {
    localStorage.removeItem(`matches-${categoryId}`)
    renderJudge()
    await waitFor(() => expect(screen.getByText('Match not found')).toBeInTheDocument())
  })
})
