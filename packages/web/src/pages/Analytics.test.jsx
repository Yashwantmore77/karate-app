import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Analytics from './Analytics'

const http = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../data/http', async (importOriginal) => ({ ...(await importOriginal()), request: http.request }))

const athlete = (key, name, club, history, decisions = []) => ({
  key, name, club, gender: 'F', tournaments: history.length, gold: 0, silver: 0, bronze: 0, medals: 0, won: 0, lost: 0, walkovers: 0, bouts: 0, winRate: null,
  history: history.map(([playerId, tournament]) => ({ playerId, tournamentId: tournament, tournament, date: null, club, medals: [], won: 0, lost: 0, walkovers: 0 })),
  decisions,
})
// Two Meeras taken for one by name and birthday, and Meera spelt "Mira".
const DATA = {
  tournaments: [],
  clubs: [],
  athletes: [
    athlete('a1', 'Meera Joshi', 'ABC Karate', [['p1', 'Spring Cup'], ['p3', 'Autumn Cup']]),
    athlete('a2', 'Mira Joshi', 'ABC Karate', [['p2', 'Summer Cup']], [{ id: 'l9', kind: 'apart', records: [{ playerId: 'p2', name: 'Mira Joshi', tournament: 'Summer Cup' }] }]),
    // Kabir's Spring and Summer records were joined by hand; Autumn matched by name and birthday.
    athlete('a3', 'Kabir Shah', 'XYZ Dojo', [['p4', 'Spring Cup'], ['p5', 'Summer Cup'], ['p6', 'Autumn Cup']], [{ id: 'l7', kind: 'same', records: [{ playerId: 'p4', name: 'Kabir Sha', tournament: 'Spring Cup' }, { playerId: 'p5', name: 'Kabir Shah', tournament: 'Summer Cup' }] }]),
  ],
}

const open = async (user, profile, name) => {
  render(<Analytics profile={profile} />)
  await user.click(await screen.findByRole('tab', { name: /Athletes/ }))
  await user.click(screen.getByText(name))
  return screen.findByRole('dialog')
}

/** KAN-369 point 4: an organiser joins or separates athlete records. */
describe('athletes joined or set apart on the Analytics screen', () => {
  beforeEach(() => {
    http.request.mockReset().mockImplementation(async (path, options = {}) => (options.method ? (options.method === 'DELETE' ? null : { link: { id: 'new' } }) : DATA))
  })

  it('sets a record apart, and joins two athletes, then reloads', async () => {
    const user = userEvent.setup()
    let dialog = await open(user, { role: 'admin' }, 'Meera Joshi')
    const autumn = within(dialog).getByText('Autumn Cup').closest('tr')
    await user.click(within(autumn).getByRole('button', { name: 'Not this athlete' }))
    expect(http.request).toHaveBeenCalledWith('/analytics/athlete-links', { method: 'POST', body: { kind: 'apart', playerIds: ['p3'] } })
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(await screen.findByText('The Autumn Cup record is now an athlete of its own')).toBeInTheDocument()
    expect(http.request.mock.calls.filter(([path, options]) => path === '/analytics' && !options).length).toBe(2)

    await user.click(screen.getByText('Meera Joshi'))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Join' })).toBeDisabled()
    await user.click(within(dialog).getByLabelText('Same athlete as…'))
    await user.click(await screen.findByRole('option', { name: /Mira Joshi · ABC Karate · 1 tournament/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Join' }))
    expect(http.request).toHaveBeenCalledWith('/analytics/athlete-links', { method: 'POST', body: { kind: 'same', playerIds: ['p1', 'p2'] } })
    expect(await screen.findByText('Meera Joshi and Mira Joshi are now one athlete')).toBeInTheDocument()
  })

  it('lists decisions with Undo for an organiser', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, { role: 'admin' }, 'Mira Joshi')
    expect(within(dialog).getByText('Not the same athlete: Mira Joshi in Summer Cup was set apart')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Undo' }))
    expect(http.request).toHaveBeenCalledWith('/analytics/athlete-links/l9', { method: 'DELETE' })
    expect(await screen.findByText('Decision undone: name and date of birth decide again')).toBeInTheDocument()
  })

  it('separates only lines matched by name and birthday: a line joined by hand leaves through Undo', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, { role: 'admin' }, 'Kabir Shah')
    const row = (cup) => within(dialog).getByText(cup).closest('tr')
    expect(within(row('Spring Cup')).queryByRole('button', { name: 'Not this athlete' })).not.toBeInTheDocument()
    expect(within(row('Summer Cup')).queryByRole('button', { name: 'Not this athlete' })).not.toBeInTheDocument()
    expect(within(row('Autumn Cup')).getByRole('button', { name: 'Not this athlete' })).toBeInTheDocument()
    expect(within(dialog).getByText('Same athlete: Kabir Sha in Spring Cup and Kabir Shah in Summer Cup')).toBeInTheDocument()
  })

  it('shows a viewer the decisions but no way to change them', async () => {
    const user = userEvent.setup()
    let dialog = await open(user, { role: 'viewer' }, 'Mira Joshi')
    expect(within(dialog).getByText(/was set apart/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    await user.click(screen.getByText('Meera Joshi'))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Not this athlete' })).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Same athlete as…')).not.toBeInTheDocument()
  })
})
