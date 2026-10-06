// Socket channel: the server is authoritative. The client sends commands and
// renders the snapshots and events that come back — it never invents a
// timestamp or applies a command locally.

import { io } from 'socket.io-client'
import { getToken, serverUrl } from '../session'

const SAMPLES = 5
const RESYNC_MS = 30_000

let socket = null
let publicSock = null
let resync = null
let clockOffset = 0
const offsetListeners = new Set()
const statusListeners = new Set()
let status = 'offline'

export const getConnectionStatus = () => status
export const onConnectionStatus = (cb) => {
  statusListeners.add(cb)
  cb(status)
  return () => statusListeners.delete(cb)
}
const setStatus = (value) => {
  if (value === status) return
  status = value
  statusListeners.forEach((cb) => cb(value))
}

export const getClockOffset = () => clockOffset
export const onClockOffset = (cb) => {
  offsetListeners.add(cb)
  cb(clockOffset)
  return () => offsetListeners.delete(cb)
}

const setOffset = (value) => {
  clockOffset = value
  offsetListeners.forEach((cb) => cb(value))
}

export function connect(url = serverUrl() || 'http://localhost:4000') {
  if (socket) return socket
  // The connection carries its identity from the handshake, so no event
  // handler has to wonder who is on the other end.
  socket = io(url, { transports: ['websocket'], auth: { token: getToken() } })
  socket.on('connect', () => syncTime(socket))
  // A rejected handshake means the token is gone or expired: say so, rather
  // than letting the console sit there sending commands nobody accepts.
  socket.on('connect_error', (err) => {
    if (err?.data?.code === 'unauthorized' || err?.message === 'unauthorized') authFailure?.()
  })
  return socket
}

let authFailure = null
export const onSocketAuthFailure = (fn) => { authFailure = fn }

/**
 * The open, sign-in-free channel (PRD section 57): clock sync for every
 * screen, change notices for public pages, the hall scoreboard. Its health is
 * the connection status the app shows.
 */
export function publicSocket(url = serverUrl()) {
  if (!url) return null
  if (publicSock) return publicSock
  publicSock = io(`${url}/public`, { transports: ['websocket'] })
  publicSock.on('connect', () => { setStatus('online'); syncTime(publicSock) })
  publicSock.on('disconnect', () => setStatus('offline'))
  publicSock.io.on('reconnect_attempt', () => setStatus('reconnecting'))
  if (!resync) resync = setInterval(() => { if (publicSock?.connected) syncTime(publicSock) }, RESYNC_MS)
  return publicSock
}

/** On sign-out: the next sign-in must not reuse the previous person's token. */
export function disconnect() {
  socket?.disconnect()
  socket = null
}

const pingOnce = (sock) =>
  new Promise((resolve) => {
    const t0 = Date.now()
    sock.emit('time:ping', { t0 }, ({ t1, t2 }) => {
      const t3 = Date.now()
      // NTP-style: halve the round trip, discount the server's own handling.
      resolve({
        offset: ((t1 - t0) + (t2 - t3)) / 2,
        delay: (t3 - t0) - (t2 - t1),
      })
    })
  })

export async function syncTime(sock = socket) {
  if (!sock) return null
  const samples = []
  for (let i = 0; i < SAMPLES; i += 1) samples.push(await pingOnce(sock))
  // The least-delayed sample carries the least jitter, so it is the best guess.
  const best = samples.reduce((a, b) => (b.delay < a.delay ? b : a))
  setOffset(Math.round(best.offset))
  return best
}

export function openSocketMatch(matchId, { control = false } = {}) {
  const s = connect()
  let listeners = new Set()
  let state = null
  let seq = 0

  const push = (next) => {
    state = next
    listeners.forEach((cb) => cb(next))
  }

  const onSnapshot = (snap) => {
    if (!snap || snap.matchId !== matchId) return
    seq = snap.seq
    push(snap.state)
  }

  const onEvent = (event) => {
    if (!event || event.matchId !== matchId) return
    // Out-of-order or replayed events cannot move the projection backwards.
    if (event.seq <= seq) return
    seq = event.seq
    push(event.state)
  }

  const join = () => s.emit('match:join', { matchId, control }, onSnapshot)

  s.on('match:event', onEvent)
  s.on('match:snapshot', onSnapshot)
  s.on('connect', join)
  if (s.connected) join()

  return {
    control,
    subscribe(cb) {
      listeners.add(cb)
      if (state) cb(state)
      return () => listeners.delete(cb)
    },
    send(cmd, payload) {
      if (!control) return
      s.emit('match:cmd', { matchId, cmd, payload, clientEventId: `${Date.now()}-${Math.random()}` })
    },
    close() {
      s.off('match:event', onEvent)
      s.off('match:snapshot', onSnapshot)
      s.off('connect', join)
      listeners = new Set()
    },
  }
}
