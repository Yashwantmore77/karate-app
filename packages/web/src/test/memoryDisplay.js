/**
 * An in-memory stand-in for data/display, for tests where the console
 * publishes and a scoreboard reads.
 *
 * Same shape as the real displayRepo. Subscribers are told synchronously on
 * every put, where the real one polls once a second; a test wants the change,
 * not the wait.
 *
 *   vi.mock('../data/display', () => import('../test/memoryDisplay'))
 *   import { resetDisplay } from '../test/memoryDisplay'
 *   beforeEach(() => resetDisplay())
 */

let live = null
const listeners = new Set()

/** Clears what is published. Call in beforeEach. */
export function resetDisplay() {
  live = null
  listeners.clear()
}

export const displayRepo = {
  get: async () => (live ? structuredClone(live) : null),
  put: async (payload) => {
    live = { ...(live || {}), ...structuredClone(payload), id: 'live' }
    listeners.forEach((cb) => cb(structuredClone(live)))
    return structuredClone(live)
  },
  subscribe: (cb) => {
    listeners.add(cb)
    cb(live ? structuredClone(live) : null)
    return () => listeners.delete(cb)
  },
}
