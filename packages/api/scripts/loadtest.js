// Event-day load test (PRD v1 §23). Simulates several mats scoring live over
// the socket while spectators poll the public page and the hall scoreboard,
// then reports response times. Run from packages/api:
//
//   npm run loadtest
//   npm run loadtest -- --mats 8 --viewers 300 --seconds 60
//
// It runs against an in-process server, in memory, loaded with the test
// tournaments (scripts/seed-scenarios.js), and keeps nothing.

import { performance } from 'node:perf_hooks'
import { opt, startLocal, scriptAdmin } from './lib.js'
import { io as connect } from 'socket.io-client'
import { runningEvent, parseDivisionKey } from '@kumite/shared/tms.js'

const MATS = Number(opt('mats', 6))
const VIEWERS = Number(opt('viewers', 200))
const SECONDS = Number(opt('seconds', 30))
// A referee taps about once a second at the busiest; this is far busier.
const COMMAND_EVERY_MS = Number(opt('command-ms', 250))
const VIEWER_EVERY_MS = Number(opt('viewer-ms', 3000))

const percentile = (list, p) => {
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const summary = (name, list, errors) => {
  const f = (v) => (v == null ? '—' : `${v.toFixed(1)} ms`)
  return `${name.padEnd(22)} ${String(list.length).padStart(7)} ok ${String(errors).padStart(5)} failed   p50 ${f(percentile(list, 50))}   p95 ${f(percentile(list, 95))}   p99 ${f(percentile(list, 99))}   max ${f(list.length ? Math.max(...list) : null)}`
}

export async function runLoadTest({ mats = MATS, viewers = VIEWERS, seconds = SECONDS, quiet = false } = {}) {
  const local = await startLocal(async (stores) => {
    const { seedScenarios } = await import('./seed-scenarios.js')
    await seedScenarios(stores, { log: () => {} })
  })
  const base = local.url
  const account = await scriptAdmin()
  const api = async (path, opts = {}, token) => {
    const res = await fetch(`${base}/api/v1${path}`, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status })
    return res.status === 204 ? null : res.json()
  }

  const { token } = await api('/auth/login', { method: 'POST', body: JSON.stringify(account) })
  const tournaments = (await api('/tournaments?limit=100', {}, token)).tournaments
  // The first live tournament with bouts waiting in the event on the mats now
  // (Kata and Kumite take turns, and only that one can be scored).
  let tournament = null
  let bouts = []
  for (const t of tournaments.filter((x) => x.lifecycleStatus === 'LIVE')) {
    bouts = (await api(`/tournaments/${t.id}/matches`, {}, token)).matches
      .filter((m) => m.redId && m.blueId && !['completed', 'cancelled'].includes(m.status))
      .filter((m) => !m.divisionKey || parseDivisionKey(m.divisionKey).event === runningEvent(t))
      .slice(0, mats)
    if (bouts.length) { tournament = t; break }
  }
  if (!tournament) throw new Error('No open bouts to score')

  const commandMs = []
  const viewMs = []
  const displayMs = []
  let commandErrors = 0
  let viewErrors = 0
  let displayErrors = 0
  const stopAt = Date.now() + seconds * 1000
  const sockets = []

  // --- the mats: one controlling console each, scoring and undoing ------------
  const mat = (bout, n) => new Promise((resolve) => {
    const socket = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false })
    sockets.push(socket)
    let seq = 0
    socket.on('connect_error', () => { commandErrors += 1; resolve() })
    socket.on('connect', () => {
      socket.emit('match:join', { matchId: bout.id, control: true }, () => {
        const tick = () => {
          if (Date.now() >= stopAt) return resolve()
          // Score then undo, so the bout never reaches the point gap and ends.
          const cmd = seq % 2 === 0 ? 'SCORE' : 'UNDO'
          const payload = cmd === 'SCORE' ? { side: seq % 4 === 0 ? 'aka' : 'ao', type: 'yuko' } : {}
          const t0 = performance.now()
          socket.timeout(5000).emit('match:cmd', { matchId: bout.id, cmd, payload, clientEventId: `load-${n}-${seq}` }, (err, ack) => {
            if (err || ack?.error) commandErrors += 1
            else commandMs.push(performance.now() - t0)
            setTimeout(tick, COMMAND_EVERY_MS)
          })
          seq += 1
        }
        tick()
      })
    })
  })

  // --- the crowd: public page and scoreboard polling --------------------------
  const viewer = async (n) => {
    // Spread the first requests out instead of one thundering burst.
    await new Promise((r) => setTimeout(r, (n * VIEWER_EVERY_MS) / Math.max(1, viewers)))
    while (Date.now() < stopAt) {
      const page = n % 4 !== 0
      const t0 = performance.now()
      try {
        await api(page ? `/public/tournaments/${tournament.slug || tournament.id}` : '/display')
        ;(page ? viewMs : displayMs).push(performance.now() - t0)
      } catch {
        if (page) viewErrors += 1
        else displayErrors += 1
      }
      await new Promise((r) => setTimeout(r, VIEWER_EVERY_MS))
    }
  }

  const started = performance.now()
  await Promise.all([...bouts.map(mat), ...Array.from({ length: viewers }, (_, n) => viewer(n))])
  const elapsed = (performance.now() - started) / 1000
  sockets.forEach((s) => s.close())
  if (local) await local.close()

  const report = {
    seconds: Math.round(elapsed), mats: bouts.length, viewers,
    commands: { ok: commandMs.length, failed: commandErrors, p50: percentile(commandMs, 50), p95: percentile(commandMs, 95), p99: percentile(commandMs, 99) },
    publicPage: { ok: viewMs.length, failed: viewErrors, p50: percentile(viewMs, 50), p95: percentile(viewMs, 95), p99: percentile(viewMs, 99) },
    scoreboard: { ok: displayMs.length, failed: displayErrors, p50: percentile(displayMs, 50), p95: percentile(displayMs, 95), p99: percentile(displayMs, 99) },
  }
  if (!quiet) {
    console.log(`Load test: ${bouts.length} mats scoring every ${COMMAND_EVERY_MS} ms, ${viewers} viewers every ${VIEWER_EVERY_MS} ms, ${report.seconds} s, in memory`)
    console.log(summary('Score commands', commandMs, commandErrors))
    console.log(summary('Public tournament page', viewMs, viewErrors))
    console.log(summary('Hall scoreboard', displayMs, displayErrors))
  }
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runLoadTest()
  // A failed command or page is a failed run, so this can gate a release.
  const failed = report.commands.failed + report.publicPage.failed + report.scoreboard.failed
  process.exit(failed ? 1 : 0)
}
