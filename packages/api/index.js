import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { MatchRoom, serverNow } from './matchRoom.js'
import { authenticate } from './auth/users.js'
import { signToken } from './auth/jwt.js'
import { requireAuth, requireRole, socketAuth, canControlMat } from './auth/middleware.js'

const EXPIRY_SWEEP_MS = 250
const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 10

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '32kb' }))

  // The client is served from a different origin in development, and from a
  // venue machine in practice. No cookies are used — the token travels in a
  // header — so credentials are deliberately not allowed.
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/health', (_req, res) => res.json({ ok: true, now: serverNow() }))

  // Coarse per-address throttle so the login route cannot be brute forced by
  // simply retrying quickly.
  const attempts = new Map()
  const tooManyAttempts = (key) => {
    const now = Date.now()
    const record = attempts.get(key)
    if (!record || now - record.start > LOGIN_WINDOW_MS) {
      attempts.set(key, { start: now, count: 1 })
      return false
    }
    record.count += 1
    return record.count > LOGIN_MAX_ATTEMPTS
  }

  app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body || {}
    if (tooManyAttempts(req.ip || 'unknown')) {
      return res.status(429).json({ error: 'too_many_attempts' })
    }
    const user = await authenticate(email, password)
    // One undifferentiated failure: never say which half was wrong.
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })
    res.json({ token: signToken(user), user })
  })

  app.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }))

  // Present so the guard is exercised; BE-5 fills this surface in.
  app.get('/admin/ping', requireAuth, requireRole('admin'), (_req, res) => res.json({ ok: true }))

  const http = createServer(app)
  const io = new Server(http, { cors: { origin: true } })
  io.use(socketAuth)

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

  http.on('close', () => clearInterval(sweep))

  return { app, http, io, rooms }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { http } = createApp()
  const port = process.env.PORT || 4000
  http.listen(port, () => console.log(`kumite server on :${port}`))
}
