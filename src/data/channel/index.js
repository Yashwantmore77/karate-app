import { openLocalMatch } from './local'
import { openSocketMatch } from './socket'

// Transport is chosen once, here. Screens never know which one they use.
export const isSocketTransport = () => !!import.meta.env?.VITE_SERVER_URL

export function openMatch(matchId, options) {
  return isSocketTransport()
    ? openSocketMatch(matchId, options)
    : openLocalMatch(matchId, options)
}
