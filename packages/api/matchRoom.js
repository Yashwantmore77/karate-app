import { remainingNow } from '@kumite/shared/clock.js'
import {
  applyExpiry, initialMatchState, withOutcome, stepBout
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
    // Offline scoring: how many times the mat has passed to a different
    // person, and when the last change was stamped. A referee's device that
    // scored offline replays its actions only if nobody else took the mat
    // meanwhile (its own reconnection does not count).
    this.controllerUid = null
    this.handoffs = 0
    this.lastAt = 0
  }

  /** PRD v1 §28 "Interrupted match: preserve state and resume". */
  restore({ seq = 0, state = null, history = [], handoffs = 0, controllerUid = null, lastAt = 0 } = {}) {
    if (!state) return
    this.seq = seq
    this.state = state
    this.history = Array.isArray(history) ? history : []
    this.handoffs = Number(handoffs) || 0
    this.controllerUid = controllerUid || null
    this.lastAt = Number(lastAt) || 0
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
    return { matchId: this.matchId, seq: this.seq, controllerId: this.controllerId, handoffs: this.handoffs, state: this.state }
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
  claim(socketId, { force = false, uid = null } = {}) {
    if (this.controllerId && this.controllerId !== socketId && !force) return false
    this.controllerId = socketId
    if (uid && this.controllerUid && uid !== this.controllerUid) this.handoffs += 1
    if (uid) this.controllerUid = uid
    return true
  }

  release(socketId) {
    if (this.controllerId === socketId) this.controllerId = null
  }

  controls(socketId) {
    return this.controllerId === socketId
  }

  /**
   * `at` is the server's time, except for an action scored offline and
   * replayed: then it is when the action happened, kept in order (never
   * before the last stamped change) and never in the future.
   */
  apply(cmd, payload, socketId, { at: clientAt = null } = {}) {
    if (!this.controls(socketId)) {
      throw Object.assign(new Error('not the controller'), { code: 'not_controller' })
    }
    const now = serverNow()
    const at = Number.isFinite(clientAt) ? Math.min(now, Math.max(this.lastAt, clientAt)) : now
    this.lastAt = Math.max(this.lastAt, at)
    const step = stepBout({ state: this.state, history: this.history }, cmd, payload, at)
    if (!step.changed) return null
    this.state = step.state
    this.history = step.history
    this.seq += 1
    return { seq: this.seq, cmd, at, state: this.state }
  }

  sweepExpiry() {
    const at = serverNow()
    this.lastAt = Math.max(this.lastAt, at)
    const before = this.state
    const next = withOutcome(applyExpiry(before, at, remainingNow), undefined, at)
    if (next === before) return null
    this.state = next
    this.seq += 1
    return { seq: this.seq, cmd: 'CLOCK_EXPIRED', at, state: this.state }
  }
}
