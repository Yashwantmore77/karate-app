import { serverUrl } from './session'
import { publicSocket } from './channel/socket'

const LOCAL_POLL_MS = 5_000
const SAFETY_POLL_MS = 30_000

/**
 * Calls `onChange` whenever public tournament data may have changed
 * (PRD section 57). With a server it is pushed over the public channel, with
 * a slow poll behind it in case a notice is missed; offline it follows other
 * tabs' writes and polls this one's.
 */
export function watchPublicChanges(onChange) {
  const sock = publicSocket()
  if (sock) {
    sock.on('public:changed', onChange)
    sock.on('connect', onChange) // catch up after a reconnect
    const id = setInterval(onChange, SAFETY_POLL_MS)
    return () => { sock.off('public:changed', onChange); sock.off('connect', onChange); clearInterval(id) }
  }
  const onStorage = (e) => { if (!e.key || e.key.startsWith('kt:') || e.key.startsWith('matches-')) onChange() }
  window.addEventListener('storage', onStorage)
  const id = setInterval(onChange, LOCAL_POLL_MS)
  return () => { window.removeEventListener('storage', onStorage); clearInterval(id) }
}

export const hasServer = () => !!serverUrl()
