import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { MatchRoom, serverNow } from './matchRoom.js'

const EXPIRY_SWEEP_MS = 250

export function createApp() {
  const app = express()
  app.get('/health', (_req, res) => res.json({ ok: true, now: serverNow() }))

  const http = createServer(app)
  const io = new Server(http, { cors: { origin: true } })

  const rooms = new Map()
  const roomFor = (matchId) => {
    if (!rooms.has(matchId)) rooms.set(matchId, new MatchRoom(matchId))
    return rooms.get(matchId)
  }

  const broadcast = (matchId, event) => io.to(matchId).emit('match:event', event)

  io.on('connection', (socket) => {
    // Time sync. t1/t2 bracket the server's handling so the client can subtract
    // its own round trip and derive an offset rather than trusting its clock.
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
      if (control) room.claim(socket.id)
      const snapshot = room.snapshot()
      if (typeof ack === 'function') ack(snapshot)
      else socket.emit('match:snapshot', snapshot)
      io.to(matchId).emit('match:control', { matchId, controllerId: room.controllerId })
    })

    socket.on('match:cmd', ({ matchId, cmd, payload, clientEventId } = {}, ack) => {
      const room = rooms.get(matchId)
      if (!room) return ack?.({ error: 'unknown_match' })
      try {
        const event = room.apply(cmd, payload, socket.id)
        if (event) broadcast(matchId, { ...event, matchId, clientEventId })
        ack?.({ ok: true, seq: room.seq })
      } catch (err) {
        ack?.({ error: err.code || 'rejected' })
      }
    })

    socket.on('disconnect', () => {
      // Control frees itself the moment a device drops, so a dead phone never
      // strands a mat.
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

// Started directly (not imported by a test)
if (process.argv[1] && process.argv[1].endsWith('server/index.js')) {
  const { http } = createApp()
  const port = process.env.PORT || 4000
  http.listen(port, () => console.log(`kumite server on :${port}`))
}
