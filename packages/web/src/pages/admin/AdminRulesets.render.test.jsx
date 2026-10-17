import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The rules themselves are checked in the shared suite; this is about the form
// catching them before the round trip.
const data = vi.hoisted(() => ({ rulesets: vi.fn(), updateRuleset: vi.fn(), createRuleset: vi.fn() }))
vi.mock('../../data/tms', () => ({
  tms: data,
  describeError: (err) => err?.code || 'error',
}))

const AdminRulesets = (await import('./AdminRulesets')).default

const WKF = {
  id: 'builtin-wkf', family: 'builtin-wkf', name: 'WKF (standard)', version: 1, active: true, builtIn: true, description: '',
  kumite: { matchDurationSec: 180, pointGap: 8, points: { yuko: 1, wazaAri: 2, ippon: 3 }, senshu: true, overtime: 'senshu', extraTimeSec: 60, penaltyCategories: 2, penaltyLadder: ['C', 'K', 'HC', 'H'] },
  kata: { kataJudges: 5, kataMethod: 'drop_high_low_average', kataMinScore: 5, kataMaxScore: 10, kataPrecision: 1, kataRounds: 2, kataQualifiers: 8, kataComponents: false, kataTechnicalWeight: 0.7, kataTieBreak: 'total_then_best' },
}

const openEditor = async (user) => {
  render(<AdminRulesets />)
  await screen.findByText('WKF (standard)')
  await user.click(screen.getByRole('button', { name: /Edit WKF/i }))
  return screen.getByRole('dialog')
}

describe('AdminRulesets', () => {
  beforeEach(() => {
    data.rulesets.mockReset().mockResolvedValue([WKF])
    data.updateRuleset.mockReset().mockResolvedValue({ ...WKF, version: 2 })
    data.createRuleset.mockReset()
  })

  it('names the field that is out of range instead of sending it to the server', async () => {
    const user = userEvent.setup()
    const dialog = await openEditor(user)

    // 5 seconds is below the 30-second floor the server keeps.
    const bout = within(dialog).getByLabelText('Bout length (seconds)')
    await user.clear(bout)
    await user.type(bout, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText(/Check Bout length \(seconds\)/i)).toBeInTheDocument()
    expect(data.updateRuleset).not.toHaveBeenCalled()
  })

  it('says nothing until Save is pressed, then saves once the value is in range', async () => {
    const user = userEvent.setup()
    const dialog = await openEditor(user)

    const judges = within(dialog).getByLabelText('Judges')
    await user.clear(judges)
    expect(within(dialog).queryByText(/^Check /)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(/Check Kata judges/i)).toBeInTheDocument()

    await user.type(judges, '7')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(data.updateRuleset).toHaveBeenCalledTimes(1))
    expect(data.updateRuleset.mock.calls[0][1].kata.kataJudges).toBe(7)
  })
})
