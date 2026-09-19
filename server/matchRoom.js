import { remainingNow } from '../src/shared/clock.js'
import { applyCommand, applyExpiry, initialMatchState } from '../src/shared/commands.js'

export const serverNow = () => Date.now()

/**
 * Authoritative state for one match. The server stamps every timestamp and
 * assigns every seq, so no client clock is trusted and two devices cannot race
 * each other into disagreement. Commands run through the same reducer the
 * browser imports, so the two cannot diverge.
 */
export class MatchRoom {
  constructor(matchId) {
    this.matchId = matchId
    this.seq = 0
    this.controllerId = null
    this.state = initialMatchState()
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

  apply(cmd, payload, socketId) {
    if (!this.controls(socketId)) {
      throw Object.assign(new Error('not the controller'), { code: 'not_controller' })
    }
    const at = serverNow()
    const before = this.state
    this.state = applyCommand(before, cmd, payload, at)
    if (this.state === before) return null
    this.seq += 1
    return { seq: this.seq, cmd, at, state: this.state }
  }

  sweepExpiry() {
    const at = serverNow()
    const before = this.state
    const next = applyExpiry(before, at, remainingNow)
    if (next === before) return null
    this.state = next
    this.seq += 1
    return { seq: this.seq, cmd: 'CLOCK_EXPIRED', at, state: this.state }
  }
}
