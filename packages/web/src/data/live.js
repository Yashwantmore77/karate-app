import { publicSocket } from './channel/socket'

const SAFETY_POLL_MS = 30_000

/**
 * Calls `onChange` whenever public tournament data may have changed
 * (PRD section 57): pushed over the public channel, with a slow poll behind
 * it in case a notice is missed while reconnecting.
 */
export function watchPublicChanges(onChange) {
  const sock = publicSocket()
  sock?.on('public:changed', onChange)
  sock?.on('connect', onChange) // catch up after a reconnect
  const id = setInterval(onChange, SAFETY_POLL_MS)
  return () => { sock?.off('public:changed', onChange); sock?.off('connect', onChange); clearInterval(id) }
}
