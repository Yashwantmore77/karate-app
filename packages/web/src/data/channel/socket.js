// Socket channel: the server is authoritative. The client sends commands and
// renders the snapshots and events that come back — it never invents a
// timestamp or applies a command locally.

import { io } from 'socket.io-client'
import { getToken } from '../session'

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
  // The connection carries its identity from the handshake, so no event
  // handler has to wonder who is on the other end.
  socket = io(url, { transports: ['websocket'], auth: { token: getToken() } })
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
  let statusListeners = new Set()
  let state = null
  let seq = 0

  // Asking for control is not the same as having it: the server gives a mat to
  // one socket, and everyone else is a spectator whose commands are refused.
  // The screen has to be able to tell the difference, or it shows live-looking
  // buttons that quietly do nothing.
  let controllerId = null
  let lastError = null

  const push = (next) => {
    state = next
    listeners.forEach((cb) => cb(next))
  }

  const statusOf = () => ({
    // Before the first snapshot arrives nothing is known, so the screen is told
    // "not yours" rather than being allowed to assume it is.
    holdsControl: control && !!s.id && controllerId === s.id,
    controllerId,
    contested: control && !!controllerId && controllerId !== s.id,
    lastError,
  })

  const pushStatus = () => {
    const status = statusOf()
    statusListeners.forEach((cb) => cb(status))
  }

  const setError = (code) => {
    lastError = code
    pushStatus()
  }

  const onSnapshot = (snap) => {
    if (!snap || snap.matchId !== matchId) return
    seq = snap.seq
    controllerId = snap.controllerId ?? null
    push(snap.state)
    pushStatus()
  }

  const onEvent = (event) => {
    if (!event || event.matchId !== matchId) return
    // Out-of-order or replayed events cannot move the projection backwards.
    if (event.seq <= seq) return
    seq = event.seq
    push(event.state)
  }

  // The mat changing hands is its own event: whoever just lost it needs to know
  // before they reach for a button.
  const onControl = (msg) => {
    if (!msg || msg.matchId !== matchId) return
    controllerId = msg.controllerId ?? null
    if (msg.takenFrom && msg.takenFrom === s.id) lastError = 'taken_over'
    else if (controllerId === s.id) lastError = null
    pushStatus()
  }

  const join = () => s.emit('match:join', { matchId, control }, onSnapshot)

  s.on('match:event', onEvent)
  s.on('match:snapshot', onSnapshot)
  s.on('match:control', onControl)
  s.on('connect', join)
  if (s.connected) join()

  return {
    control,
    subscribe(cb) {
      listeners.add(cb)
      if (state) cb(state)
      return () => listeners.delete(cb)
    },
    subscribeStatus(cb) {
      statusListeners.add(cb)
      cb(statusOf())
      return () => statusListeners.delete(cb)
    },
    send(cmd, payload) {
      if (!control) return
      // The ack is the only place the server can say no. Emitting without one
      // threw away every refusal, which is what made a mat someone else held
      // look like a broken console.
      s.emit(
        'match:cmd',
        { matchId, cmd, payload, clientEventId: `${Date.now()}-${Math.random()}` },
        (reply) => {
          if (reply?.error) setError(reply.error)
          else if (lastError) setError(null)
        }
      )
    },
    takeover() {
      return new Promise((resolve) => {
        s.emit('match:takeover', { matchId }, (reply) => {
          if (reply?.error) setError(reply.error)
          else {
            controllerId = reply?.controllerId ?? controllerId
            lastError = null
            pushStatus()
          }
          resolve(reply)
        })
      })
    },
    close() {
      s.off('match:event', onEvent)
      s.off('match:snapshot', onSnapshot)
      s.off('match:control', onControl)
      s.off('connect', join)
      listeners = new Set()
      statusListeners = new Set()
    },
  }
}
