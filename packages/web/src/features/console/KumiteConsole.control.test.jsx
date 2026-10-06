import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
