import {
  makeClock, startClock, stopClock, adjustClock, remainingNow
} from '../src/shared/clock.js'
import { makeMatchState, DEFAULT_RULES } from '../src/shared/rules.js'

const DEFAULT_DURATION_MS = 90_000

export const serverNow = () => Date.now()

/**
 * Authoritative state for one match. The server stamps every timestamp and
 * assigns every seq, so no client clock is ever trusted and two devices cannot
 * race each other into disagreement.
 */
export class MatchRoom {
  constructor(matchId) {
    this.matchId = matchId
    this.seq = 0
    this.controllerId = null
    this.state = {
      match: makeMatchState(),
      clock: makeClock(DEFAULT_DURATION_MS),
      durationMs: DEFAULT_DURATION_MS,
      koActive: false,
      koClock: makeClock(DEFAULT_RULES.koTimerMs),
    }
  }

  snapshot() {
    return { matchId: this.matchId, seq: this.seq, controllerId: this.controllerId, state: this.state }
  }

  claim(socketId) {
    if (this.controllerId && this.controllerId !== socketId) return false
    this.controllerId = socketId
    return true
  }

  release(socketId) {
    if (this.controllerId === socketId) this.controllerId = null
  }

  controls(socketId) {
    return this.controllerId === socketId
  }

  /**
   * Applies a command and returns the event to broadcast, or null when the
   * command changed nothing. Rejects anything from a device that is not
   * driving this mat.
   */
  apply(cmd, payload, socketId) {
    if (!this.controls(socketId)) {
      throw Object.assign(new Error('not the controller'), { code: 'not_controller' })
    }

    const at = serverNow()
    const before = this.state

    switch (cmd) {
      case 'CLOCK_START':
        this.state = { ...before, clock: startClock(before.clock, at) }
        break
      case 'CLOCK_STOP':
        this.state = { ...before, clock: stopClock(before.clock, at) }
        break
      case 'CLOCK_ADJUST':
        this.state = { ...before, clock: adjustClock(before.clock, payload?.deltaMs ?? 0, at) }
        break
      case 'CLOCK_SET': {
        const durationMs = Math.max(0, payload?.durationMs ?? DEFAULT_DURATION_MS)
        this.state = { ...before, durationMs, clock: makeClock(durationMs) }
        break
      }
      case 'KO_TIMER':
        this.state = before.koActive
          ? { ...before, koActive: false, koClock: stopClock(before.koClock, at) }
          : {
              ...before,
              koActive: true,
              koClock: startClock(makeClock(DEFAULT_RULES.koTimerMs), at),
              clock: stopClock(before.clock, at),
            }
        break
      default:
        throw Object.assign(new Error(`unknown command ${cmd}`), { code: 'unknown_command' })
    }

    if (this.state === before) return null
    this.seq += 1
    return { seq: this.seq, cmd, at, state: this.state }
  }

  // A clock that has run out is stopped by the server, so every client sees the
  // same stopped anchor instead of each deciding for itself.
  sweepExpiry() {
    const at = serverNow()
    const before = this.state
    let next = before
    if (next.koActive && remainingNow(next.koClock, at) === 0) {
      next = { ...next, koActive: false, koClock: stopClock(next.koClock, at) }
    }
    if (next.clock.running && remainingNow(next.clock, at) === 0) {
      next = { ...next, clock: stopClock(next.clock, at) }
    }
    if (next === before) return null
    this.state = next
    this.seq += 1
    return { seq: this.seq, cmd: 'CLOCK_EXPIRED', at, state: this.state }
  }
}
