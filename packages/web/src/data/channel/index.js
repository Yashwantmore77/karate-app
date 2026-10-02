import { openSocketMatch } from './socket'

/** Opens the live channel for one match, over the server's socket. */
export function openMatch(matchId, options) {
  return openSocketMatch(matchId, options)
}
