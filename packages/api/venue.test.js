import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { io as connect } from 'socket.io-client'
import { createApp } from './index.js'
import { initialMatchState } from '@kumite/shared/commands.js'

// A venue on event day: every device on the hall Wi-Fi (scoring tablets,
// hall screens, spectators' phones) reaches the server from one address, and
// the referees score a tap or two a second on every mat.

let app, base, sockets

const start = async () => {
  app = createApp()
  await app.stores.matches.insert({ id: 'm1', status: 'open', refereeId: null, judgeIds: [] })
  const port = await new Promise((resolve) => app.http.listen(0, () => resolve(app.http.address().port)))
  base = `http://localhost:${port}`
}

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const tokenFor = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'test123' } })).body.token

const socket = (path = '', token = null) => {
  const s = connect(`${base}${path}`, { transports: ['websocket'], ...(token ? { auth: { token } } : {}) })
  sockets.push(s)
  return new Promise((resolve) => s.on('connect', () => resolve(s)))
}
const emit = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('event day on the hall Wi-Fi', () => {
  beforeEach(() => { sockets = [] })
  afterEach(async () => {
    sockets.forEach((s) => s.disconnect())
    await new Promise((resolve) => app.http.close(resolve))
  })

  it('a score tap tells no screen to reload; a real change still does', async () => {
    await start()
    const screen = await socket('/public')
    let reloads = 0
    screen.on('public:changed', () => { reloads += 1 })
    const referee = await socket('', await tokenFor('referee@kata.local'))
    expect((await emit(referee, 'match:join', { matchId: 'm1', control: true })).controllerId).toBe(referee.id)
    await wait(600) // the bout stored by start() is announced, once
    reloads = 0
    for (let i = 0; i < 6; i += 1) {
      expect((await emit(referee, 'match:cmd', { matchId: 'm1', cmd: 'SCORE', payload: { side: i % 2 ? 'ao' : 'aka', type: 'yuko' }, clientEventId: `tap-${i}` })).ok).toBe(true)
      await wait(150)
    }
    await wait(600) // longer than the server waits to gather notices
    expect(reloads).toBe(0)
    // The taps were saved all the same.
    expect((await app.stores.matchEvents.list({ matchId: 'm1' })).length).toBe(6)

    const heard = new Promise((resolve) => screen.once('public:changed', resolve))
    await app.stores.matches.update('m1', { status: 'completed', winner: 'red' })
    await heard
  })

  it("a mat's scoreboard reaches its screen whole, with nothing to ask for", async () => {
    await start()
    const screen = await socket('/public')
    const mat2 = new Promise((resolve) => screen.on('display:mat', (msg) => msg.mat === 2 && resolve(msg.display)))
    const hall = new Promise((resolve) => screen.once('display:update', resolve))
    const token = await tokenFor('referee@kata.local')
    const put = await call('PUT', '/display?mat=2', { token, body: { status: 'open', matchId: 'm1', fieldNumber: '2', akaName: 'Aarav Patil', aoName: 'Rohan Kulkarni', akaScore: 3, aoScore: 1 } })
    expect(put.status).toBe(200)
    expect(await mat2).toMatchObject({ mat: 2, status: 'open', akaName: 'Aarav Patil', akaScore: 3, aoScore: 1 })
    // The hall screen follows the bout that just opened.
    expect(await hall).toMatchObject({ status: 'open', akaScore: 3, fieldNumber: '2' })
  })
})

describe("the scoring console's mat", () => {
  beforeEach(() => { sockets = [] })
  afterEach(async () => {
    sockets.forEach((s) => s.disconnect())
    await new Promise((resolve) => app.http.close(resolve))
  })

  it('starts on the mat the bout is scheduled on, and a resumed bout keeps its own', async () => {
    await start() // m1 has no mat
    await app.stores.matches.insert({ id: 'm3', status: 'scheduled', mat: 3, refereeId: null, judgeIds: [] })
    await app.stores.matches.insert({ id: 'm4', status: 'scheduled', mat: 2, refereeId: null, judgeIds: [] })
    // m4 was being scored on mat 4 when the server restarted.
    await app.tms.saveLiveState('m4', { seq: 7, state: { ...initialMatchState(), fieldNumber: '4' }, history: [] })
    const referee = await socket('', await tokenFor('referee@kata.local'))
    expect((await emit(referee, 'match:join', { matchId: 'm3', control: true })).state.fieldNumber).toBe('3')
    expect((await emit(referee, 'match:join', { matchId: 'm1', control: true })).state.fieldNumber).toBe('1')
    expect((await emit(referee, 'match:join', { matchId: 'm4', control: true })).state.fieldNumber).toBe('4')
  })
})

describe('request limits on a shared address', () => {
  const saved = {}
  beforeEach(() => {
    sockets = []
    for (const k of ['API_RATE_LIMIT', 'PUBLIC_RATE_LIMIT']) saved[k] = process.env[k]
    process.env.API_RATE_LIMIT = '5'
    process.env.PUBLIC_RATE_LIMIT = '8'
  })
  afterEach(async () => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    await new Promise((resolve) => app.http.close(resolve))
  })

  it('signed-in officials keep their own allowance when the venue address runs out', async () => {
    await start()
    const token = await tokenFor('admin@kata.local') // 1 from the address
    for (let i = 0; i < 4; i += 1) expect((await call('GET', '/tournaments')).status).toBe(401) // 2-5
    expect((await call('GET', '/tournaments')).status).toBe(429) // the address is out
    // The announcer's tablet on the same Wi-Fi is not.
    expect((await call('GET', '/tournaments', { token })).status).toBe(200)
    // Signing in is still counted by address (there is no session yet).
    expect((await call('POST', '/auth/login', { body: { email: 'referee@kata.local', password: 'test123' } })).status).toBe(429)
  })

  it('hall screens and phones reading public pages have their own allowance', async () => {
    await start()
    for (let i = 0; i < 5; i += 1) await call('GET', '/tournaments') // the API's allowance for the address is spent
    for (let i = 0; i < 8; i += 1) expect((await call('GET', '/public/tournaments')).status).toBe(200)
    expect((await call('GET', '/display')).status).toBe(429) // and so is the public one now
  })
})
