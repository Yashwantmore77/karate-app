import { remainingNow } from '@kumite/shared/clock.js'
import {
  applyCommand, applyExpiry, initialMatchState, withOutcome, pushHistory, UNDO
} from '@kumite/shared/commands.js'

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
    this.history = []
    // PRD v1 §15/§28: a retried command (same clientEventId) is applied once.
    this.seen = new Map()
    // Commands run one after another, in arrival order, even with async checks.
    this.queue = Promise.resolve()
    this.restored = false
  }

  /** PRD v1 §28 "Interrupted match: preserve state and resume". */
  restore({ seq = 0, state = null, history = [] } = {}) {
    if (!state) return
    this.seq = seq
    this.state = state
    this.history = Array.isArray(history) ? history : []
  }

  /** The seq a client event was already applied at, or undefined. */
  duplicateOf(clientEventId) {
    return clientEventId ? this.seen.get(clientEventId) : undefined
  }

  remember(clientEventId, seq) {
    if (!clientEventId) return
    this.seen.set(clientEventId, seq)
    if (this.seen.size > 500) this.seen.delete(this.seen.keys().next().value)
  }

  snapshot() {
    return { matchId: this.matchId, seq: this.seq, controllerId: this.controllerId, state: this.state }
  }

  /**
   * Takes the mat, if it is free or already yours.
   *
   * `force` is how a mat gets unstuck. Control is otherwise only given up on
   * disconnect, so a tab that died without the server noticing — or a device
   * left open in a bag — holds a mat indefinitely, and every referee who
   * arrives afterwards presses buttons that do nothing. Seizing it is a
   * deliberate act by someone with the whistle, never automatic: quietly
   * moving control mid-bout is worse than refusing it.
   */
  claim(socketId, { force = false } = {}) {
    if (this.controllerId && this.controllerId !== socketId && !force) return false
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

    if (cmd === UNDO) {
      if (!this.history.length) return null
      this.state = this.history[this.history.length - 1]
      this.history = this.history.slice(0, -1)
      this.seq += 1
      return { seq: this.seq, cmd, at, state: this.state }
    }

    this.state = withOutcome(applyCommand(before, cmd, payload, at), undefined, at)
    if (this.state === before) return null
    this.history = pushHistory(this.history, before)
    this.seq += 1
    return { seq: this.seq, cmd, at, state: this.state }
  }

  sweepExpiry() {
    const at = serverNow()
    const before = this.state
    const next = withOutcome(applyExpiry(before, at, remainingNow), undefined, at)
    if (next === before) return null
    this.state = next
    this.seq += 1
    return { seq: this.seq, cmd: 'CLOCK_EXPIRED', at, state: this.state }
  }
}
