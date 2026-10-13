// Builds two demonstration tournaments through the API, each run by its own
// Tournament Admin, with every step done by the person whose job it is:
//
//   - "Pune District … (Demo)", fully played: every bout scored, results
//     published and certificates issued, but left open (not marked Completed)
//     so it can still be explored and corrected;
//   - "Nashik Open … (Demo)", ready to run: registered, weighed, drawn, bouts
//     made, timetabled with referees, athletes checked in, and Live, with
//     nothing scored yet.
//
// Run from packages/api:
//
//   npm run demo                                in-process server, in memory, to try it
//   npm run demo -- --url https://api.example   against a real server
//   npm run demo -- --url … --only ready        just one of the two (played | ready)
//   npm run demo -- --url … --remove            delete both and every demo account
//
// Against a real server it signs in as an administrator: DEMO_ADMIN_EMAIL and
// DEMO_ADMIN_PASSWORD in packages/api/.env (or --email / --password). The
// accounts it makes live at @demo.karate.test, a reserved domain that can
// receive no mail, and are limited to the demo tournaments, so they reach
// nothing else on the server. They share one generated password, printed at
// the end.

import { randomBytes } from 'node:crypto'
import { io as connect } from 'socket.io-client'
import { opt, startLocal, scriptAdmin } from './lib.js'

// --- the people and places of the demo ---------------------------------------

export const DEMO_DOMAIN = 'demo.karate.test'
const TZ = 'Asia/Kolkata'
const MATS = 2
const POINTS = { ippon: 3, wazaAri: 2, yuko: 1 }

const CLUBS = [
  { name: 'Shotokan Karate Academy', city: 'Pune', coach: 'Sensei Rahul Kulkarni' },
  { name: 'Budokan Karate Club', city: 'Mumbai', coach: 'Sensei Meera Iyer' },
  { name: 'Goju Ryu Dojo', city: 'Nashik', coach: 'Sensei Amit Deshpande' },
  { name: 'Kyokushin Karate Kolhapur', city: 'Kolhapur', coach: 'Sensei Sneha Jadhav' },
]
const BOYS = ['Aarav', 'Vihaan', 'Arjun', 'Kabir', 'Ishaan', 'Rohan', 'Aditya', 'Dhruv', 'Krish', 'Yash',
  'Pranav', 'Atharv', 'Reyansh', 'Sai', 'Om', 'Vivaan', 'Ayaan', 'Advait', 'Rudra', 'Shaurya']
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Ira', 'Kiara', 'Anika', 'Navya', 'Pari',
  'Riya', 'Sara', 'Aarohi', 'Shreya', 'Tanvi', 'Mira', 'Avni', 'Kavya', 'Isha', 'Siya']
const SURNAMES = ['Sharma', 'Patil', 'Kulkarni', 'Joshi', 'Iyer', 'Rao', 'Nair', 'Gupta',
  'Mehta', 'Desai', 'Shinde', 'Pawar', 'Deshpande', 'Gaikwad', 'Jadhav', 'More']

// Each age group fights kata as one category and kumite in two weights, split
// at `cut` kilograms. The younger children fight round-robin pools, so each
// gets several bouts; the 12-13s fight knockout brackets, so the demo shows
// both systems.
const GROUPS = [
  { name: 'Boys 10-11', gender: 'M', minAge: 10, maxAge: 11, cut: 30, knockout: false },
  { name: 'Girls 10-11', gender: 'F', minAge: 10, maxAge: 11, cut: 28, knockout: false },
  { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13, cut: 40, knockout: true },
  { name: 'Girls 12-13', gender: 'F', minAge: 12, maxAge: 13, cut: 38, knockout: true },
]
// Ten entries per group: seven in kata and seven in kumite, four of them in
// both. Kumite entrants alternate light and heavy, so each weight holds three
// or four and no category is left with a single player.
const EVENTS = ['both', 'kumite', 'kata', 'both', 'kumite', 'kata', 'both', 'kumite', 'both', 'kata']

const pad = (n) => String(n).padStart(2, '0')

/** The forty entries, ages taken against 31 December of `year`. */
export function demoEntries(year) {
  const entries = []
  GROUPS.forEach((g, gi) => {
    const firsts = g.gender === 'M' ? BOYS : GIRLS
    let kumite = 0
    EVENTS.forEach((kind, i) => {
      const events = kind === 'both' ? ['kata', 'kumite'] : [kind]
      const age = i % 2 ? g.maxAge : g.minAge
      let weight = null
      if (events.includes('kumite')) {
        weight = kumite % 2 === 0 ? g.cut - 1 - (i % 4) : g.cut + 1 + (i % 5)
        kumite += 1
      }
      entries.push({
        club: (i + gi) % CLUBS.length,
        group: g.name,
        name: `${firsts[(gi >> 1) * 10 + i]} ${SURNAMES[(i * 3 + gi * 5) % SURNAMES.length]}`,
        dob: `${year - age}-${pad((i % 12) + 1)}-${pad(((i * 7 + gi * 3) % 27) + 1)}`,
        gender: g.gender,
        events,
        ...(weight ? { weight } : {}),
      })
    })
  })
  return entries
}

export const DEMO_TOURNAMENTS = {
  played: {
    stage: 'played', label: 'fully played',
    slug: 'demo-pune-district-championship', title: 'Pune District Karate Championship',
    city: 'Pune', venue: 'Shree Shiv Chhatrapati Sports Complex, Balewadi', admin: 'ta.pune',
  },
  ready: {
    stage: 'ready', label: 'ready to run',
    slug: 'demo-nashik-open', title: 'Nashik Open Karate Championship',
    city: 'Nashik', venue: 'Divisional Sports Complex, Nashik', admin: 'ta.nashik',
  },
}

const STAFF = [
  { key: 'referee1', label: 'Referee, mat 1', role: 'referee', mat: 1 },
  { key: 'referee2', label: 'Referee, mat 2', role: 'referee', mat: 2 },
  { key: 'judge1', label: 'Kata Judge, seat 1', role: 'judge', seat: 1 },
  { key: 'judge2', label: 'Kata Judge, seat 2', role: 'judge', seat: 2 },
  { key: 'judge3', label: 'Kata Judge, seat 3', role: 'judge', seat: 3 },
  { key: 'registrar', label: 'Registration Officer', role: 'registration_officer' },
  { key: 'weighin', label: 'Weigh-in Officer', role: 'weighin_officer' },
  { key: 'announcer', label: 'Announcer', role: 'announcer' },
  { key: 'scoreboard', label: 'Scoreboard Operator', role: 'scoreboard_operator' },
]
const email = (key) => `${key}@${DEMO_DOMAIN}`

/** A calendar day in the tournament's own time zone, `offset` days from today. */
const zonedDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

// --- the run -------------------------------------------------------------------

export async function runDemo({
  url = null, email: adminEmail = null, password: adminPassword = null,
  only = null, remove = false, staffPassword = null, quiet = false,
} = {}) {
  // Trying it locally is always in memory: a database in .env is never
  // written to by a run that names no server.
  if (!url) delete process.env.MONGODB_URI
  const local = url ? null : await startLocal()
  const base = (url || local.url).replace(/\/+$/, '')
  const steps = []
  const log = (line) => { if (!quiet) console.log(line) }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const call = async (method, path, body, token) => {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      // A real server's rate limiter is a pause, not a failure.
      if (res.status === 429 && attempt < 6) { await sleep(5000 * (attempt + 1)); continue }
      const payload = res.status === 204 ? null : await res.json().catch(() => null)
      if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${payload?.error || ''}`.trim()), { status: res.status, payload })
      return payload
    }
  }
  const step = async (name, fn) => {
    const t0 = performance.now()
    try {
      const detail = await fn()
      steps.push({ name, ok: true, detail })
      log(`  ✓ ${name}${detail ? ` — ${detail}` : ''} (${Math.round(performance.now() - t0)} ms)`)
      return true
    } catch (err) {
      steps.push({ name, ok: false, error: err.message })
      log(`  ✗ ${name} — ${err.message}`)
      return false
    }
  }
  const must = (ok, what) => { if (!ok) throw new Error(what) }
  const login = async (who, pass) => (await call('POST', '/auth/login', { email: who, password: pass })).token

  const report = { ok: false, steps, tournaments: {}, accounts: [], staffPassword: null, removed: null }
  const specs = Object.values(DEMO_TOURNAMENTS).filter((s) => !only || s.stage === only)
  const year = Number(zonedDay().slice(0, 4))
  const nameOf = (spec) => `${spec.title} ${year} (Demo)`
  const slugOf = (spec) => `${spec.slug}-${year}`

  try {
    // A free-tier server sleeps when idle and takes up to a minute to wake.
    if (url) {
      await step('Wake the server', async () => {
        for (let i = 0; i < 12; i += 1) {
          const ok = await fetch(`${base}/health`).then((r) => r.ok, () => false)
          if (ok) return null
          await sleep(10_000)
        }
        throw new Error(`no answer from ${base}/health`)
      })
    }
    const admin = await scriptAdmin({ email: adminEmail, password: adminPassword, local: !!local, env: ['DEMO_ADMIN_EMAIL', 'DEMO_ADMIN_PASSWORD'] })
    let A = null
    if (!(await step('Sign in as the administrator', async () => { A = await login(admin.email, admin.password); return admin.email }))) return report

    const existing = async () => {
      const { tournaments } = await call('GET', '/tournaments?q=Demo&limit=100', undefined, A)
      return tournaments.filter((t) => Object.values(DEMO_TOURNAMENTS).some((s) => t.slug === slugOf(s)))
    }

    // --- remove ----------------------------------------------------------------
    if (remove) {
      await step('Remove the demo tournaments and accounts', async () => {
        const found = await existing()
        for (const t of found) {
          // A tournament in progress is never deleted mid-event: close it first.
          if ((t.lifecycleStatus || 'DRAFT') === 'LIVE') await call('POST', `/tournaments/${t.id}/lifecycle`, { to: 'COMPLETED' }, A)
          await call('DELETE', `/tournaments/${t.id}`, undefined, A)
        }
        const { users } = await call('GET', `/users?q=${encodeURIComponent(`@${DEMO_DOMAIN}`)}&limit=100`, undefined, A)
        const demo = users.filter((u) => u.email.endsWith(`@${DEMO_DOMAIN}`))
        for (const u of demo) await call('DELETE', `/users/${u.uid}`, undefined, A)
        report.removed = { tournaments: found.length, accounts: demo.length }
        return `${found.length} tournaments, ${demo.length} accounts`
      })
      report.ok = steps.every((s) => s.ok)
      return report
    }

    if (!(await step('Check nothing from an earlier demo is in the way', async () => {
      const found = (await existing()).filter((t) => specs.some((s) => t.slug === slugOf(s)))
      must(!found.length, `already there: ${found.map((t) => t.name).join(', ')}. Run with --remove first.`)
    }))) return report

    // --- 1. the administrator sets both up ---------------------------------------
    const today = zonedDay()
    const tomorrow = zonedDay(1)
    const ids = {}
    for (const spec of specs) {
      const ok = await step(`Create “${nameOf(spec)}”`, async () => {
        const { tournament } = await call('POST', '/tournaments', {
          name: nameOf(spec), slug: slugOf(spec), template: 'kumite', type: 'kata_kumite',
          date: today, startDate: today, endDate: tomorrow, timezone: TZ,
          masterAgeDate: `${year}-12-31`, weighInDate: today,
          registrationStart: zonedDay(-30), registrationClose: today,
          location: spec.city, venue: spec.venue, city: spec.city, district: spec.city, state: 'Maharashtra', country: 'India',
          organizer: 'Demo Organising Committee', contactPerson: 'Tournament Office',
          contactMobile: '+91 98220 00000', contactEmail: `office@${DEMO_DOMAIN}`,
          description: `A demonstration tournament, ${spec.label}. Every name and result in it is made up.`,
        }, A)
        ids[spec.stage] = tournament.id
        report.tournaments[spec.stage] = { id: tournament.id, slug: tournament.slug, name: tournament.name, label: spec.label }
        return `${today} at ${spec.venue}`
      })
      if (!ok) return report
    }
    const demoIds = Object.values(ids)

    const password = staffPassword || randomBytes(9).toString('base64url')
    report.staffPassword = password
    const people = {}
    /** Makes the account, or brings one left from an earlier run up to date. */
    const ensure = async (account) => {
      const body = { email: account.email, password, role: account.role, tournamentIds: account.tournamentIds, ...(account.seat ? { seat: account.seat } : {}) }
      try {
        return (await call('POST', '/users', body, A)).user
      } catch (err) {
        if (err.payload?.error !== 'email_taken') throw err
        const { users } = await call('GET', `/users?q=${encodeURIComponent(account.email)}&limit=5`, undefined, A)
        const found = users.find((u) => u.email === account.email)
        return (await call('PATCH', `/users/${found.uid}`, body, A)).user
      }
    }
    if (!(await step('Create the officials (limited to the demo tournaments)', async () => {
      for (const s of STAFF) {
        const user = await ensure({ email: email(s.key), role: s.role, seat: s.seat, tournamentIds: demoIds })
        people[s.key] = { ...s, uid: user.uid, email: user.email }
        report.accounts.push({ email: user.email, label: s.label })
      }
      return `${STAFF.length} accounts`
    }))) return report

    for (const spec of specs) {
      if (!(await step(`Create a Tournament Admin and give them “${nameOf(spec)}”`, async () => {
        const user = await ensure({ email: email(spec.admin), role: 'tournament_owner', tournamentIds: [ids[spec.stage]] })
        people[spec.admin] = { uid: user.uid, email: user.email }
        report.accounts.unshift({ email: user.email, label: `Tournament Admin — ${nameOf(spec)} only` })
        report.tournaments[spec.stage].admin = user.email
        return user.email
      }))) return report
    }

    if (!(await step('Everyone signs in', async () => {
      for (const p of Object.values(people)) p.token = await login(p.email, password)
      return `${Object.keys(people).length} sessions`
    }))) return report

    for (const spec of specs) {
      log(`\n${nameOf(spec)} — ${spec.label}`)
      await runTournament(spec, ids[spec.stage])
    }
    report.ok = steps.every((s) => s.ok)
    return report

    // --- 2. a Tournament Admin runs their tournament ----------------------------
    async function runTournament(spec, id) {
      const T = `/tournaments/${id}`
      const TA = people[spec.admin].token
      const referee = (mat) => people[mat === 2 ? 'referee2' : 'referee1']
      const judges = ['judge1', 'judge2', 'judge3'].map((k) => people[k])
      const ctx = { slot: 0, busy: new Map(), timed: new Map() }

      const go = (name, fn) => step(name, fn)

      if (!(await go('The Tournament Admin sees this tournament and no other', async () => {
        const { tournaments } = await call('GET', '/tournaments?limit=100', undefined, TA)
        must(tournaments.length === 1 && tournaments[0].id === id, `they see ${tournaments.length} tournaments`)
        return people[spec.admin].email
      }))) return

      if (!(await go('Categories and rules', async () => {
        let weights = 0
        for (const g of GROUPS) {
          const { ageGroup } = await call('POST', `${T}/age-groups`, { name: g.name, gender: g.gender, minAge: g.minAge, maxAge: g.maxAge }, TA)
          // On the weight categories, not the age group: weights are kumite
          // only, and kata runs on the judges' panel whatever the draw.
          const system = g.knockout ? { settings: { poolSystem: 'knockout' } } : {}
          await call('POST', `${T}/weight-categories`, { ageGroupId: ageGroup.id, name: `-${g.cut} KG`, maxWeight: g.cut, ...system }, TA)
          await call('POST', `${T}/weight-categories`, { ageGroupId: ageGroup.id, name: `+${g.cut} KG`, minWeight: g.cut, maxWeight: 200, ...system }, TA)
          weights += 2
        }
        // Nobody real is behind these addresses, so nothing is sent.
        await call('PATCH', `${T}/settings`, {
          poolSize: 4, mats: MATS, kataMode: 'panel', kataJudges: judges.length, kataRounds: 2, kataQualifiers: 4,
          requireWeighInForDraw: true, emailNotifications: false, notificationChannels: { email: false, sms: false, whatsapp: false },
        }, TA)
        return `${GROUPS.length} kata + ${weights} kumite categories (10-11s in pools, 12-13s in knockout), ${MATS} mats`
      }))) return

      let link = null
      if (!(await go('Open registration and make the coaches’ link', async () => {
        await call('POST', `${T}/lifecycle`, { to: 'REGISTRATION_OPEN' }, TA)
        link = (await call('PUT', `${T}/registration-link`, { password: 'demo-coaches' }, TA)).link.token
      }))) return

      if (!(await go('Each club’s coach registers their team', async () => {
        const entries = demoEntries(year)
        for (const [c, club] of CLUBS.entries()) {
          const session = (await call('POST', `/public/register/${link}/session`, { password: 'demo-coaches' })).token
          const { token } = await call('POST', '/coach/team', { name: club.name, club: club.name, coachName: club.coach }, session)
          for (const e of entries.filter((x) => x.club === c)) {
            await call('POST', '/coach/players', { name: e.name, dob: e.dob, gender: e.gender, events: e.events, ...(e.weight ? { weight: e.weight } : {}) }, token)
          }
        }
        return `${entries.length} players from ${CLUBS.length} clubs`
      }))) return

      let byEvent = null
      if (!(await go('The Registration Officer approves the entries', async () => {
        const R = people.registrar.token
        const { players } = await call('GET', `${T}/players?limit=200`, undefined, R)
        for (const p of players) await call('POST', `${T}/players/${p.id}/registration`, { action: 'approve' }, R)
        byEvent = { kata: players.filter((p) => p.events.includes('kata')).length, kumite: players.filter((p) => p.events.includes('kumite')).length }
        return `${players.length} approved — ${byEvent.kata} kata, ${byEvent.kumite} kumite`
      }))) return

      if (!(await go('Close registration; the Weigh-in Officer weighs the kumite players', async () => {
        await call('POST', `${T}/lifecycle`, { to: 'REGISTRATION_CLOSED' }, TA)
        await call('POST', `${T}/lifecycle`, { to: 'WEIGH_IN' }, TA)
        const W = people.weighin.token
        const { players } = await call('GET', `${T}/players?event=kumite&limit=200`, undefined, W)
        for (const p of players) await call('POST', `${T}/players/${p.id}/weigh-in`, { actualWeight: p.weight }, W)
        return `${players.length} weighed`
      }))) return

      let made = 0
      if (!(await go('Place players, lock entries, draw the pools and make the bouts', async () => {
        await call('POST', `${T}/categorize`, {}, TA)
        await call('POST', `${T}/locks/entries`, { locked: true }, TA)
        const drawn = await call('POST', `${T}/pools/generate`, { seed: 2026 }, TA)
        must(!drawn.excluded.length, `${drawn.excluded.length} players left out of the draw`)
        await call('POST', `${T}/locks/draw`, { locked: true }, TA)
        made = (await call('POST', `${T}/matches/generate`, {}, TA)).created
        const { divisions } = await call('GET', `${T}/divisions`, undefined, TA)
        return `${drawn.pools.length} pools, ${made} bouts, ${divisions.length} categories`
      }))) return

      const isKata = (m) => /kata/i.test(m.divisionKey || '')
      const { tournament: shape } = await call('GET', T, undefined, TA)
      const slotMs = (shape.slotMinutes || 15) * 60_000
      // The played event ran from nine this morning; the one ready to run
      // starts at the next quarter hour.
      const startMs = spec.stage === 'played'
        ? new Date(`${today}T03:30:00Z`).getTime()
        : Math.ceil(Date.now() / (15 * 60_000)) * 15 * 60_000

      /** Each bout at the first slot where its mat and both players are free, with that mat's referee. */
      const timetable = async (bouts) => {
        let last = ctx.slot - 1
        for (const [i, m] of bouts.entries()) {
          if (ctx.timed.has(m.id)) continue
          const mat = m.mat || (i % MATS) + 1
          const busyFor = [`mat:${mat}`, m.akaPlayerId, m.aoPlayerId].filter(Boolean)
          let k = ctx.slot
          while (busyFor.some((x) => ctx.busy.get(k)?.has(x))) k += 1
          if (!ctx.busy.has(k)) ctx.busy.set(k, new Set())
          busyFor.forEach((x) => ctx.busy.get(k).add(x))
          await call('PATCH', `/matches/${m.id}`, { scheduledAt: new Date(startMs + k * slotMs).toISOString(), mat, refereeId: referee(mat).uid }, TA)
          ctx.timed.set(m.id, mat)
          last = Math.max(last, k)
        }
        ctx.slot = last + 1
        return bouts.length
      }
      const openBouts = async (stage) => (await call('GET', `${T}/matches`, undefined, TA)).matches
        .filter((m) => m.redId && m.blueId && !['completed', 'cancelled'].includes(m.status) && (stage === 'pool' ? m.stage !== 'knockout' : m.stage === 'knockout'))

      if (!(await go('Timetable both mats, a referee on every bout', async () => {
        const pool = await openBouts('pool')
        // Kata and Kumite take turns: the kata session first, kumite after it,
        // pools before the first round of the brackets.
        const kata = await timetable(pool.filter(isKata))
        // Kata on the judges' panel is scored in rounds, not bouts, so it holds
        // no slots of its own. Keep the start of the day for it all the same:
        // two slots a round, two rounds a category, shared across the mats.
        if (!kata) ctx.slot += Math.ceil((GROUPS.length * 2) / MATS) * 2
        const kumiteFrom = ctx.slot
        const kumite = await timetable(pool.filter((m) => !isKata(m)))
          + await timetable((await openBouts('knockout')).filter((m) => !isKata(m)))
        const at = (slot) => new Date(startMs + slot * slotMs).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
        return `kata from ${at(0)}, ${kata + kumite} kumite bouts from ${at(kumiteFrom)}; ${people.referee1.email.split('@')[0]} on mat 1, ${people.referee2.email.split('@')[0]} on mat 2`
      }))) return

      if (!(await go('Print passes; the Announcer checks athletes in at the door', async () => {
        const { passes } = await call('POST', `${T}/passes/generate`, { kinds: ['player', 'coach'] }, TA)
        const athletes = passes.filter((p) => p.kind === 'player')
        for (const p of athletes) await call('POST', `${T}/checkin`, { code: p.code }, people.announcer.token)
        return `${passes.length} passes, ${athletes.length} checked in`
      }))) return

      if (!(await go('Go live', async () => {
        await call('POST', `${T}/lifecycle`, { to: 'READY' }, TA)
        await call('POST', `${T}/lifecycle`, { to: 'LIVE' }, TA)
        return 'kata session on the mats first'
      }))) return

      if (spec.stage === 'ready') return

      // --- competition day -------------------------------------------------------

      if (!(await go('Kata: each judge scores from their own seat, round by round to the final', async () => {
        const { divisions } = await call('GET', `${T}/kata/divisions`, undefined, TA)
        must(divisions.length, 'no kata categories on the judges’ panel')
        let rounds = 0
        for (const d of divisions) {
          for (let guard = 0; guard < 5; guard += 1) {
            const { round } = await call('POST', `${T}/kata/rounds`, { divisionKey: d.key, seed: 7, start: true, judges: judges.map((j) => ({ seat: j.seat, uid: j.uid })) }, TA)
            for (const [i, playerId] of round.performerIds.entries()) {
              for (const j of judges) {
                // 6.6 to 9.0, spread so the panel ranks the performers.
                const score = Math.round((6.6 + ((i * 37 + j.seat * 11 + rounds * 5) % 25) / 10) * 10) / 10
                await call('POST', `${T}/kata/rounds/${round.id}/scores`, { playerId, score }, j.token)
              }
            }
            await call('POST', `${T}/kata/rounds/${round.id}/complete`, {}, TA)
            rounds += 1
            if (round.name === 'Final') break
          }
        }
        return `${rounds} rounds in ${divisions.length} categories, ${judges.length} judges`
      }))) return

      if (!(await go('Switch the mats to the kumite session', async () => {
        const switched = await call('POST', `${T}/running-event`, { event: 'kumite' }, TA)
        must(switched.event === 'kumite', 'the session did not switch')
      }))) return

      const PLANS = [
        [['aka', 'wazaAri'], ['ao', 'yuko'], ['aka', 'ippon']],
        [['ao', 'yuko'], ['ao', 'wazaAri'], ['aka', 'yuko'], ['ao', 'yuko']],
        [['aka', 'yuko'], ['aka', 'yuko'], ['ao', 'wazaAri'], ['aka', 'wazaAri']],
        [['ao', 'ippon'], ['aka', 'wazaAri'], ['ao', 'wazaAri']],
      ]
      /** The announcer calls each bout; that mat's referee scores it live on the console and closes it. */
      const fight = async (bouts) => {
        const byMat = new Map()
        for (const [i, m] of bouts.entries()) {
          const mat = ctx.timed.get(m.id) || m.mat || (i % MATS) + 1
          if (!byMat.has(mat)) byMat.set(mat, [])
          byMat.get(mat).push(m)
        }
        let scored = 0
        await Promise.all([...byMat.entries()].map(async ([mat, queue]) => {
          const ref = referee(mat)
          const socket = connect(base, { auth: { token: ref.token }, transports: ['websocket'], reconnection: false })
          await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
          const emit = (event, payload) => new Promise((resolve) => socket.timeout(10_000).emit(event, payload, (err, reply) => resolve(err ? { error: 'timeout' } : reply)))
          try {
            for (const m of queue) {
              await call('POST', `${T}/matches/${m.id}/call`, {}, people.announcer.token)
              const snap = await emit('match:join', { matchId: m.id, control: true })
              must(snap?.controllerId, `${ref.email} could not take bout ${m.matchNumber}`)
              await emit('match:cmd', { matchId: m.id, cmd: 'CLOCK_START', clientEventId: `${m.id}-start` })
              const plan = PLANS[scored % PLANS.length]
              const pts = { aka: 0, ao: 0 }
              for (const [k, [side, type]] of plan.entries()) {
                const r = await emit('match:cmd', { matchId: m.id, cmd: 'SCORE', payload: { side, type }, clientEventId: `${m.id}-s${k}` })
                must(r?.ok, `score refused on ${m.matchNumber}: ${r?.error}`)
                pts[side] += POINTS[type]
              }
              await emit('match:cmd', { matchId: m.id, cmd: 'CLOCK_STOP', clientEventId: `${m.id}-stop` })
              const redWins = pts.aka > pts.ao
              await call('PATCH', `/matches/${m.id}`, { status: 'completed', winner: redWins ? 'red' : 'blue', avgRed: pts.aka, avgBlue: pts.ao, result: { method: 'points', type: 'COMPLETED' } }, ref.token)
              scored += 1
            }
          } finally {
            socket.close()
          }
        }))
        return scored
      }

      if (!(await go('Kumite pools: every bout called, then scored live by its mat’s referee', async () => {
        const pool = (await openBouts('pool')).filter((m) => !isKata(m))
        return `${await fight(pool)} bouts`
      }))) return

      if (!(await go('Kumite knockout: brackets fought round by round to the final', async () => {
        let brackets = 0
        const { results } = await call('GET', `${T}/results`, undefined, TA)
        for (const d of results.filter((r) => r.event === 'kumite' && r.canGenerateBracket)) {
          await call('POST', `${T}/brackets/generate`, { divisionKey: d.key }, TA)
          brackets += 1
        }
        let fought = 0
        const categories = new Set()
        // Each round opens as the one before it finishes.
        for (let round = 0; round < 6; round += 1) {
          const open = (await openBouts('knockout')).filter((m) => !isKata(m))
          if (!open.length) break
          open.forEach((m) => categories.add(m.divisionKey))
          await timetable(open)
          fought += await fight(open)
        }
        must(fought > 0, 'no knockout bout was fought')
        return `${fought} bouts in ${categories.size} brackets${brackets ? ` (${brackets} cut from pools)` : ''}`
      }))) return

      if (!(await go('Publish the results', async () => {
        const published = await call('POST', `${T}/results/publish`, {}, TA)
        must(published.medals > 0, 'no medals were published')
        // Left unlocked and the tournament left Live, so it can still be
        // explored and corrected.
        return `${published.medals} medals`
      }))) return

      if (!(await go('Issue certificates', async () => {
        const { created } = await call('POST', `${T}/certificates/generate`, { types: ['medal', 'participation'] }, TA)
        return `${created} certificates`
      }))) return

      await go('The public page shows the results and nothing private', async () => {
        const view = await call('GET', `/public/tournaments/${slugOf(spec)}`)
        must(view.results?.length > 0, 'no results on the public page')
        must(!/"dob"|"mobile"|"email"|passwordHash/.test(JSON.stringify(view)), 'private data on the public page')
        return `${view.results.length} categories`
      })
    }
  } finally {
    if (local) await local.close()
  }
}

/** What to tell the person who ran it. */
export function describe(report, { url } = {}) {
  const lines = []
  if (report.removed) {
    lines.push('', `Removed ${report.removed.tournaments} demo tournaments and ${report.removed.accounts} demo accounts.`)
    return lines.join('\n')
  }
  const failed = report.steps.filter((s) => !s.ok)
  lines.push('', failed.length ? `Demo: ${failed.length} of ${report.steps.length} steps failed.` : `Demo: all ${report.steps.length} steps passed.`)
  for (const t of Object.values(report.tournaments)) {
    lines.push('', `  ${t.name} — ${t.label}`, `    run by ${t.admin || '(not assigned)'}`, `    public page: /tournament/${t.slug}`)
  }
  if (report.accounts.length) {
    lines.push('', `Accounts (password for every one: ${report.staffPassword})`)
    for (const a of report.accounts) lines.push(`  ${a.email.padEnd(34)} ${a.label}`)
    lines.push('', 'They reach only the demo tournaments. Keep the password to yourself all the same.')
  }
  lines.push('', `Take it all out again: npm run demo -- ${url ? `--url ${url} ` : ''}--remove`)
  return lines.join('\n')
}

if (process.argv[1]?.endsWith('demo-tournament.js')) {
  const url = opt('url', null)
  const report = await runDemo({
    url: url === true ? null : url,
    email: opt('email', null), password: opt('password', null),
    only: ['played', 'ready'].includes(opt('only', null)) ? opt('only', null) : null,
    remove: opt('remove', false) === true,
    staffPassword: process.env.DEMO_STAFF_PASSWORD || null,
  })
  console.log(describe(report, { url: url === true ? null : url }))
  process.exit(report.ok ? 0 : 1)
}
