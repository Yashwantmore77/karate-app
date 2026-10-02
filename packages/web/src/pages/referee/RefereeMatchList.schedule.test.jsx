import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RefereeMatchList from './RefereeMatchList'
import { HttpError } from '../../data/http'

const categoryId = 'cat-1'

const TOURNAMENT = {
  id: 't1',
  name: 'Clash Cup',
  location: 'Pune',
  date: '2099-05-15',
  template: 'kumite',
  judgeCount: 4,
  slotMinutes: 20,
}

const CATEGORY = { id: categoryId, tournamentId: 't1', name: 'U14 Boys' }

const COMPETITORS = [
  { id: 'comp-1', bib: '101', name: 'Aarav Deshmukh' },
  { id: 'comp-2', bib: '102', name: 'Rohan Kulkarni' },
]

const store = vi.hoisted(() => ({
  tournaments: { get: vi.fn(), list: vi.fn() },
  categories: { find: vi.fn() },
  competitors: { list: vi.fn() },
  matches: { page: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
  isRemote: true,
}))

vi.mock('../../data/domain', () => store)

// The officials pickers read from here; a referee and a judge are enough to
// prove a clash is reported with a readable name rather than a uid.
vi.mock('../../data/users', () => ({
  isAvailable: () => true,
  officials: vi.fn(async (role) => (
    role === 'referee'
      ? [{ uid: 'ref-uid-001', email: 'referee@kata.local', role: 'referee' }]
      : [{ uid: 'judge1-uid', email: 'judge1@kata.local', role: 'judge', seat: 1 }]
  )),
}))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/referee/category/${categoryId}`]}>
      <Routes>
        <Route
          path="/referee/category/:categoryId"
          element={<RefereeMatchList uid="ref-uid-001" profile={{ role: 'referee' }} />}
        />
      </Routes>
    </MemoryRouter>
  )

const openDialog = async (user) => {
  await screen.findByText('U14 Boys')
  await user.click(screen.getByRole('button', { name: /new match/i }))
  return screen.getByRole('dialog')
}

const pickCompetitors = async (user, dialog) => {
  await user.click(within(dialog).getAllByRole('combobox')[0])
  await user.click(await screen.findByRole('option', { name: /aarav/i }))
  await user.click(within(dialog).getAllByRole('combobox')[1])
  await user.click(await screen.findByRole('option', { name: /rohan/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  store.tournaments.get.mockResolvedValue(TOURNAMENT)
  store.categories.find.mockResolvedValue(CATEGORY)
  store.competitors.list.mockResolvedValue(COMPETITORS)
  store.matches.page.mockResolvedValue({ rows: [], total: 0, pages: 1, page: 1 })
  store.matches.list.mockResolvedValue([])
  store.matches.create.mockResolvedValue({ id: 'm-new' })
})

describe('scheduling a bout', () => {
  it('shows the slot length the tournament actually uses', async () => {
    const user = userEvent.setup()
    renderPage()
    await openDialog(user)
    // 20, not the stock 15: the figure has to come from the tournament or it
    // tells the referee the wrong thing about who it blocks.
    expect(await screen.findByText(/holds everyone on this bout for 20 minutes/i)).toBeInTheDocument()
  })

  it('sends the typed time as an instant, not as naive text', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)

    const field = within(dialog).getByLabelText(/scheduled time/i)
    await user.type(field, '2099-05-15T13:00')
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    const sent = store.matches.create.mock.calls[0][1]
    // The API refuses a time with no zone, so what leaves here must carry one.
    expect(sent.scheduledAt).toMatch(/Z$/)
    expect(new Date(sent.scheduledAt).getHours()).toBe(13)
  })

  it('omits the time entirely when the field is left blank', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    // Absent, not null: a bout with no time is one the server never scheduled.
    expect(store.matches.create.mock.calls[0][1]).not.toHaveProperty('scheduledAt')
  })
})

describe('when the server reports a clash', () => {
  const clashError = (clashes) => new HttpError(409, 'schedule_conflict', { clashes })

  it('names the person and what they are already doing', async () => {
    store.matches.create.mockRejectedValue(clashError([
      {
        uid: 'ref-uid-001',
        role: 'referee',
        otherRole: 'referee',
        matchId: 'm-other',
        scheduledAt: '2099-05-15T07:30:00.000Z',
        mat: 2,
      },
    ]))

    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already busy at that time/i)
    expect(alert).toHaveTextContent('referee@kata.local')
    expect(alert).toHaveTextContent(/is refereeing/i)
    expect(alert).toHaveTextContent(/on mat 2/i)
  })

  it('lists every clash, not only the first', async () => {
    // Moving one person does no good if a second is also double-booked, so the
    // referee has to see all of them at once.
    store.matches.create.mockRejectedValue(clashError([
      { uid: 'ref-uid-001', role: 'referee', otherRole: 'referee', matchId: 'm-a', scheduledAt: '2099-05-15T07:30:00.000Z', mat: 1 },
      { uid: 'comp-1', role: 'competitor', otherRole: 'competitor', matchId: 'm-b', scheduledAt: '2099-05-15T07:40:00.000Z', mat: 3 },
    ]))

    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('referee@kata.local')
    // Resolved from the competitor roster, not the officials list.
    expect(alert).toHaveTextContent('Aarav Deshmukh')
    expect(alert).toHaveTextContent(/is fighting in/i)
  })

  it('keeps the dialog open so the selections are not lost', async () => {
    store.matches.create.mockRejectedValue(clashError([
      { uid: 'ref-uid-001', role: 'referee', otherRole: 'referee', matchId: 'm-a', scheduledAt: '2099-05-15T07:30:00.000Z', mat: 1 },
    ]))

    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears the clash list when the dialog is cancelled', async () => {
    store.matches.create.mockRejectedValue(clashError([
      { uid: 'ref-uid-001', role: 'referee', otherRole: 'referee', matchId: 'm-a', scheduledAt: '2099-05-15T07:30:00.000Z', mat: 1 },
    ]))

    const user = userEvent.setup()
    renderPage()
    const dialog = await openDialog(user)
    await pickCompetitors(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: /create match/i }))
    await screen.findByRole('alert')

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }))
    // The page behind an open MUI dialog is aria-hidden, so the button is not
    // reachable by role until the dialog has actually gone.
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    await user.click(screen.getByRole('button', { name: /new match/i }))

    // A stale clash from a previous attempt would read as a fresh refusal.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('assigning a panel to a bout that already exists', () => {
  const EXISTING = {
    id: 'm-1',
    categoryId,
    redId: 'comp-1',
    blueId: 'comp-2',
    status: 'open',
    refereeId: null,
    judgeIds: [],
    scheduledAt: null,
  }

  beforeEach(() => {
    store.matches.page.mockResolvedValue({ rows: [EXISTING], total: 1, pages: 1, page: 1 })
    store.matches.update.mockResolvedValue({ ...EXISTING, refereeId: 'ref-uid-001' })
  })

  const openPanelDialog = async (user, match = EXISTING) => {
    await screen.findByText('U14 Boys')
    await user.click(await screen.findByRole('button', { name: /assign officials/i }))
    return screen.getByRole('dialog')
  }

  it('offers a way in from the row, not only from Create Match', async () => {
    // The panel is settled after the draw has produced the bout, so a dialog
    // reachable only while creating one is a dead end.
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)
    expect(within(dialog).getByText(/assign officials/i)).toBeInTheDocument()
  })

  it('shows how much of the panel is filled, on the row', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('U14 Boys')
    expect(await screen.findByText('No referee')).toBeInTheDocument()
    expect(screen.getByText('0/4 judges')).toBeInTheDocument()
  })

  it('patches the existing bout instead of creating another', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)

    // The referee picker is the third combobox: red, blue, referee, judges.
    await user.click(within(dialog).getAllByRole('combobox')[2])
    await user.click(await screen.findByRole('option', { name: /referee@kata.local/i }))
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    expect(store.matches.create).not.toHaveBeenCalled()
    const [, matchId, patch] = store.matches.update.mock.calls[0]
    expect(matchId).toBe('m-1')
    expect(patch.refereeId).toBe('ref-uid-001')
  })

  it('selects judges onto the panel', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)

    await user.click(within(dialog).getAllByRole('combobox')[3])
    await user.click(await screen.findByRole('option', { name: /judge1@kata.local/i }))
    await user.keyboard('{Escape}')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    expect(store.matches.update.mock.calls[0][2].judgeIds).toEqual(['judge1-uid'])
  })

  it('pre-fills the panel already on the bout', async () => {
    store.matches.page.mockResolvedValue({
      rows: [{ ...EXISTING, refereeId: 'ref-uid-001', judgeIds: ['judge1-uid'] }],
      total: 1, pages: 1, page: 1,
    })

    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)

    // Opening on a bout that has a panel must show it, or saving would quietly
    // wipe whoever was already on it.
    expect(within(dialog).getByText('referee@kata.local')).toBeInTheDocument()
    expect(within(dialog).getByText('1 of 4 selected')).toBeInTheDocument()
  })

  it('sends null to clear a referee, so a panel can be undone', async () => {
    store.matches.page.mockResolvedValue({
      rows: [{ ...EXISTING, refereeId: 'ref-uid-001' }],
      total: 1, pages: 1, page: 1,
    })

    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)

    await user.click(within(dialog).getAllByRole('combobox')[2])
    await user.click(await screen.findByRole('option', { name: /unassigned/i }))
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    // Omitting the field would leave the old referee in place; null removes it.
    expect(store.matches.update.mock.calls[0][2].refereeId).toBeNull()
  })

  it('reports a clash on an edit the same way it does on a create', async () => {
    store.matches.update.mockRejectedValue(
      new HttpError(409, 'schedule_conflict', {
        clashes: [{
          uid: 'ref-uid-001', role: 'referee', otherRole: 'referee',
          matchId: 'm-other', scheduledAt: '2099-05-15T07:30:00.000Z', mat: 2,
        }],
      })
    )

    const user = userEvent.setup()
    renderPage()
    const dialog = await openPanelDialog(user)

    await user.click(within(dialog).getAllByRole('combobox')[2])
    await user.click(await screen.findByRole('option', { name: /referee@kata.local/i }))
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('referee@kata.local')
    expect(alert).toHaveTextContent(/is refereeing/i)
  })
})
