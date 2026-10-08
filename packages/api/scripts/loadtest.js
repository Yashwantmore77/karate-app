// Event-day load test (PRD v1 §23). Simulates several mats scoring live over
// the socket while spectators poll the public page and the hall scoreboard,
// then reports response times. Run from packages/api:
//
//   npm run loadtest                                  in-process server with the sample tournament
//   npm run loadtest -- --mats 8 --viewers 300 --seconds 60
//   npm run loadtest -- --url https://scores.example.org --email admin@… --password …
//
// Against a real server, give it an admin account and expect its API rate
// limit (API_RATE_LIMIT per minute per address) to apply: every simulated
// viewer comes from this one machine. Use a staging copy, never a live event.

import { performance } from 'node:perf_hooks'
import { io as connect } from 'socket.io-client'
import { runningEvent, parseDivisionKey } from '@kumite/shared/tms.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
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

async function startLocal() {
  // The simulated crowd shares one address, which the API rate limit would
  // otherwise (correctly) throttle.
  process.env.API_RATE_LIMIT = process.env.API_RATE_LIMIT || '1000000'
  const { createApp } = await import('../index.js')
  const { seedSample } = await import('./seed-sample.js')
  const { http, stores } = createApp()
  await seedSample(stores, { log: () => {} })
  const port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  return { url: `http://localhost:${port}`, close: () => new Promise((resolve) => http.close(resolve)) }
}

export async function runLoadTest({ url = null, email = 'admin@kata.local', password = 'test123', mats = MATS, viewers = VIEWERS, seconds = SECONDS, quiet = false } = {}) {
  const local = url ? null : await startLocal()
  const base = url || local.url
  const api = async (path, opts = {}, token) => {
    const res = await fetch(`${base}/api/v1${path}`, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status })
    return res.status === 204 ? null : res.json()
  }

  const { token } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  const tournaments = (await api('/tournaments?limit=100', {}, token)).tournaments
  const tournament = tournaments.find((t) => t.slug) || tournaments[0]
  if (!tournament) throw new Error('No tournament to test against')
  const queue = (await api(`/tournaments/${tournament.id}/matches`, {}, token)).matches
    .filter((m) => m.redId && m.blueId && !['completed', 'cancelled'].includes(m.status))
    // Only the event on the mats now can be scored (Kata and Kumite take turns).
    .filter((m) => !m.divisionKey || parseDivisionKey(m.divisionKey).event === runningEvent(tournament))
  const bouts = queue.slice(0, mats)
  if (!bouts.length) throw new Error('No open bouts to score')

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
    console.log(`Load test: ${bouts.length} mats scoring every ${COMMAND_EVERY_MS} ms, ${viewers} viewers every ${VIEWER_EVERY_MS} ms, ${report.seconds} s against ${url || 'an in-process server'}`)
    console.log(summary('Score commands', commandMs, commandErrors))
    console.log(summary('Public tournament page', viewMs, viewErrors))
    console.log(summary('Hall scoreboard', displayMs, displayErrors))
  }
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runLoadTest({ url: opt('url', null), email: opt('email', 'admin@kata.local'), password: opt('password', 'test123') })
  // A failed command or page is a failed run, so this can gate a release.
  const failed = report.commands.failed + report.publicPage.failed + report.scoreboard.failed
  process.exit(failed ? 1 : 0)
}
