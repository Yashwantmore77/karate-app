// Socket channel: the server is authoritative. The client sends commands and
// renders the snapshots and events that come back — it never invents a
// timestamp or applies a command locally.

import { io } from 'socket.io-client'
import { getToken, serverUrl } from '../session'
import { offlineMatch } from './offline'

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

// The device saying it lost the network: drop the socket at once rather than
// waiting for a missed heartbeat, so offline scoring starts immediately.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { if (socket?.connected) socket.io.engine?.close() })
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
  let statusListeners = new Set()
  let state = null
  let seq = 0

  // Asking for control is not the same as having it: the server gives a mat to
  // one socket, and everyone else is a spectator whose commands are refused.
  // The screen has to be able to tell the difference, or it shows live-looking
  // buttons that quietly do nothing.
  let controllerId = null
  let lastError = null
  // Offline scoring: this device's socket id while it held the mat, the
  // server's hand-over count, and the last state the server sent.
  const offline = control ? offlineMatch(matchId) : null
  let myId = null
  let handoffs = 0
  let serverState = null
  let replaying = false
  let conflict = null // { reason: 'taken' | 'changed' }
  let replayErrors = 0

  const push = (next) => {
    state = next
    listeners.forEach((cb) => cb(next))
  }

  const offlineActive = () => !!offline?.record
  const statusOf = () => ({
    // Before the first snapshot arrives nothing is known, so the screen is told
    // "not yours" rather than being allowed to assume it is. Scoring offline,
    // the mat stays this device's until it reconnects (or a conflict is found).
    holdsControl: (control && !!s.id && controllerId === s.id && !conflict) || (offlineActive() && !s.connected && !conflict),
    controllerId,
    contested: control && !!controllerId && controllerId !== s.id && !offlineActive(),
    lastError,
    offline: offlineActive() && !replaying,
    syncing: replaying,
    pending: offline?.pending || 0,
    conflict,
    replayErrors,
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
    handoffs = snap.handoffs ?? 0
    serverState = snap.state
    if (controllerId && controllerId === s.id) myId = s.id
    if (offlineActive()) return reconcile()
    push(snap.state)
    pushStatus()
  }

  // Back online with actions scored offline: replay them if nobody else took
  // the mat meanwhile; otherwise the referee decides (resolve()).
  const reconcile = () => {
    const rec = offline.record
    if (controllerId !== s.id) conflict = { reason: 'taken' }
    else if (handoffs !== rec.handoffs) conflict = { reason: 'changed' }
    else conflict = null
    push(rec.state)
    pushStatus()
    if (!conflict) replay()
  }

  const emitAck = (payload) => new Promise((resolve) => s.timeout(8000).emit('match:cmd', payload, (err, reply) => resolve(err ? { error: 'timeout' } : reply)))

  const replay = async () => {
    if (replaying) return
    replaying = true
    replayErrors = 0
    pushStatus()
    while (offline.record?.actions.length && s.connected) {
      const [action] = offline.record.actions
      const reply = await emitAck({ matchId, cmd: action.cmd, payload: action.payload, clientEventId: action.clientEventId, offlineAt: action.at })
      if (reply?.error === 'timeout') break
      if (reply?.error === 'not_controller' || reply?.error === 'forbidden') { conflict = { reason: 'taken' }; break }
      // Refused on its merits (say, the bout was decided meanwhile): counted, not retried.
      if (reply?.error) replayErrors += 1
      offline.dropFirst()
      pushStatus()
    }
    if (offline.record && !offline.record.actions.length) offline.clear()
    replaying = false
    if (!offlineActive() && serverState) push(state ?? serverState)
    pushStatus()
  }

  // Keeps the device's clock honest while offline: time running out is noted.
  const expiryTimer = control ? setInterval(() => {
    if (!offlineActive() || s.connected) return
    const next = offline.expire(Date.now() + getClockOffset())
    if (next) push(next)
  }, 500) : null

  const onDisconnect = () => {
    // Only a device that held the mat scores on offline.
    if (control && myId && controllerId === myId && state) {
      offline.begin({ seq, handoffs, state })
      pushStatus()
    }
  }

  const onEvent = (event) => {
    if (!event || event.matchId !== matchId) return
    // Out-of-order or replayed events cannot move the projection backwards.
    if (event.seq <= seq) return
    seq = event.seq
    serverState = event.state
    // While offline actions wait to be resolved, the screen keeps showing them.
    if (offlineActive() && !replaying) return
    push(event.state)
  }

  // The mat changing hands is its own event: whoever just lost it needs to know
  // before they reach for a button.
  const onControl = (msg) => {
    if (!msg || msg.matchId !== matchId) return
    controllerId = msg.controllerId ?? null
    if (msg.takenFrom && msg.takenFrom === s.id) lastError = 'taken_over'
    else if (controllerId === s.id) { lastError = null; myId = s.id }
    pushStatus()
  }

  const join = () => s.emit('match:join', { matchId, control }, onSnapshot)

  s.on('match:event', onEvent)
  s.on('match:snapshot', onSnapshot)
  s.on('match:control', onControl)
  s.on('connect', join)
  s.on('disconnect', onDisconnect)
  if (s.connected) join()
  // A reload while offline picks the device's own record back up.
  if (offlineActive()) push(offline.record.state)

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
      // Offline (or still syncing): score on the device and keep the action.
      if (offlineActive() && (!s.connected || replaying)) {
        if (conflict) return setError('offline_conflict')
        const next = offline.apply(cmd, payload, Date.now() + getClockOffset())
        if (next) push(next)
        pushStatus()
        if (s.connected && !replaying) replay()
        return
      }
      if (offlineActive() && conflict) return setError('offline_conflict')
      // The ack is the only place the server can say no. Emitting without one
      // threw away every refusal, which is what made a mat someone else held
      // look like a broken console.
      const clientEventId = `${Date.now()}-${Math.random()}`
      const at = Date.now() + getClockOffset()
      s.timeout(5000).emit(
        'match:cmd',
        { matchId, cmd, payload, clientEventId },
        (err, reply) => {
          // No answer: the connection died under us. The action moves into
          // the offline record under the same id (counted once if the server
          // did get it), and the connection is restarted to resync.
          if (err) {
            if (control && myId && controllerId === myId && state) {
              offline.begin({ seq, handoffs, state })
              const next = offline.apply(cmd, payload, at, clientEventId)
              if (next) push(next)
              pushStatus()
              s.disconnect().connect()
            }
            return
          }
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
    /**
     * Settles offline actions the server could not take on its own:
     * 'apply' takes the mat back and replays them; 'discard' drops them and
     * shows the bout as the server has it.
     */
    async resolve(choice) {
      if (!offlineActive()) return
      if (choice === 'discard') {
        offline.clear()
        conflict = null
        if (serverState) push(serverState)
        pushStatus()
        return
      }
      const reply = await new Promise((r) => s.emit('match:takeover', { matchId }, r))
      if (reply?.error) return setError(reply.error)
      controllerId = reply?.controllerId ?? controllerId
      myId = s.id
      conflict = null
      pushStatus()
      replay()
    },
    close() {
      if (expiryTimer) clearInterval(expiryTimer)
      s.off('disconnect', onDisconnect)
      s.off('match:event', onEvent)
      s.off('match:snapshot', onSnapshot)
      s.off('match:control', onControl)
      s.off('connect', join)
      listeners = new Set()
      statusListeners = new Set()
    },
  }
}
