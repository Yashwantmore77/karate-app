import { describe, it, expect } from 'vitest'
import {
  makeClock, remainingNow, startClock, stopClock, adjustClock, setClock, hasExpired
} from './clock'

const T = 1_000_000 // an arbitrary "server now"

describe('clock anchor', () => {
  it('reports the stored remainder while stopped, whatever the time is', () => {
    const clock = makeClock(180_000)
    expect(remainingNow(clock, T)).toBe(180_000)
    expect(remainingNow(clock, T + 60_000)).toBe(180_000)
  })

  it('derives the remainder from elapsed time while running', () => {
    const clock = startClock(makeClock(180_000), T)
    expect(remainingNow(clock, T)).toBe(180_000)
    expect(remainingNow(clock, T + 45_000)).toBe(135_000)
  })

  it('never goes below zero', () => {
    const clock = startClock(makeClock(1_000), T)
    expect(remainingNow(clock, T + 5_000)).toBe(0)
  })

  it('gives every device the same value regardless of when it joins', () => {
    const clock = startClock(makeClock(180_000), T)
    const late = remainingNow(clock, T + 320) // a judge 320ms behind
    const onTime = remainingNow(clock, T + 320)
    expect(late).toBe(onTime)
    expect(late).toBe(179_680)
  })
})

describe('start and stop', () => {
  it('start anchors to the server time it was given', () => {
    const clock = startClock(makeClock(180_000), T)
    expect(clock).toEqual({ running: true, remainingMs: 180_000, startedAt: T })
  })

  it('stop banks the elapsed time and drops the anchor', () => {
    const running = startClock(makeClock(180_000), T)
    expect(stopClock(running, T + 45_000)).toEqual({
      running: false, remainingMs: 135_000, startedAt: null
    })
  })

  it('survives a start/stop cycle without losing time', () => {
    let clock = makeClock(180_000)
    clock = startClock(clock, T)
    clock = stopClock(clock, T + 30_000)
    clock = startClock(clock, T + 90_000) // 60s of stoppage
    expect(remainingNow(clock, T + 100_000)).toBe(140_000)
  })

  it('ignores a second start and a stop while already stopped', () => {
    const running = startClock(makeClock(180_000), T)
    expect(startClock(running, T + 5_000)).toBe(running)
    const stopped = makeClock(180_000)
    expect(stopClock(stopped, T)).toBe(stopped)
  })

  it('refuses to start an expired clock', () => {
    const expired = makeClock(0)
    expect(startClock(expired, T).running).toBe(false)
  })
})

describe('adjust and set', () => {
  it('adjusts a stopped clock', () => {
    const clock = adjustClock(makeClock(180_000), 5_000, T)
    expect(clock.remainingMs).toBe(185_000)
    expect(clock.running).toBe(false)
  })

  it('adjusts a running clock and re-anchors so no time is lost', () => {
    const running = startClock(makeClock(180_000), T)
    const adjusted = adjustClock(running, -5_000, T + 45_000)
    expect(adjusted.startedAt).toBe(T + 45_000)
    expect(remainingNow(adjusted, T + 45_000)).toBe(130_000)
  })

  it('clamps an adjustment at zero', () => {
    expect(adjustClock(makeClock(3_000), -10_000, T).remainingMs).toBe(0)
  })

  it('sets a new duration, keeping the running state', () => {
    const running = startClock(makeClock(180_000), T)
    const reset = setClock(running, 60_000, T + 10_000)
    expect(remainingNow(reset, T + 10_000)).toBe(60_000)
    expect(reset.running).toBe(true)
  })
})

describe('expiry', () => {
  it('expires exactly once the duration has elapsed', () => {
    const clock = startClock(makeClock(1_000), T)
    expect(hasExpired(clock, T + 999)).toBe(false)
    expect(hasExpired(clock, T + 1_000)).toBe(true)
  })
})
