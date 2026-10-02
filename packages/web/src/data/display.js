import { httpGet, httpPut } from './http'

// How often a hall screen asks what is on. The clock is derived locally from the
// anchor, so this only paces how quickly a score change appears, not the timer.
const DISPLAY_POLL_MS = 1000

/**
 * What a public scoreboard shows: one document, "what is on right now".
 *
 * The referee's console publishes to it; a screen in the hall reads it.
 */
export const displayRepo = {
  get: async () => (await httpGet('/display')).display,
  put: async (payload) => (await httpPut('/display', payload)).display,
  /**
   * Polled rather than pushed, because a hall screen has no session: it cannot
   * join the authenticated socket the referee's devices use. Poll failures are
   * swallowed on purpose — a scoreboard that stops asking after one dropped
   * request is worse than one that shows the last score a moment longer.
   */
  subscribe: (cb) => {
    let stopped = false
    const tick = async () => {
      try {
        const row = await displayRepo.get()
        if (!stopped) cb(row)
      } catch {
        // Keep asking.
      }
    }
    tick()
    const id = setInterval(tick, DISPLAY_POLL_MS)
    return () => { stopped = true; clearInterval(id) }
  },
}
