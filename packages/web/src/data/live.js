import { publicSocket } from './channel/socket'

const SAFETY_POLL_MS = 30_000
// Every screen in the hall hears a notice at the same instant: a random wait
// of up to this long spreads their reloads instead of sending them together.
const SPREAD_MS = 1000
// However often notices come, a screen reloads at most this often.
const MIN_GAP_MS = 3000

/**
 * Calls `onChange` whenever public tournament data may have changed
 * (PRD section 57): pushed over the public channel, with a slow poll behind
 * it in case a notice is missed while reconnecting. Notices close together
 * are one reload.
 */
export function watchPublicChanges(onChange, { spreadMs = SPREAD_MS, minGapMs = MIN_GAP_MS } = {}) {
  const sock = publicSocket()
  let timer = null
  let last = 0
  const run = () => {
    timer = null
    last = Date.now()
    onChange()
  }
  const soon = () => {
    if (timer) return
    timer = setTimeout(run, Math.max(0, last + minGapMs - Date.now()) + Math.random() * spreadMs)
  }
  sock?.on('public:changed', soon)
  sock?.on('connect', soon) // catch up after a reconnect
  const id = setInterval(soon, SAFETY_POLL_MS)
  return () => {
    sock?.off('public:changed', soon)
    sock?.off('connect', soon)
    clearInterval(id)
    clearTimeout(timer)
  }
}
