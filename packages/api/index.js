import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { MatchRoom, serverNow } from './matchRoom.js'
import { socketAuth, setTournamentLookup } from './auth/middleware.js'
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
import { publicRoutes, publicViewCache } from './routes/public.js'
import { matchAuthority } from './auth/matchAccess.js'
import { analyticsRoutes } from './routes/analytics.js'
import { coachRoutes } from './routes/coach.js'
import { fileRoutes } from './routes/files.js'
import { organizationRoutes } from './routes/organizations.js'
import { rulesetRoutes } from './routes/rulesets.js'
import { systemRoutes } from './routes/system.js'
import { partnerRoutes } from './routes/partner.js'
import { idempotency } from './lib/idempotency.js'
import { rateLimit } from './lib/rateLimit.js'
import { isMongoConfigured } from './db/mongo.js'
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

  // PRD v1 §23 observability: a health check that says what it runs on.
  const startedAt = Date.now()
  app.get('/health', (_req, res) => res.json({ ok: true, now: serverNow(), storage: isMongoConfigured() ? 'mongodb' : 'memory', uptimeSec: Math.round((Date.now() - startedAt) / 1000) }))

  // PRD v1 §22 rate limiting for the whole API (logins have their own, tighter one).
  app.use(API_BASE, rateLimit({ windowMs: 60_000, max: Number(process.env.API_RATE_LIMIT) || 1200, code: 'too_many_requests' }))
  // PRD v1 §15/§25: a retried write with the same Idempotency-Key happens once.
  app.use(API_BASE, idempotency())

  // Built per instance and announced over the socket, so a device that is
  // already looking at a list finds out it changed without polling for it.
  // Writes the public page never shows do not throw away its cached view:
  // every live score command saves its state, and the audit log grows with it.
  const PRIVATE_COLLECTIONS = new Set(['auditLog', 'registrationLinks', 'liveStates', 'matchEvents', 'apiKeys', 'display'])
  let publicViews = null
  const emitChange = (collection) => {
    if (!PRIVATE_COLLECTIONS.has(collection)) publicViews?.invalidate()
    io.emit('data:changed', { collection })
    announcePublic(collection)
  }
  const stores = withChangeEvents(createStores(), (collection) => emitChange(collection))
  setTournamentLookup((id) => stores.tournaments.get(id))

  // The PRD's tournament management, on the same stores as everything else.
  const tms = createTms(stores, { onNotify: emailNotifier(stores) })
  publicViews = publicViewCache(tms)

  const categories = categoryRoutes(stores)
  const competitors = competitorRoutes(stores)
  const matches = matchRoutes(stores, tms)

  // System-level events (no tournament) go to the same audit log.
  const systemAudit = (actor, { meta, ...entry }) => tms.record(actor ? { ...actor, meta } : { uid: null, role: null, meta }, { tournamentId: null, ...entry })
  app.use(`${API_BASE}/auth`, authRoutes({ audit: systemAudit }))
  app.use(`${API_BASE}/users`, userRoutes({ audit: systemAudit }))
  app.use(`${API_BASE}/organizations`, organizationRoutes(stores, { audit: systemAudit }))
  app.use(`${API_BASE}/rulesets`, rulesetRoutes(tms))
  app.use(`${API_BASE}/system`, systemRoutes(stores, tms))
  app.use(`${API_BASE}/analytics`, analyticsRoutes(stores, tms))
  app.use(`${API_BASE}/partner`, partnerRoutes(tms, stores))
  app.use(`${API_BASE}/officials`, officialRoutes())
  app.use(`${API_BASE}/tournaments`, tournamentRoutes(stores, tms))
  app.use(`${API_BASE}/tournaments`, tmsRoutes(tms, stores))
  // Public APIs are kept apart from the admin ones (section 56).
  app.use(`${API_BASE}/public`, publicRoutes(tms, { views: publicViews }))
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
      // A screen for one mat re-reads its own document on this.
      publicIo.emit('display:changed', { at: serverNow() })
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

  // AC-14, decided per socket and bout, so a referee cannot pick up a bout in
  // a tournament they do not work or one assigned to someone else.
  const mayControl = async (socket, matchId) => {
    if (!socket.user?.uid) return false
    const match = await stores.matches.get(matchId).catch(() => null)
    if (!match) return false
    return (await matchAuthority(socket.user, match, stores)).ok
  }

  io.on('connection', (socket) => {
    socket.on('time:ping', ({ t0 } = {}, ack) => {
      const t1 = serverNow()
      const reply = { t0, t1, t2: serverNow() }
      if (typeof ack === 'function') ack(reply)
      else socket.emit('time:pong', reply)
    })

    socket.on('match:join', async ({ matchId, control } = {}, ack) => {
      if (!matchId || typeof matchId !== 'string') return ack?.({ error: 'unknown_match' })
      // Only real bouts get a room: a made-up id must not create state, or
      // live-state rows, on the server.
      const match = rooms.has(matchId) ? null : await stores.matches.get(matchId).catch(() => null)
      if (!rooms.has(matchId) && !match) return ack?.({ error: 'unknown_match' })
      const room = roomFor(matchId)
      // A bout interrupted by a restart picks up where it was.
      if (!room.restored) {
        room.restored = true
        const saved = await tms.loadLiveState(matchId).catch(() => null)
        if (saved && room.seq === 0) room.restore(saved)
      }
      socket.join(matchId)
      // Anyone signed in may watch; control goes only to an admin of this
      // tournament or the bout's referee (AC-14).
      if (control && (await mayControl(socket, matchId))) room.claim(socket.id)
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
    socket.on('match:takeover', async ({ matchId } = {}, ack) => {
      const room = rooms.get(matchId)
      if (!room) return ack?.({ error: 'unknown_match' })
      if (!(await mayControl(socket, matchId))) return ack?.({ error: 'forbidden' })

      const previousId = room.controllerId
      room.claim(socket.id, { force: true })
      io.to(matchId).emit('match:control', {
        matchId,
        controllerId: room.controllerId,
        takenFrom: previousId,
      })
      ack?.({ ok: true, controllerId: room.controllerId })
    })

    // Commands that change nothing about the score are allowed on a decided bout.
    const HARMLESS = new Set(['FIELD_NUMBER', 'SCOREBOARD'])

    socket.on('match:cmd', ({ matchId, cmd, payload, clientEventId } = {}, ack) => {
      const room = rooms.get(matchId)
      if (!room) return ack?.({ error: 'unknown_match' })
      // Holding the mat is the authority: it was granted only after the
      // checks in mayControl.
      if (!room.controls(socket.id)) return ack?.({ error: room.controllerId ? 'not_controller' : 'forbidden' })
      room.queue = room.queue.then(async () => {
        // PRD v1 §15 idempotency: a network retry is applied once.
        const already = room.duplicateOf(clientEventId)
        if (already !== undefined) return ack?.({ ok: true, seq: already, duplicate: true })
        // PRD v1 §21 "score sent to completed match: block and audit".
        if (!HARMLESS.has(cmd)) {
          const blocked = await tms.liveCommandBlock(matchId).catch(() => null)
          if (blocked) {
            tms.recordBlockedCommand(socket.user, matchId, cmd, blocked).catch(() => {})
            return ack?.({ error: blocked })
          }
        }
        try {
          const before = room.state
          const event = room.apply(cmd, payload, socket.id)
          if (event) {
            room.remember(clientEventId, event.seq)
            broadcast(matchId, { ...event, matchId, clientEventId })
            // PRD point 33: every live change is logged, corrections audited.
            tms.recordLiveEvent(socket.user, matchId, { seq: event.seq, cmd, payload, before, after: event.state, at: event.at }).catch(() => {})
            tms.saveLiveState(matchId, { seq: room.seq, state: room.state, history: room.history }).catch(() => {})
          }
          ack?.({ ok: true, seq: room.seq })
        } catch (err) {
          ack?.({ error: err.code || 'rejected' })
        }
      }).catch(() => {})
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
