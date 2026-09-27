import { serverUrl } from '../session'
import * as local from './local'
import * as api from './api'

/**
 * The competition data, from whichever side of the wire is configured.
 *
 * Chosen once at import, the same way the match channel and the session already
 * choose: VITE_SERVER_URL present means the Node API is the source of truth for
 * every device; absent means this browser's own storage, which is what keeps the
 * app usable with no backend running.
 *
 * Both implementations are async, so no call site can come to depend on storage
 * being synchronous and then break when it is a network call.
 */
const impl = serverUrl() ? api : local

export const { tournaments, categories, competitors, matches } = impl

/** True when writes reach a server other devices can see. */
export const isRemote = impl === api
