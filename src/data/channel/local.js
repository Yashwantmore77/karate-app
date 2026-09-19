// Local channel: the repo is the bus. Good enough for one machine (several
// tabs), and it keeps the exact same shape as the socket channel so screens
// cannot tell which one they are talking to.

import { matchStateRepo } from '../repo'
import { applyCommand, applyExpiry, initialMatchState } from '../../shared/commands'
import { remainingNow } from '../../shared/clock'

const EXPIRY_SWEEP_MS = 250

export function openLocalMatch(matchId, { control = true } = {}) {
  let state = null
  let listeners = new Set()
  let seeded = false

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
        const next = applyExpiry(state, Date.now(), remainingNow)
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
      const next = applyCommand(state, cmd, payload, Date.now())
      if (next === state) return
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
