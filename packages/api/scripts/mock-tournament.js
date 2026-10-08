// Automated mock tournament: a rehearsal of a whole event, end to end,
// through the same API and live sockets the screens use. Every step is
// checked and reported; a failing step names what went wrong. Run from
// packages/api:
//
//   npm run mock                                         in-process server, demo accounts
//   npm run mock -- --teams 6 --players 8 --mats 3
//   npm run mock -- --url https://staging.example.org --email admin@… --password … [--cleanup]
//
// Against a real server only the admin account is needed: the admin does the
// officials' work too. Use a staging copy; --cleanup deletes the mock
// tournament afterwards. It never touches other tournaments.

import { performance } from 'node:perf_hooks'
import { io as connect } from 'socket.io-client'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

const FIRST = ['Aarav', 'Vihaan', 'Arjun', 'Kabir', 'Ishaan', 'Rohan', 'Aditya', 'Dhruv', 'Krish', 'Yash', 'Pranav', 'Atharv', 'Reyansh', 'Sai', 'Om', 'Vivaan']
const LAST = ['Sharma', 'Patil', 'Kulkarni', 'Joshi', 'Iyer', 'Rao', 'Nair', 'Gupta', 'Mehta', 'Desai', 'Shinde', 'Pawar']

async function startLocal() {
  process.env.API_RATE_LIMIT = process.env.API_RATE_LIMIT || '1000000'
  const { createApp } = await import('../index.js')
  const { http } = createApp()
  const port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  return { url: `http://localhost:${port}`, close: () => new Promise((resolve) => http.close(resolve)) }
}

export async function runMockTournament({
  url = null, email = 'admin@kata.local', password = 'test123', teams = 4, players = 6, mats = 2,
  demoAccounts = !url, cleanup = false, quiet = false,
} = {}) {
  const local = url ? null : await startLocal()
  const base = url || local.url
  const steps = []
  const log = (line) => { if (!quiet) console.log(line) }
  const call = async (method, path, body, token, { raw = false } = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (raw) return res
    const payload = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${payload?.error || ''}`.trim()), { status: res.status, payload })
    return payload
  }
  const step = async (name, fn) => {
    const t0 = performance.now()
    try {
      const detail = await fn()
      const ms = Math.round(performance.now() - t0)
      steps.push({ name, ok: true, ms, detail })
      log(`  ✓ ${name}${detail ? ` — ${detail}` : ''} (${ms} ms)`)
      return true
    } catch (err) {
      steps.push({ name, ok: false, error: err.message })
      log(`  ✗ ${name} — ${err.message}`)
      return false
    }
  }
  const must = (ok, what) => { if (!ok) throw new Error(what) }

  log(`Mock tournament against ${url || 'an in-process server'}: ${teams} teams × ${players} players, ${mats} mats`)
  const ctx = {}
  const login = async (who, pass = password) => (await call('POST', '/auth/login', { email: who, password: pass })).token

  const run = async () => {
    if (!(await step('Sign in as the organiser', async () => { ctx.admin = await login(email) }))) return
    const as = async (who) => (demoAccounts ? login(who, 'test123') : ctx.admin)

    if (!(await step('Create the tournament', async () => {
      const stamp = Date.now().toString(36)
      const { tournament } = await call('POST', '/tournaments', {
        name: `Mock Open ${stamp}`, location: 'Pune', date: '2027-03-20', template: 'kumite', type: 'kata_kumite', slug: `mock-open-${stamp}`,
        masterAgeDate: '2027-01-01', organizer: 'Mock Karate Association', venue: 'Mock Sports Hall', startDate: '2027-03-20', endDate: '2099-12-31',
        registrationStart: '2020-01-01', registrationClose: '2099-12-31', contactMobile: '+91 98765 43210', contactEmail: 'office@mock.example', country: 'India',
      }, ctx.admin)
      ctx.t = tournament.id
      ctx.slug = tournament.slug
      return tournament.name
    }))) return
    const T = `/tournaments/${ctx.t}`

    await step('Configure categories and rules', async () => {
      const { ageGroup } = await call('POST', `${T}/age-groups`, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 }, ctx.admin)
      await call('POST', `${T}/weight-categories`, { ageGroupId: ageGroup.id, name: '-40 KG', maxWeight: 40 }, ctx.admin)
      await call('POST', `${T}/weight-categories`, { ageGroupId: ageGroup.id, name: '+40 KG', minWeight: 40, maxWeight: 200 }, ctx.admin)
      // No emails to real people from a rehearsal.
      await call('PATCH', `${T}/settings`, { poolSize: 4, mats, kataJudges: 3, kataRounds: 1, requireWeighInForDraw: true, emailNotifications: false, notificationChannels: { email: false, sms: false, whatsapp: false } }, ctx.admin)
      return '1 age group, 2 weight categories'
    })

    await step('Open registration and publish the coach link', async () => {
      await call('POST', `${T}/lifecycle`, { to: 'REGISTRATION_OPEN' }, ctx.admin)
      const { link } = await call('PUT', `${T}/registration-link`, { password: 'mock-pass' }, ctx.admin)
      ctx.link = link.token
    })

    await step('Coaches register teams and players', async () => {
      let added = 0
      ctx.coaches = []
      for (let i = 0; i < teams; i += 1) {
        const session = (await call('POST', `/public/register/${ctx.link}/session`, { password: 'mock-pass' })).token
        const { token } = await call('POST', '/coach/team', { name: `Mock Dojo ${i + 1}`, club: `Mock Dojo ${i + 1}`, coachName: `Coach ${LAST[i % LAST.length]}` }, session)
        ctx.coaches.push(token)
        for (let j = 0; j < players; j += 1) {
          const n = i * players + j
          await call('POST', '/coach/players', {
            name: `${FIRST[n % FIRST.length]} ${LAST[(n * 7 + i) % LAST.length]} ${n + 1}`, dob: `2014-0${(j % 9) + 1}-1${j % 9}`, gender: 'M',
            events: j % 3 === 0 ? ['kata', 'kumite'] : ['kumite'], weight: 32 + ((n * 3) % 16),
          }, token)
          added += 1
        }
      }
      return `${added} players in ${teams} teams`
    })

    await step('Bulk upload preview and import', async () => {
      const csv = 'Player Name,DOB,Gender,Event,Weight\nBulk Entrant One,2014-02-02,M,kumite,36\nBulk Entrant Two,2014-03-03,M,kumite,44\n'
      const preview = await call('POST', '/coach/players/bulk/preview', { csv }, ctx.coaches[0])
      must(!preview.errors.length, `preview errors: ${JSON.stringify(preview.errors)}`)
      const done = await call('POST', '/coach/players/bulk', { csv }, ctx.coaches[0])
      return `${done.created} imported`
    })

    await step('Verify registrations and record payments', async () => {
      const registrar = await as('registrar@kata.local')
      const { players: list } = await call('GET', `${T}/players`, undefined, registrar)
      for (const p of list) {
        await call('POST', `${T}/players/${p.id}/registration`, { action: 'approve' }, registrar)
      }
      return `${list.length} approved`
    })

    await step('Weigh-in', async () => {
      await call('POST', `${T}/lifecycle`, { to: 'REGISTRATION_CLOSED' }, ctx.admin)
      await call('POST', `${T}/lifecycle`, { to: 'WEIGH_IN' }, ctx.admin)
      const officer = await as('weighin@kata.local')
      const { players: list } = await call('GET', `${T}/players?event=kumite`, undefined, officer)
      for (const p of list) await call('POST', `${T}/players/${p.id}/weigh-in`, { actualWeight: p.weight }, officer)
      return `${list.length} weighed`
    })

    await step('Categorise, lock entries and draw pools', async () => {
      await call('POST', `${T}/categorize`, {}, ctx.admin)
      await call('POST', `${T}/locks/entries`, { locked: true }, ctx.admin)
      const drawn = await call('POST', `${T}/pools/generate`, { seed: 42 }, ctx.admin)
      must(!drawn.excluded.length, `${drawn.excluded.length} players left out of the draw`)
      await call('POST', `${T}/locks/draw`, { locked: true }, ctx.admin)
      const { created } = await call('POST', `${T}/matches/generate`, {}, ctx.admin)
      return `${drawn.pools.length} pools, ${created} bouts`
    })

    await step('Issue passes and check athletes in at the door', async () => {
      const { passes } = await call('POST', `${T}/passes/generate`, { kinds: ['player', 'coach'] }, ctx.admin)
      const announcer = await as('announcer@kata.local')
      const athletes = passes.filter((p) => p.kind === 'player')
      for (const p of athletes) await call('POST', `${T}/checkin`, { code: p.code }, announcer)
      const pdf = await call('GET', `${T}/passes.pdf`, undefined, ctx.admin, { raw: true })
      must(pdf.headers.get('content-type') === 'application/pdf', 'passes PDF not returned')
      return `${passes.length} passes, ${athletes.length} checked in`
    })

    await step('Go live', async () => {
      await call('POST', `${T}/lifecycle`, { to: 'READY' }, ctx.admin)
      await call('POST', `${T}/lifecycle`, { to: 'LIVE' }, ctx.admin)
    })

    // Live scoring over the socket, one console per mat, mats in parallel.
    const fight = async (bouts) => {
      const byMat = new Map()
      bouts.forEach((m, i) => {
        const mat = (i % mats) + 1
        if (!byMat.has(mat)) byMat.set(mat, [])
        byMat.get(mat).push(m)
      })
      let scored = 0
      await Promise.all([...byMat.values()].map(async (queue) => {
        const socket = connect(base, { auth: { token: ctx.admin }, transports: ['websocket'], reconnection: false })
        await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
        const emit = (event, payload) => new Promise((resolve) => socket.timeout(8000).emit(event, payload, (err, reply) => resolve(err ? { error: 'timeout' } : reply)))
        try {
          for (const m of queue) {
            const snap = await emit('match:join', { matchId: m.id, control: true })
            must(snap?.controllerId, `could not take the mat for ${m.matchNumber}`)
            await emit('match:cmd', { matchId: m.id, cmd: 'CLOCK_START', clientEventId: `${m.id}-start` })
            const redWins = (m.matchNumber.charCodeAt(m.matchNumber.length - 1) % 2) === 0
            const plan = redWins ? ['aka', 'aka', 'ao', 'aka'] : ['ao', 'aka', 'ao', 'ao']
            for (const [k, side] of plan.entries()) {
              const r = await emit('match:cmd', { matchId: m.id, cmd: 'SCORE', payload: { side, type: 'wazaAri' }, clientEventId: `${m.id}-s${k}` })
              must(r?.ok, `score refused on ${m.matchNumber}: ${r?.error}`)
            }
            await emit('match:cmd', { matchId: m.id, cmd: 'CLOCK_STOP', clientEventId: `${m.id}-stop` })
            await call('PATCH', `/matches/${m.id}`, { status: 'completed', winner: redWins ? 'red' : 'blue', avgRed: redWins ? 6 : 2, avgBlue: redWins ? 2 : 6, result: { method: 'points', type: 'COMPLETED' } }, ctx.admin)
            scored += 1
          }
        } finally {
          socket.close()
        }
      }))
      return scored
    }

    await step('Score every pool bout live, mats in parallel', async () => {
      const { matches } = await call('GET', `${T}/matches`, undefined, ctx.admin)
      const pool = matches.filter((m) => m.redId && m.blueId && m.stage !== 'knockout')
      return `${await fight(pool)} bouts scored`
    })

    await step('Final stages: brackets fought to the end', async () => {
      let brackets = 0
      const { results } = await call('GET', `${T}/results`, undefined, ctx.admin)
      for (const d of results.filter((r) => r.canGenerateBracket)) {
        await call('POST', `${T}/brackets/generate`, { divisionKey: d.key }, ctx.admin)
        brackets += 1
      }
      // Rounds open as earlier ones finish.
      let fought = 0
      for (let round = 0; round < 6; round += 1) {
        const { matches } = await call('GET', `${T}/matches`, undefined, ctx.admin)
        const open = matches.filter((m) => m.stage === 'knockout' && m.redId && m.blueId && !['completed', 'cancelled'].includes(m.status))
        if (!open.length) break
        fought += await fight(open)
      }
      return `${brackets} brackets, ${fought} knockout bouts`
    })

    await step('Kata panel: judges assigned, round scored and closed', async () => {
      const { divisions } = await call('GET', `${T}/kata/divisions`, undefined, ctx.admin)
      if (!divisions.length) return 'no kata categories'
      let rounds = 0
      for (const d of divisions) {
        const { round } = await call('POST', `${T}/kata/rounds`, { divisionKey: d.key, seed: 7, start: true }, ctx.admin)
        for (const [i, playerId] of round.performerIds.entries()) {
          for (let seat = 1; seat <= round.judges; seat += 1) {
            await call('POST', `${T}/kata/rounds/${round.id}/scores`, { playerId, seat, score: Math.round((7 + i * 0.3 + seat * 0.1) * 10) / 10 }, ctx.admin)
          }
        }
        await call('POST', `${T}/kata/rounds/${round.id}/complete`, {}, ctx.admin)
        rounds += 1
      }
      return `${rounds} round(s)`
    })

    await step('Verify, publish and lock results', async () => {
      const published = await call('POST', `${T}/results/publish`, {}, ctx.admin)
      must(published.medals > 0, 'no medals were published')
      const { results } = await call('GET', `${T}/results`, undefined, ctx.admin)
      const decided = results.find((r) => r.resultStatus === 'PUBLISHED')
      if (decided) await call('POST', `${T}/results/lock`, { divisionKey: decided.key, locked: true }, ctx.admin)
      return `${published.medals} medals`
    })

    await step('Certificates', async () => {
      const { created } = await call('POST', `${T}/certificates/generate`, { types: ['medal', 'participation'] }, ctx.admin)
      const { certificates } = await call('GET', `${T}/certificates`, undefined, ctx.admin)
      const verified = await call('GET', `/public/certificates/${certificates[0].certificateId}`)
      must(verified.certificate.valid, 'certificate did not verify')
      const pdf = await call('GET', `${T}/certificates.pdf`, undefined, ctx.admin, { raw: true })
      must(pdf.headers.get('content-type') === 'application/pdf', 'certificates PDF not returned')
      return `${created} issued`
    })

    await step('Public page shows results and nothing private', async () => {
      const view = await call('GET', `/public/tournaments/${ctx.slug}`)
      must(view.results?.length > 0, 'no results on the public page')
      must(!/"dob"|"mobile"|"email"|passwordHash/.test(JSON.stringify(view)), 'private data on the public page')
      return `${view.results.length} categories public`
    })

    await step('Reports and analytics', async () => {
      const pdf = await call('GET', `${T}/reports/final-result.pdf`, undefined, ctx.admin, { raw: true })
      must(pdf.ok, 'final result report failed')
      const analytics = await call('GET', '/analytics', undefined, ctx.admin)
      must(analytics.tournaments.some((t) => t.id === ctx.t), 'tournament missing from analytics')
    })

    await step('Complete the tournament', async () => {
      await call('POST', `${T}/lifecycle`, { to: 'COMPLETED' }, ctx.admin)
      const { results } = await call('GET', `${T}/results`, undefined, ctx.admin)
      must(results.some((r) => r.resultStatus === 'LOCKED'), 'results were not locked')
    })

    if (cleanup) await step('Clean up the mock tournament', async () => { await call('DELETE', T, undefined, ctx.admin) })
  }

  try {
    await run()
  } finally {
    if (local) await local.close()
  }
  const failed = steps.filter((s) => !s.ok)
  log(failed.length ? `\nMock tournament: ${failed.length} of ${steps.length} steps failed.` : `\nMock tournament: all ${steps.length} steps passed.`)
  return { ok: !failed.length, steps, tournamentId: ctx.t || null }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runMockTournament({
    url: opt('url', null), email: opt('email', 'admin@kata.local'), password: opt('password', 'test123'),
    teams: Number(opt('teams', 4)), players: Number(opt('players', 6)), mats: Number(opt('mats', 2)), cleanup: opt('cleanup', false) === true,
  })
  process.exit(report.ok ? 0 : 1)
}
