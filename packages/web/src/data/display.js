import { httpGet, httpPut } from './http'
import { publicSocket } from './channel/socket'

// How often a hall screen asks what is on while the public channel is down.
// The clock is derived locally from the anchor, so this only paces how quickly
// a score change appears, not the timer.
const DISPLAY_POLL_MS = 1000
// With the public channel up, scores are pushed; polling only covers gaps.
const DISPLAY_SAFETY_POLL_MS = 10_000

/**
 * What a public scoreboard shows: one document, "what is on right now".
 *
 * The referee's console publishes to it; a screen in the hall reads it.
 */
export const displayRepo = {
  // `mat` picks one mat's screen (PRD v1 §17); without it, the hall screen.
  get: async (mat = null) => (await httpGet(`/display${mat ? `?mat=${mat}` : ''}`, { quiet: true })).display,
  put: async (payload, mat = null) => (await httpPut(`/display${mat ? `?mat=${mat}` : ''}`, payload)).display,
  /**
   * Pushed over the public socket channel, which needs no session (a hall
   * screen has none), and polled as a fallback: every second while that
   * channel is down, every ten seconds while it is up. Poll failures are
   * swallowed on purpose — a scoreboard that stops asking after one dropped
   * request is worse than one that shows the last score a moment longer.
   */
  subscribe: (cb, { mat = null } = {}) => {
    let stopped = false
    const sock = publicSocket()
    const tick = async () => {
      try {
        const row = await displayRepo.get(mat)
        if (!stopped) cb(row)
      } catch {
        // Keep asking.
      }
    }
    // The pushed row is the hall screen's; a mat screen re-reads its own.
    const pushed = (row) => { if (!stopped) (mat ? tick() : cb(row)) }
    const changed = () => { if (!stopped && mat) tick() }
    sock?.on('display:update', pushed)
    sock?.on('display:changed', changed)
    tick()
    let last = Date.now()
    const id = setInterval(() => {
      const every = sock?.connected ? DISPLAY_SAFETY_POLL_MS : DISPLAY_POLL_MS
      if (Date.now() - last >= every) { last = Date.now(); tick() }
    }, DISPLAY_POLL_MS)
    return () => { stopped = true; clearInterval(id); sock?.off('display:update', pushed); sock?.off('display:changed', changed) }
  },
}
