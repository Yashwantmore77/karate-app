import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import TournamentManager from './TournamentManager'
import { hasUnsaved } from '../../components/tms/unsaved'

vi.mock('../../data/domain', () => ({ tournaments: { get: vi.fn(async (id) => ({ id, name: 'Dewas Open', lifecycleStatus: 'ENTRIES_LOCKED', type: 'kumite' })) } }))
vi.mock('../../data/tms', async (importOriginal) => ({ ...(await importOriginal()), tms: { dashboard: vi.fn(async () => ({})), logExport: vi.fn() } }))
vi.mock('../../components/help/WorkflowGuide', () => ({ default: () => null }))
vi.mock('../../components/tms/EventSession', () => ({ default: () => null }))
vi.mock('./OverviewTab', () => ({ default: () => <p>The dashboard</p> }))
// The Draw tab with a pool moved and not saved.
vi.mock('./DrawTab', async () => {
  const { useUnsaved } = await import('../../components/tms/unsaved')
  return { default: function ChangedDraw() { useUnsaved(true); return <p>Pools changed, not saved</p> } }
})

/** KAN-424: rearranged pools are not dropped by a click on another tab. */
describe('leaving a tab with changes not saved', () => {
  it('asks first: Cancel stays on the tab, Leave drops the changes', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin/tournaments/t1?tab=draw']}>
        <Routes><Route path="/admin/tournaments/:tournamentId" element={<TournamentManager profile={{ role: 'admin' }} />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Pools changed, not saved')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }))
    let dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(screen.getByText('Pools changed, not saved')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }))
    dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(screen.getByText('The dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Pools changed, not saved')).not.toBeInTheDocument()
    expect(hasUnsaved()).toBe(false)

    // With nothing unsaved, a tab opens straight away.
    await user.click(screen.getByRole('tab', { name: 'Draw / Pools' }))
    expect(await screen.findByText('Pools changed, not saved')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
