import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PoolBoard from './PoolBoard'

const data = vi.hoisted(() => ({ arrangePools: vi.fn(), arrangeSheet: vi.fn(), confirmPools: vi.fn(), reopenPools: vi.fn() }))
vi.mock('../../data/tms', () => ({ tms: data }))

const NAMES = { a1: 'Aarav Patil', a2: 'Rohan Kulkarni', a3: 'Ishaan Rao', b1: 'Kabir Shah', b2: 'Vihaan Joshi', b3: 'Arjun Nair' }
const POOLS = [
  { id: 'pa', name: 'A', divisionKey: 'k', poolSize: 4, poolSystem: 'round_robin', playerIds: ['a1', 'a2', 'a3'] },
  { id: 'pb', name: 'B', divisionKey: 'k', poolSize: 4, poolSystem: 'round_robin', playerIds: ['b1', 'b2', 'b3'] },
]

const setup = (props = {}) => {
  const action = { run: vi.fn(async (fn) => fn()), notify: vi.fn() }
  const onChanged = vi.fn()
  render(<PoolBoard tid="t1" division={{ key: 'k', label: 'Boys 12-13 / Kumite / -35 KG' }} pools={POOLS} nameOf={(id) => NAMES[id]} teamOf={() => ''}
    maxSize={4} drawLocked={false} action={action} onChanged={onChanged} onPrint={vi.fn()} {...props} />)
  return { action, onChanged }
}
const pool = (name) => screen.getByTestId(`pool-${name}`)
const drag = (who, to) => {
  const transfer = { setData: vi.fn(), effectAllowed: '' }
  fireEvent.dragStart(screen.getByText(who), { dataTransfer: transfer })
  fireEvent.dragOver(pool(to), { dataTransfer: transfer })
  fireEvent.drop(pool(to), { dataTransfer: transfer })
}

/** KAN-424: pools changed by hand, then confirmed one category at a time. */
describe('the pool editor on the Draw tab', () => {
  beforeEach(() => {
    data.arrangePools.mockReset().mockResolvedValue([])
    data.arrangeSheet.mockReset().mockResolvedValue([])
    data.confirmPools.mockReset().mockResolvedValue({ created: 7, drawLocked: false })
    data.reopenPools.mockReset().mockResolvedValue([])
  })

  it('moves a dragged player, adds a pool, and confirms the layout on screen', async () => {
    const user = userEvent.setup()
    const { onChanged } = setup()
    drag('Aarav Patil', 'B')
    expect(within(pool('B')).getByText('Aarav Patil')).toBeInTheDocument()
    expect(screen.getByText('Not saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add pool' }))
    drag('Rohan Kulkarni', 'C')
    // A pool of one has nobody to fight: neither Save nor Confirm until it is fixed.
    expect(within(pool('C')).getByText('Needs at least two players.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    // Tap, then "Move here": the same move without dragging (touch screens).
    await user.click(screen.getByText('Ishaan Rao'))
    await user.click(within(pool('C')).getByRole('button', { name: 'Move here' }))
    expect(within(pool('A')).getByText(/Empty/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/its 7 matches are made now/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(data.confirmPools).toHaveBeenCalledWith('t1', 'k', {
      pools: [{ id: 'pa', playerIds: [] }, { id: 'pb', playerIds: ['b1', 'b2', 'b3', 'a1'] }, { playerIds: ['a2', 'a3'] }], reason: null, force: false,
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('asks for a reason when a pool goes over the maximum, and Discard puts everything back', async () => {
    const user = userEvent.setup()
    setup({ maxSize: 3 })
    drag('Aarav Patil', 'B')
    expect(within(pool('B')).getByText(/Over the maximum of 3/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save pools' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Save pools' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Reason'), 'Clubmates apart')
    await user.click(within(dialog).getByRole('button', { name: 'Save pools' }))
    expect(data.arrangePools).toHaveBeenCalledWith('t1', 'k', [{ id: 'pa', playerIds: ['a2', 'a3'] }, { id: 'pb', playerIds: ['b1', 'b2', 'b3', 'a1'] }], { reason: 'Clubmates apart', force: true })

    // (once the dialog has gone, the rest of the page is reachable again)
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    drag('Kabir Shah', 'A')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(within(pool('A')).getByText('Aarav Patil')).toBeInTheDocument()
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument()
  })

  it('shows a confirmed category as final, and reopens it with a reason', async () => {
    const user = userEvent.setup()
    setup({ pools: POOLS.map((p) => ({ ...p, confirmedAt: '2027-01-15T09:00:00Z' })) })
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add pool' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Reason'), 'Wrong pool')
    await user.click(within(dialog).getByRole('button', { name: 'Reopen' }))
    expect(data.reopenPools).toHaveBeenCalledWith('t1', 'k', 'Wrong pool')
  })

  // KAN-425: a knockout category is its paper sheet; players are swapped between the Aka / Ao boxes.
  it('shows a knockout category as its sheet: drag or tap to swap places, then confirm that sheet', async () => {
    const user = userEvent.setup()
    const sheet = ['a1', 'b1', 'a2', null, 'a3', 'b2', 'b3', null]
    setup({ pools: [{ id: 'ko', name: 'A', divisionKey: 'k', poolSize: 8, poolSystem: 'knockout', playerIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], places: sheet }], thirdPlace: true })
    expect(screen.queryByRole('button', { name: 'Add pool' })).not.toBeInTheDocument()
    expect(screen.getByText('3rd/4th Place')).toBeInTheDocument()
    const place = (i) => screen.getByTestId(`place-${i}`)
    expect(place(0)).toHaveTextContent('Aarav Patil')
    expect(place(3)).toHaveTextContent('bye')

    // Drag Kabir Shah (box 1) onto the empty box 3: Aarav now has a bye, Kabir faces Rohan.
    const transfer = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(place(1), { dataTransfer: transfer })
    fireEvent.dragOver(place(3), { dataTransfer: transfer })
    fireEvent.drop(place(3), { dataTransfer: transfer })
    expect(place(3)).toHaveTextContent('Kabir Shah')
    expect(screen.getByText('Not saved')).toBeInTheDocument()

    // Tap, tap: Ishaan Rao (box 4) and Vihaan Joshi (box 5) change sides.
    await user.click(place(4))
    await user.click(place(5))
    expect(place(4)).toHaveTextContent('Vihaan Joshi')

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/its 2 first-round bouts are made now/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(data.confirmPools).toHaveBeenCalledWith('t1', 'k', { places: ['a1', null, 'a2', 'b1', 'b2', 'a3', 'b3', null], reason: null, force: false })
  })

  it('will not save a sheet with an empty first-round bout', async () => {
    setup({ pools: [{ id: 'ko', name: 'A', divisionKey: 'k', poolSize: 8, poolSystem: 'knockout', playerIds: ['a1', 'a2', 'a3', 'b1', 'b2'], places: ['a1', 'a2', 'a3', null, 'b1', null, 'b2', null] }] })
    // Kabir Shah (box 4) to the empty box 3 leaves bout 3 with nobody in it.
    const transfer = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(screen.getByTestId('place-4'), { dataTransfer: transfer })
    fireEvent.dragOver(screen.getByTestId('place-3'), { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('place-3'), { dataTransfer: transfer })
    expect(screen.getByText(/A first-round bout has nobody in it/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save sheet' })).toBeDisabled()
  })
})
