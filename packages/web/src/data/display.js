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
   *
   * The server pushes each row whole (the hall's, and each mat's as its
   * screen shows it), so a score change costs no screen a request.
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
    // A mat screen shows the hall's announcement when the mat has none of its
    // own. The hall's row moves with every score, so the screen asks again
    // only when that announcement changes.
    let hallMessage // not known until the first push
    const hallRow = (row) => {
      if (stopped) return
      if (!mat) return cb(row)
      const message = row?.message || null
      if (hallMessage !== undefined && message !== hallMessage) tick()
      hallMessage = message
    }
    const matRow = ({ mat: which, display } = {}) => { if (!stopped && mat && Number(which) === Number(mat)) cb(display) }
    sock?.on('display:update', hallRow)
    sock?.on('display:mat', matRow)
    tick()
    let last = Date.now()
    const id = setInterval(() => {
      const every = sock?.connected ? DISPLAY_SAFETY_POLL_MS : DISPLAY_POLL_MS
      if (Date.now() - last >= every) { last = Date.now(); tick() }
    }, DISPLAY_POLL_MS)
    return () => { stopped = true; clearInterval(id); sock?.off('display:update', hallRow); sock?.off('display:mat', matRow) }
  },
}
