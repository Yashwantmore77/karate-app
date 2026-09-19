// Socket channel: the server is authoritative. The client sends commands and
// renders the snapshots and events that come back — it never invents a
// timestamp or applies a command locally.

import { io } from 'socket.io-client'

const SAMPLES = 5
const RESYNC_MS = 30_000

let socket = null
let clockOffset = 0
const offsetListeners = new Set()

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

export function connect(url = import.meta.env?.VITE_SERVER_URL || 'http://localhost:4000') {
  if (socket) return socket
  socket = io(url, { transports: ['websocket'] })
  socket.on('connect', () => syncTime())
  setInterval(() => { if (socket?.connected) syncTime() }, RESYNC_MS)
  return socket
}

const pingOnce = () =>
  new Promise((resolve) => {
    const t0 = Date.now()
    socket.emit('time:ping', { t0 }, ({ t1, t2 }) => {
      const t3 = Date.now()
      // NTP-style: halve the round trip, discount the server's own handling.
      resolve({
        offset: ((t1 - t0) + (t2 - t3)) / 2,
        delay: (t3 - t0) - (t2 - t1),
      })
    })
  })

export async function syncTime() {
  const samples = []
  for (let i = 0; i < SAMPLES; i += 1) samples.push(await pingOnce())
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
