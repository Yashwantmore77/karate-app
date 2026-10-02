/**
 * An in-memory match channel, for tests that drive the live console.
 *
 * Same shape as data/channel/socket.js, and it runs the real reducer from
 * @kumite/shared, so a test that scores a bout exercises the same rules the
 * server applies. What it leaves out is the network: there is one process, so
 * control is never contested and nothing is refused.
 *
 *   vi.mock('../../data/channel', () => import('../../test/memoryMatchChannel'))
 *   import { resetMemoryMatches } from '../../test/memoryMatchChannel'
 *   afterEach(() => resetMemoryMatches())
 */
import {
  applyCommand, applyExpiry, initialMatchState, withOutcome, pushHistory, UNDO,
} from '@kumite/shared/commands.js'
import { remainingNow } from '@kumite/shared/clock.js'

const EXPIRY_SWEEP_MS = 250

// One room per match, shared by every channel opened on it — the way the
// server's room is shared by every device on a bout.
const rooms = new Map()

const roomFor = (matchId) => {
  if (!rooms.has(matchId)) {
    rooms.set(matchId, { state: initialMatchState(), listeners: new Set(), history: [] })
  }
  return rooms.get(matchId)
}

/** Forgets every match and stops every sweep. Call in afterEach. */
export function resetMemoryMatches() {
  for (const room of rooms.values()) room.stop?.()
  rooms.clear()
}

/** The state a match is in now, for assertions. */
export const matchState = (matchId) => rooms.get(matchId)?.state ?? null

export function openMatch(matchId, { control = true } = {}) {
  const room = roomFor(matchId)
  const own = new Set()

  const push = (next) => {
    room.state = next
    room.listeners.forEach((cb) => cb(next))
  }

  // Whoever holds control sweeps the clock, as the server does on its own.
  const sweep = control
    ? setInterval(() => {
        const at = Date.now()
        const next = withOutcome(applyExpiry(room.state, at, remainingNow), undefined, at)
        if (next !== room.state) push(next)
      }, EXPIRY_SWEEP_MS)
    : null
  const stop = () => { if (sweep) clearInterval(sweep) }
  room.stop = stop

  const status = { holdsControl: control, controllerId: null, contested: false, lastError: null }

  return {
    control,
    subscribe(cb) {
      room.listeners.add(cb)
      own.add(cb)
      cb(room.state)
      return () => { room.listeners.delete(cb); own.delete(cb) }
    },
    subscribeStatus(cb) {
      cb(status)
      return () => {}
    },
    takeover: async () => ({ ok: true }),
    send(cmd, payload) {
      if (!control) return
      const at = Date.now()

      if (cmd === UNDO) {
        if (!room.history.length) return
        const previous = room.history[room.history.length - 1]
        room.history = room.history.slice(0, -1)
        push(previous)
        return
      }

      const before = room.state
      const next = withOutcome(applyCommand(before, cmd, payload, at), undefined, at)
      if (next === before) return
      room.history = pushHistory(room.history, before)
      push(next)
    },
    close() {
      stop()
      own.forEach((cb) => room.listeners.delete(cb))
      own.clear()
    },
  }
}
