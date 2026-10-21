import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActionTips from './ActionTips'

// jsdom has no PointerEvent; a plain event carrying the same fields does.
const touch = (el, type, { x = 10, y = 10 } = {}) => act(() => {
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: 'touch', clientX: x, clientY: y }))
})
const wait = (ms) => act(() => { vi.advanceTimersByTime(ms) })

const setup = () => {
  const pressed = vi.fn()
  render(
    <MemoryRouter>
      <ActionTips />
      <button type="button" data-tip="Saves the weight" onClick={pressed}>Save</button>
      <button type="button" disabled data-tip="Locks the entries" data-tip-needs="Approve every player first.">Lock</button>
    </MemoryRouter>
  )
  return { pressed, save: screen.getByText('Save'), lock: screen.getByText('Lock') }
}

/** Tablets get the same explanations as a mouse: hold to read, tap a grey button to hear why. */
describe('ActionTips on a touch screen', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the tooltip on a long press, and the press does not also press the button', () => {
    const { pressed, save } = setup()
    touch(save, 'pointerdown')
    wait(600)
    expect(screen.getByText('Saves the weight')).toBeInTheDocument()
    touch(save, 'pointerup')
    touch(save, 'pointerout')
    act(() => save.click())
    expect(pressed).not.toHaveBeenCalled()
    // Still up after the finger lifts; the next touch elsewhere clears it.
    expect(screen.getByText('Saves the weight')).toBeInTheDocument()
    touch(document.body, 'pointerdown')
    expect(screen.queryByText('Saves the weight')).not.toBeInTheDocument()
  })

  it('a quick tap presses the button and shows nothing', () => {
    const { pressed, save } = setup()
    touch(save, 'pointerdown')
    wait(100)
    touch(save, 'pointerup')
    act(() => save.click())
    wait(1000)
    expect(pressed).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Saves the weight')).not.toBeInTheDocument()
  })

  it('a tap on a greyed-out button says what it is waiting for', () => {
    const { lock } = setup()
    touch(lock, 'pointerdown')
    wait(0)
    expect(screen.getByText('Locks the entries')).toBeInTheDocument()
    expect(screen.getByText('Not available now: Approve every player first.')).toBeInTheDocument()
  })

  it('a finger that slides away is scrolling, not holding', () => {
    const { save } = setup()
    touch(save, 'pointerdown', { x: 10, y: 10 })
    touch(save, 'pointermove', { x: 10, y: 60 })
    wait(600)
    expect(screen.queryByText('Saves the weight')).not.toBeInTheDocument()
  })
})
