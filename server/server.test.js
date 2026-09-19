// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { io as connect } from 'socket.io-client'
import { createApp } from './index.js'
import { remainingNow } from '../src/shared/clock.js'
import { formatClock } from '../src/shared/format.js'

let http, port, clients

const listen = () =>
  new Promise((resolve) => {
    const app = createApp()
    http = app.http
    http.listen(0, () => resolve(http.address().port))
  })

const client = () => {
  const socket = connect(`http://localhost:${port}`, { transports: ['websocket'] })
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

  it('gives control to the first claimant and refuses commands from the rest', async () => {
    const referee = client()
    const judge = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    const snap = await emit(judge, 'match:join', { matchId: 'm1', control: true })

    expect(snap.controllerId).not.toBe(judge.id)
    const rejected = await emit(judge, 'match:cmd', { matchId: 'm1', cmd: 'CLOCK_START' })
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
    const judges = [client(), client(), client()]

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
    const judge = client()
    await emit(referee, 'match:join', { matchId: 'm1', control: true })
    await emit(judge, 'match:join', { matchId: 'm1' })

    const released = nextEvent(judge, 'match:control')
    referee.disconnect()
    expect((await released).controllerId).toBeNull()

    const claimed = await emit(judge, 'match:join', { matchId: 'm1', control: true })
    expect(claimed.controllerId).toBe(judge.id)
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
