import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { MatchRoom, serverNow } from './matchRoom.js'
import { socketAuth, canControlMat } from './auth/middleware.js'
import { createStores } from './lib/store.js'
import { withChangeEvents } from './lib/changes.js'
import { security } from './middleware/security.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { officialRoutes } from './routes/officials.js'
import { tournamentRoutes } from './routes/tournaments.js'
import { categoryRoutes } from './routes/categories.js'
import { competitorRoutes } from './routes/competitors.js'
import { matchRoutes } from './routes/matches.js'
import { displayRoutes } from './routes/display.js'
import { tmsRoutes } from './routes/tms.js'
import { publicRoutes } from './routes/public.js'
import { coachRoutes } from './routes/coach.js'
import { fileRoutes } from './routes/files.js'
import { emailNotifier } from './lib/emailNotifier.js'
import { createTms } from '@kumite/shared/tms.js'

const EXPIRY_SWEEP_MS = 250

// Everything the browser calls is versioned, so a breaking change can ship
// alongside the version it breaks instead of replacing it. /health is left
// outside it: a probe wants a fixed address that outlives any version.
export const API_BASE = '/api/v1'

export function createApp() {
  const app = express()

  // Express advertises itself by default. Nothing good comes of telling callers
  // what the server is built on.
  app.disable('x-powered-by')

  // Behind a proxy (Vercel, nginx) the socket address is the proxy's, and the
  // real caller is in X-Forwarded-For. Opt-in rather than always on: that
  // header is client-supplied, so believing it with nothing in front lets a
  // caller pick their own address, faking the login log and resetting the
  // login rate limiter at will. Set TRUST_PROXY only where a proxy exists.
  const trustProxy = process.env.TRUST_PROXY
  if (trustProxy) {
    app.set('trust proxy', /^[0-9]+$/.test(trustProxy) ? Number(trustProxy) : trustProxy)
  }
  // Bounded before anything parses it: an unbounded body is a denial of service
  // that needs no credentials.
  // A bulk player upload is the one body that is legitimately large.
  app.use(/\/players\/bulk/, express.json({ limit: '2mb' }))
  // An upload is a 2 MB file as base64, about 2.7 MB of JSON.
  app.use(/\/files$/, express.json({ limit: '4mb' }))
  app.use(express.json({ limit: '32kb' }))
  app.use(security({ allowedOrigin: process.env.CORS_ORIGIN || '*' }))

  app.get('/health', (_req, res) => res.json({ ok: true, now: serverNow() }))

  // Built per instance and announced over the socket, so a device that is
  // already looking at a list finds out it changed without polling for it.
  const emitChange = (collection) => {
    io.emit('data:changed', { collection })
    announcePublic(collection)
  }
  const stores = withChangeEvents(createStores(), (collection) => emitChange(collection))

  // The PRD's tournament management, on the same stores as everything else.
  const tms = createTms(stores, { onNotify: emailNotifier(stores) })

  const categories = categoryRoutes(stores)
  const competitors = competitorRoutes(stores)
  const matches = matchRoutes(stores, tms)

  app.use(`${API_BASE}/auth`, authRoutes())
  app.use(`${API_BASE}/users`, userRoutes())
  app.use(`${API_BASE}/officials`, officialRoutes())
  app.use(`${API_BASE}/tournaments`, tournamentRoutes(stores, tms))
  app.use(`${API_BASE}/tournaments`, tmsRoutes(tms, stores))
  // Public APIs are kept apart from the admin ones (section 56).
  app.use(`${API_BASE}/public`, publicRoutes(tms))
  app.use(`${API_BASE}/coach`, coachRoutes(tms))
  app.use(`${API_BASE}/files`, fileRoutes(tms))
  app.use(`${API_BASE}/categories`, categories.flat)
  app.use(`${API_BASE}/competitors`, competitors.flat)
  app.use(`${API_BASE}/matches`, matches.flat)
  app.use(`${API_BASE}/display`, displayRoutes(stores))

  // The nested readers hang off their parent: /tournaments/:id/categories,
  // /categories/:id/competitors, /categories/:id/matches.
  app.use(`${API_BASE}/tournaments`, categories.nested)
  app.use(`${API_BASE}/categories`, competitors.nested)
  app.use(`${API_BASE}/categories`, matches.nested)

  app.use(notFoundHandler)
  app.use(errorHandler())

  const http = createServer(app)
  const io = new Server(http, { cors: { origin: true } })
  io.use(socketAuth)

  // PRD section 57: public pages and hall screens have no session, so they get
  // their own namespace. It carries no data, only "something changed" (the
  // page re-reads the public API, which applies Rule 8) and the scoreboard row
  // the hall is already showing.
  const publicIo = io.of('/public')
  const timePong = (_payload, ack) => {
    const t1 = serverNow()
    if (typeof ack === 'function') ack({ t1, t2: serverNow() })
  }
  publicIo.on('connection', (socket) => {
    socket.on('time:ping', timePong)
  })

  // Coalesced: a draw writes hundreds of rows, and every viewer re-reading the
  // page for each one would be a self-inflicted flood.
  const PUBLIC_DEBOUNCE_MS = 400
  let pendingPublic = null
  function announcePublic(collection) {
    if (collection === 'display') {
      stores.display.get('live').then((row) => publicIo.emit('display:update', row ?? null)).catch(() => {})
      return
    }
    if (['auditLog', 'registrationLinks'].includes(collection)) return
    if (pendingPublic) return
    pendingPublic = setTimeout(() => {
      pendingPublic = null
      publicIo.emit('public:changed', { at: serverNow() })
    }, PUBLIC_DEBOUNCE_MS)
  }

  const rooms = new Map()
  const roomFor = (matchId) => {
    if (!rooms.has(matchId)) rooms.set(matchId, new MatchRoom(matchId))
    return rooms.get(matchId)
  }

  const broadcast = (matchId, event) => io.to(matchId).emit('match:event', event)

  io.on('connection', (socket) => {
    socket.on('time:ping', ({ t0 } = {}, ack) => {
      const t1 = serverNow()
      const reply = { t0, t1, t2: serverNow() }
      if (typeof ack === 'function') ack(reply)
      else socket.emit('time:pong', reply)
    })

    socket.on('match:join', ({ matchId, control } = {}, ack) => {
      if (!matchId) return
      const room = roomFor(matchId)
      socket.join(matchId)
      // A judge may ask for control; only a referee or admin is given it.
      if (control && canControlMat(socket.user)) room.claim(socket.id)
      const snapshot = room.snapshot()
      if (typeof ack === 'function') ack(snapshot)
      else socket.emit('match:snapshot', snapshot)
      io.to(matchId).emit('match:control', { matchId, controllerId: room.controllerId })
    })

    /**
     * Seizes a mat someone else holds.
     *
     * Deliberate and explicit, because control is otherwise only released on
     * disconnect: a tab that died without the server noticing keeps a mat
     * forever, and every referee after it presses dead buttons. The loser is
     * told, so a mat never changes hands silently mid-bout.
     */
    socket.on('match:takeover', ({ matchId } = {}, ack) => {
      const room = rooms.get(matchId)
      if (!room) return ack?.({ error: 'unknown_match' })
      if (!canControlMat(socket.user)) return ack?.({ error: 'forbidden' })

      const previousId = room.controllerId
      room.claim(socket.id, { force: true })
      io.to(matchId).emit('match:control', {
        matchId,
        controllerId: room.controllerId,
        takenFrom: previousId,
      })
      ack?.({ ok: true, controllerId: room.controllerId })
    })

    socket.on('match:cmd', ({ matchId, cmd, payload, clientEventId } = {}, ack) => {
      const room = rooms.get(matchId)
      if (!room) return ack?.({ error: 'unknown_match' })
      if (!canControlMat(socket.user)) return ack?.({ error: 'forbidden' })
      try {
        const event = room.apply(cmd, payload, socket.id)
        if (event) broadcast(matchId, { ...event, matchId, clientEventId })
        ack?.({ ok: true, seq: room.seq })
      } catch (err) {
        ack?.({ error: err.code || 'rejected' })
      }
    })

    socket.on('disconnect', () => {
      rooms.forEach((room, matchId) => {
        if (room.controls(socket.id)) {
          room.release(socket.id)
          io.to(matchId).emit('match:control', { matchId, controllerId: null })
        }
      })
    })
  })

  const sweep = setInterval(() => {
    rooms.forEach((room, matchId) => {
      const event = room.sweepExpiry()
      if (event) broadcast(matchId, { ...event, matchId })
    })
  }, EXPIRY_SWEEP_MS)

  http.on('close', () => {
    clearInterval(sweep)
    if (pendingPublic) clearTimeout(pendingPublic)
  })

  return { app, http, io, rooms, stores, tms }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { http } = createApp()
  const port = process.env.PORT || 4000
  http.listen(port, () => console.log(`kumite server on :${port}`))
}
