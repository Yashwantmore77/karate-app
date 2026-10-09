import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { initialMatchState } from '@kumite/shared/commands.js'

// The channel is stubbed rather than the socket: these are about what the
// console does with the answer to "do I actually hold this mat", which the
// server decides and the screen used to ignore entirely.
const channel = vi.hoisted(() => ({ useMatchChannel: vi.fn() }))
vi.mock('../../hooks/useMatchChannel', () => channel)

const KumiteConsole = (await import('./KumiteConsole')).default

const send = vi.fn()
const takeover = vi.fn()

const withMat = (mat) => {
  channel.useMatchChannel.mockReturnValue([
    initialMatchState(),
    send,
    { holdsControl: false, controllerId: null, contested: false, lastError: null, takeover, ...mat },
  ])
}

const renderConsole = (props = {}) =>
  render(
    <KumiteConsole
      matchId="m1"
      redComp={{ id: 'c1', name: 'Alice', bib: '101' }}
      blueComp={{ id: 'c2', name: 'Bob', bib: '102' }}
      onBack={() => {}}
      onFinalize={() => {}}
      {...props}
    />
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('KumiteConsole mat control', () => {
  it('runs the mat normally when this screen holds it', () => {
    withMat({ holdsControl: true, controllerId: 'me' })
    renderConsole()

    expect(screen.queryByText(/another device is running this mat/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('goes read-only and says why when another device holds the mat', () => {
    withMat({ holdsControl: false, contested: true, controllerId: 'someone-else' })
    renderConsole()

    // The bug this replaces: every button looked live and the server silently
    // refused each press.
    expect(screen.getByText(/another device is running this mat/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reset time/i })).toBeDisabled()
  })

  it('seizes the mat when asked to take over', async () => {
    const user = userEvent.setup()
    withMat({ holdsControl: false, contested: true, controllerId: 'someone-else' })
    renderConsole()

    await user.click(screen.getByRole('button', { name: /take over/i }))
    expect(takeover).toHaveBeenCalledTimes(1)
  })

  it('tells a referee who just lost the mat, rather than leaving them guessing', () => {
    withMat({ holdsControl: false, contested: true, lastError: 'taken_over' })
    renderConsole()

    expect(screen.getByText(/another referee took over this mat/i)).toBeInTheDocument()
  })

  it('offers an observer no takeover, since they never came to run the mat', () => {
    withMat({ holdsControl: false, contested: true, controllerId: 'someone-else' })
    renderConsole({ mode: 'observe' })

    expect(screen.queryByRole('button', { name: /take over/i })).not.toBeInTheDocument()
  })
})

// The mat decides which screens show the bout. It starts on the mat the bout
// is scheduled on; showing it on another mat is asked about first.
describe('the mat this console scores', () => {
  const holding = (fieldNumber) => channel.useMatchChannel.mockReturnValue([
    { ...initialMatchState(), fieldNumber },
    send,
    { holdsControl: true, controllerId: 'me', contested: false, lastError: null, takeover },
  ])
  const choose = async (user, name) => {
    await user.click(screen.getByRole('combobox', { name: 'Mat' }))
    await user.click(await screen.findByRole('option', { name }))
  }
  const matSends = () => send.mock.calls.filter(([cmd]) => cmd === 'FIELD_NUMBER')

  it('shows the scheduled mat and offers only the mats the tournament has', async () => {
    const user = userEvent.setup()
    holding('3')
    renderConsole({ scheduledMat: 3, matCount: 4 })
    expect(screen.getByRole('combobox', { name: 'Mat' })).toHaveTextContent('Mat 3')
    expect(screen.getByText('Scheduled on Mat 3: its screens show this bout.')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Mat' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Mat 1', 'Mat 2', 'Mat 3', 'Mat 4'])
  })

  it('asks before showing the bout on another mat, naming both', async () => {
    const user = userEvent.setup()
    holding('3')
    renderConsole({ scheduledMat: 3, matCount: 4 })
    await choose(user, 'Mat 1')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Show this bout on Mat 1 instead of Mat 3?')
    expect(dialog).toHaveTextContent("Mat 1's screens would show it, and Mat 3's screens would show nothing.")
    expect(matSends()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(matSends()).toEqual([['FIELD_NUMBER', { value: '1' }]])
  })

  it('leaves it where it was when that is cancelled', async () => {
    const user = userEvent.setup()
    holding('3')
    renderConsole({ scheduledMat: 3, matCount: 4 })
    await choose(user, 'Mat 2')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(matSends()).toEqual([])
    expect(screen.getByRole('combobox', { name: 'Mat' })).toHaveTextContent('Mat 3')
  })

  it('offers the scheduled mat back when the console is on another one', async () => {
    const user = userEvent.setup()
    holding('1') // e.g. the bout was moved to Mat 3 after this console opened it
    renderConsole({ scheduledMat: 3, matCount: 4 })
    expect(screen.getByText('Scheduled on Mat 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use Mat 3' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(matSends()).toEqual([['FIELD_NUMBER', { value: '3' }]])
  })

  it('changes straight away for a bout not scheduled on any mat', async () => {
    const user = userEvent.setup()
    holding('1')
    renderConsole({ matCount: 2 })
    expect(screen.getByText('Not scheduled on a mat: choose the one you are scoring.')).toBeInTheDocument()
    await choose(user, 'Mat 2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(matSends()).toEqual([['FIELD_NUMBER', { value: '2' }]])
  })
})
