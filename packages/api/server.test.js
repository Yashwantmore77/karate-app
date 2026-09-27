import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { io as connect } from 'socket.io-client'
import { createApp } from './index.js'
import { remainingNow } from '@kumite/shared/clock.js'
import { formatClock } from '@kumite/shared/format.js'

let http, port, clients, refereeToken, judgeToken

const listen = () =>
  new Promise((resolve) => {
    const app = createApp()
    http = app.http
    http.listen(0, () => resolve(http.address().port))
  })

const login = (email, password = 'test123') =>
  fetch(`http://localhost:${port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

const tokenFor = async (email) => (await (await login(email)).json()).token

const client = (token = refereeToken) => {
  const socket = connect(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token },
  })
  clients.push(socket)
  return socket
}

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

const nextEvent = (socket, event) =>
  new Promise((resolve) => socket.once(event, resolve))

describe('BE-1 match server', () => {
  beforeEach(async () => {
    clients = []
    port = await listen()
    refereeToken = await tokenFor('referee@kata.local')
    judgeToken = await tokenFor('judge1@kata.local')
  })

  afterEach(async () => {
    clients.forEach((c) => c.disconnect())
    await new Promise((resolve) => http.close(resolve))
  })

  it('answers a time handshake with timestamps that bracket its own handling', async () => {
    const socket = client()
    const t0 = Date.now()
    const { t1, t2 } = await emit(socket, 'time:ping', { t0 })
    expect(t1).toBeGreaterThanOrEqual(t0 - 1000)
    expect(t2).toBeGreaterThanOrEqual(t1)
  })

  it('hands a joining device the current snapshot', async () => {
    const socket = client()
    const snap = await emit(socket, 'match:join', { matchId: 'm1' })
    expect(snap.seq).toBe(0)
    expect(snap.state.clock).toEqual({ running: false, remainingMs: 90_000, startedAt: null })
  })

  it('gives control to the first referee and refuses commands from the rest', async () => {
    const referee = client()
    const second = client(refereeToken)
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    const snap = await emit(second, 'match:join', { matchId: 'm1', control: true })

    expect(snap.controllerId).not.toBe(second.id)
    const rejected = await emit(second, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    expect(rejected.error).toBe('not_controller')

    const accepted = await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    expect(accepted.ok).toBe(true)
  })

  it('stamps the clock anchor with SERVER time, not the client\'s', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    const before = Date.now()
    const broadcast = nextEvent(referee, 'match:event')
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    const event = await broadcast

    expect(event.state.clock.running).toBe(true)
    expect(event.state.clock.startedAt).toBeGreaterThanOrEqual(before)
    expect(event.state.clock.startedAt).toBeLessThanOrEqual(Date.now())
  })

  it('keeps a referee and three judges on one clock', async () => {
    const referee = client()
    const judges = [client(judgeToken), client(judgeToken), client(judgeToken)]

    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await Promise.all(judges.map((j) => emit(j, 'match:join', { matchId: 'm1' })))

    const heard = judges.map((j) => nextEvent(j, 'match:event'))
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    const events = await Promise.all(heard)

    // every judge got the identical anchor
    const anchors = events.map((e) => JSON.stringify(e.state.clock))
    expect(new Set(anchors).size).toBe(1)

    // and therefore renders the identical time, whenever each one renders
    const at = Date.now() + 3_000
    const shown = events.map((e) => formatClock(remainingNow(e.state.clock, at)))
    expect(new Set(shown).size).toBe(1)
    expect(shown[0]).toBe('1:27')
  })

  it('gives a late joiner the running clock, not a fresh one', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    await new Promise((r) => setTimeout(r, 1_100))

    const late = client()
    const snap = await emit(late, 'match:join', { matchId: 'm1' })
    expect(snap.state.clock.running).toBe(true)
    expect(remainingNow(snap.state.clock, Date.now())).toBeLessThan(90_000)
  })

  it('banks elapsed time on stop', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    await new Promise((r) => setTimeout(r, 1_100))
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_STOP' })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.clock.running).toBe(false)
    expect(snap.state.clock.remainingMs).toBeLessThan(90_000)
    expect(snap.state.clock.remainingMs).toBeGreaterThan(88_000)
  })

  it('applies a duration change and an adjustment', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_SET', payload: { durationMs: 60_000 } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_ADJUST', payload: { deltaMs: 5_000 } })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.clock.remainingMs).toBe(65_000)
  })

  it('stops the match clock when the KO timer starts', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'KO_TIMER' })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.koActive).toBe(true)
    expect(snap.state.clock.running).toBe(false)
  })

  it('frees the mat when the controlling device drops', async () => {
    const referee = client()
    const spare = client(refereeToken)
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(spare, 'match:join', { matchId: 'm1' })

    const released = nextEvent(spare, 'match:control')
    referee.disconnect()
    expect((await released).controllerId).toBeNull()

    const claimed = await emit(spare, 'match:join', { matchId: 'm1', control: true })
    expect(claimed.controllerId).toBe(spare.id)
  })

  it('ends the bout itself on an eight point gap', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    for (let i = 0; i < 3; i += 1) {
      await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'aka', type: 'ippon' } })
    }
    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toEqual({ ended: true, winner: 'aka', method: 'gapRule' })
  })

  it('ends the bout on hansoku, against the score', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'ippon' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'PENALTY', payload: { side: 'ao', category: 'c1', level: 4 } })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toEqual({ ended: true, winner: 'aka', method: 'hansoku' })
  })

  it('decides on senshu when time runs out level', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'aka', type: 'yuko' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'yuko' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_SET', payload: { durationMs: 300 } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
    await nextEvent(referee, 'match:event') // expiry sweep

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toEqual({ ended: true, winner: 'aka', method: 'senshu' })
  })

  it('leaves a close bout undecided while it is still running', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'yuko' } })
    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toBeNull()
  })

  it('undoes the last change, not one point', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'ippon' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'UNDO' })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    // a mis-tapped ippon goes back to zero, where -1 would have left 2
    expect(snap.state.match.scores.ao).toBe(0)
    expect(snap.state.match.senshu).toBeNull()
  })

  it('undoes repeatedly and then stops, without going negative', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'yuko' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'aka', type: 'wazaAri' } })
    for (let i = 0; i < 5; i += 1) {
      await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'UNDO' })
    }
    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.match.scores).toEqual({ ao: 0, aka: 0 })
  })

  it('lets the referee declare kiken, overriding the score', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'ippon' } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'KIKEN', payload: { side: 'ao' } })

    const snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toEqual({ ended: true, winner: 'aka', method: 'kiken' })
  })

  it('lets the referee name a winner by hantei and then clear it', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'HANTEI', payload: { side: 'ao' } })
    let snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toEqual({ ended: true, winner: 'ao', method: 'hantei' })

    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLEAR_DECISION' })
    snap = await emit(client(), 'match:join', { matchId: 'm1' })
    expect(snap.state.outcome).toBeNull()
  })

  it('rejects an unknown command', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    const res = await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'NONSENSE' })
    expect(res.error).toBe('unknown_command')
  })

  it('stops an expired clock itself so clients agree on the stopped anchor', async () => {
    const referee = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_SET', payload: { durationMs: 400 } })
    await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })

    const expiry = await nextEvent(referee, 'match:event')
    expect(expiry.cmd).toBe('CLOCK_EXPIRED')
    expect(expiry.state.clock.running).toBe(false)
    expect(expiry.state.clock.remainingMs).toBe(0)
  })
})

describe('BE-4 auth', () => {
  beforeEach(async () => {
    clients = []
    port = await listen()
    refereeToken = await tokenFor('referee@kata.local')
    judgeToken = await tokenFor('judge1@kata.local')
  })

  afterEach(async () => {
    clients.forEach((c) => c.disconnect())
    await new Promise((resolve) => http.close(resolve))
  })

  describe('login', () => {
    it('issues a token carrying the role, and never the password hash', async () => {
      const res = await login('judge2@kata.local')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.token).toBeTruthy()
      expect(body.user).toMatchObject({ role: 'judge', seat: 2 })
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|test123/)
    })

    it('rejects a wrong password', async () => {
      const res = await login('referee@kata.local', 'wrong')
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('invalid_credentials')
    })

    it('gives the same answer for an unknown address, revealing nothing', async () => {
      const unknown = await login('nobody@kata.local')
      const wrong = await login('referee@kata.local', 'wrong')
      expect(unknown.status).toBe(401)
      expect(await unknown.json()).toEqual(await wrong.json())
    })

    it('throttles repeated attempts from one address', async () => {
      let last
      for (let i = 0; i < 12; i += 1) last = await login('referee@kata.local', 'wrong')
      expect(last.status).toBe(429)
    })
  })

  describe('http guards', () => {
    const get = (path, token) =>
      fetch(`http://localhost:${port}${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })

    it('refuses a protected route with no token', async () => {
      expect((await get('/api/v1/auth/me')).status).toBe(401)
    })

    it('refuses a forged or malformed token', async () => {
      expect((await get('/api/v1/auth/me', 'not.a.token')).status).toBe(401)
      expect((await get('/api/v1/auth/me', `${refereeToken}tampered`)).status).toBe(401)
    })

    it('accepts a valid token and reports the caller', async () => {
      const res = await get('/api/v1/auth/me', refereeToken)
      expect(res.status).toBe(200)
      expect((await res.json()).user).toMatchObject({ role: 'referee' })
    })

    it('keeps a judge out of an admin route but lets an admin through', async () => {
      expect((await get('/api/v1/users', judgeToken)).status).toBe(403)
      const adminToken = await tokenFor('admin@kata.local')
      expect((await get('/api/v1/users', adminToken)).status).toBe(200)
    })
  })

  describe('admin user management', () => {
    let adminToken
    const url = (path) => `http://localhost:${port}${path}`
    const authed = (token, extra = {}) => ({
      ...extra,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extra.headers },
    })
    const post = (path, body, token = adminToken) =>
      fetch(url(path), authed(token, { method: 'POST', body: JSON.stringify(body) }))
    const patch = (path, body, token = adminToken) =>
      fetch(url(path), authed(token, { method: 'PATCH', body: JSON.stringify(body) }))
    const del = (path, token = adminToken) =>
      fetch(url(path), authed(token, { method: 'DELETE' }))
    const get = (path, token = adminToken) => fetch(url(path), authed(token))

    beforeEach(async () => {
      adminToken = await tokenFor('admin@kata.local')
    })

    it('lists the seeded roster without password hashes', async () => {
      const res = await get('/api/v1/users')
      expect(res.status).toBe(200)
      const { users } = await res.json()
      expect(users.length).toBeGreaterThanOrEqual(6)
      expect(JSON.stringify(users)).not.toMatch(/passwordHash/)
    })

    it('creates a new referee and immediately allows them to log in', async () => {
      const res = await post('/api/v1/users', {
        email: 'referee2@kata.local', password: 'freshpass1', role: 'referee',
      })
      expect(res.status).toBe(201)
      const { user } = await res.json()
      expect(user).toMatchObject({ email: 'referee2@kata.local', role: 'referee' })
      expect(user.passwordHash).toBeUndefined()

      const loginRes = await login('referee2@kata.local', 'freshpass1')
      expect(loginRes.status).toBe(200)
    })

    it('rejects a duplicate email', async () => {
      const res = await post('/api/v1/users', {
        email: 'referee@kata.local', password: 'whatever1', role: 'referee',
      })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('email_taken')
    })

    it('rejects an unknown role', async () => {
      const res = await post('/api/v1/users', {
        email: 'nobody-new@kata.local', password: 'whatever1', role: 'coach',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_role')
    })

    it('rejects a non-integer seat', async () => {
      const res = await post('/api/v1/users', {
        email: 'judge5@kata.local', password: 'whatever1', role: 'judge', seat: 'front row',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_seat')
    })

    it('updates a user\'s role and seat', async () => {
      const created = await (await post('/api/v1/users', {
        email: 'judge9@kata.local', password: 'whatever1', role: 'judge', seat: 9,
      })).json()

      const res = await patch(`/api/v1/users/${created.user.uid}`, { seat: 3 })
      expect(res.status).toBe(200)
      expect((await res.json()).user).toMatchObject({ role: 'judge', seat: 3 })
    })

    it('lets a user log in with a new password after a reset', async () => {
      const created = await (await post('/api/v1/users', {
        email: 'judge10@kata.local', password: 'oldpass1', role: 'judge', seat: 10,
      })).json()

      await patch(`/api/v1/users/${created.user.uid}`, { password: 'newpass1' })

      expect((await login('judge10@kata.local', 'oldpass1')).status).toBe(401)
      expect((await login('judge10@kata.local', 'newpass1')).status).toBe(200)
    })

    it('404s updating a user that does not exist', async () => {
      const res = await patch('/api/v1/users/no-such-uid', { role: 'referee' })
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    })

    it('deletes a user, who can no longer log in', async () => {
      const created = await (await post('/api/v1/users', {
        email: 'judge11@kata.local', password: 'whatever1', role: 'judge', seat: 11,
      })).json()

      expect((await del(`/api/v1/users/${created.user.uid}`)).status).toBe(204)
      expect((await login('judge11@kata.local', 'whatever1')).status).toBe(401)
    })

    it('refuses to let an admin delete their own account', async () => {
      const me = await (await get('/api/v1/auth/me')).json()
      const res = await del(`/api/v1/users/${me.user.uid}`)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('cannot_delete_self')
    })

    it('keeps the admin routes closed to a referee', async () => {
      expect((await post('/api/v1/users', { email: 'x@kata.local', password: 'whatever1', role: 'referee' }, refereeToken)).status).toBe(403)
    })
  })

  describe('socket guards', () => {
    const connectError = (socket) =>
      new Promise((resolve) => socket.once('connect_error', resolve))

    it('refuses a socket with no token', async () => {
      const socket = connect(`http://localhost:${port}`, { transports: ['websocket'] })
      clients.push(socket)
      expect((await connectError(socket)).message).toBe('unauthorized')
    })

    it('refuses a socket with a forged token', async () => {
      const socket = client('forged.token.value')
      expect((await connectError(socket)).message).toBe('unauthorized')
    })

    it('does not let a judge take control of a mat', async () => {
      const judge = client(judgeToken)
      const snap = await emit(judge, 'match:join', { matchId: 'm1', control: true })
      expect(snap.controllerId).toBeNull()
    })

    it('does not let a judge send commands, even on a free mat', async () => {
      const judge = client(judgeToken)
      await emit(judge, 'match:join', { matchId: 'm1', control: true })
      const res = await emit(judge, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
      expect(res.error).toBe('forbidden')
    })

    it('still lets a judge watch', async () => {
      const referee = client()
      const judge = client(judgeToken)
      await emit(referee, 'match:join', { matchId: 'm1', control: true })
      await emit(judge, 'match:join', { matchId: 'm1' })

      const heard = nextEvent(judge, 'match:event')
      await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: 'ao', type: 'ippon' } })
      expect((await heard).state.match.scores.ao).toBe(3)
    })

    it('lets an admin drive a mat', async () => {
      const admin = client(await tokenFor('admin@kata.local'))
      const snap = await emit(admin, 'match:join', { matchId: 'm1', control: true })
      expect(snap.controllerId).toBe(admin.id)
      expect((await emit(admin, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })).ok).toBe(true)
    })
  })
})
