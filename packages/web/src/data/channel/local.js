// Local channel: the repo is the bus. Good enough for one machine (several
// tabs), and it keeps the exact same shape as the socket channel so screens
// cannot tell which one they are talking to.

import { matchStateRepo } from '../repo'
import {
  applyCommand, applyExpiry, initialMatchState, withOutcome, pushHistory, UNDO
} from '@kumite/shared/commands.js'
import { remainingNow } from '@kumite/shared/clock.js'

const EXPIRY_SWEEP_MS = 250

export function openLocalMatch(matchId, { control = true } = {}) {
  let state = null
  let listeners = new Set()
  let seeded = false
  let history = []

  const push = (next) => {
    state = next
    listeners.forEach((cb) => cb(next))
  }

  const off = matchStateRepo.subscribe(matchId, (row) => {
    if (!row) {
      if (!seeded) {
        seeded = true
        const seed = initialMatchState()
        push(seed)
        matchStateRepo.put(matchId, seed)
      }
      return
    }
    const { id, createdAt, ...rest } = row
    push(rest)
  })

  // Without a server, whoever holds control sweeps expiry.
  const sweep = control
    ? setInterval(() => {
        if (!state) return
        const at = Date.now()
        const next = withOutcome(applyExpiry(state, at, remainingNow), undefined, at)
        if (next !== state) {
          push(next)
          matchStateRepo.put(matchId, next)
        }
      }, EXPIRY_SWEEP_MS)
    : null

  return {
    control,
    subscribe(cb) {
      listeners.add(cb)
      if (state) cb(state)
      return () => listeners.delete(cb)
    },
    send(cmd, payload) {
      if (!control || !state) return
      const at = Date.now()

      if (cmd === UNDO) {
        if (!history.length) return
        const previous = history[history.length - 1]
        history = history.slice(0, -1)
        push(previous)
        matchStateRepo.put(matchId, previous)
        return
      }

      const before = state
      const next = withOutcome(applyCommand(before, cmd, payload, at), undefined, at)
      if (next === before) return
      history = pushHistory(history, before)
      push(next)
      matchStateRepo.put(matchId, next)
    },
    close() {
      off()
      if (sweep) clearInterval(sweep)
      listeners = new Set()
    },
  }
}
