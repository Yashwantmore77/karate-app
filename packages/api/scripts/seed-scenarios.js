// Test tournaments covering every stage and every situation the app handles.
// Run from packages/api:
//
//   npm run seed:scenarios                    add the test tournaments (skipped if they are already there)
//   npm run seed:scenarios -- --wipe --yes    DELETE every tournament and match first, then add them
//
// --wipe removes every tournament with all its data (teams, players, pools,
// matches, results, certificates, passes, audit entries) and every match and
// category, including ones from before the tournament system, and the coach
// logins of those tournaments. Staff accounts, organisations and rulesets are
// kept. A backup is written first to
// backups/before-wipe-<time>.json, so the old data can be restored with
// `npm run restore -- <file>`.
//
// It reads .env like the server does, so with MONGODB_URI set it writes to
// that database. Everything goes through the same tournament service the API
// uses, so the data obeys the same rules real data does.
//
// Dates are worked out from today, so "registration open" really is open and
// "live" really is today, whenever this is run.

import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createStores, COLLECTIONS } from '../lib/store.js'
import { createBackup } from '../lib/backup.js'
import { isMongoConfigured, closeMongo } from '../db/mongo.js'
import { createTms } from '@kumite/shared/tms.js'
import { seededRandom } from '@kumite/shared/pools.js'
import { boutOutcome } from '@kumite/shared/results.js'
import { listAssignableOfficials, listCoachAccounts, deleteUser, createUser, findUserRecordByEmail } from '../auth/users.js'
import { DEFAULT_SLOT_MINUTES, endOfSlot } from '../lib/schedule.js'

export const SCENARIO_PREFIX = 'test-'
export const LINK_PASSWORD = 'coach123'
export const OFFICIAL_PASSWORD = 'test12345' // accounts need 8+ characters
const admin = { uid: 'admin-uid-001', role: 'super_admin', meta: { ip: null, userAgent: 'seed-scenarios' } }

// Kept out of a wipe: they are not tournament data.
const KEEP = new Set(['organizations', 'rulesets'])

// --- names -----------------------------------------------------------------------

const FIRST = {
  M: ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Kabir', 'Ishaan', 'Rohan', 'Aditya', 'Sai', 'Atharv', 'Dhruv', 'Krish', 'Yash', 'Om', 'Vivaan', 'Pranav', 'Rudra', 'Ayaan', 'Shaurya', 'Advik'],
  F: ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Ira', 'Kiara', 'Anika', 'Riya', 'Navya', 'Tara', 'Meera', 'Sara', 'Pari', 'Avni', 'Isha', 'Kavya', 'Siya', 'Nitya', 'Prisha'],
}
const LAST = ['Sharma', 'Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Shinde', 'More', 'Pawar', 'Jadhav', 'Rao', 'Mehta', 'Kadam', 'Bhosale', 'Naik', 'Chavan']

const TEAMS = [
  { name: 'Shotokan Pune', club: 'Shotokan Karate Pune', code: 'SKP', coachName: 'Sensei Rahul Patil', district: 'Pune', state: 'Maharashtra' },
  { name: 'Goju Mumbai', club: 'Goju Ryu Mumbai', code: 'GRM', coachName: 'Sensei Neha Joshi', district: 'Mumbai', state: 'Maharashtra' },
  { name: 'Wado Nashik', club: 'Wado Kai Nashik', code: 'WKN', coachName: 'Sensei Amit Shinde', district: 'Nashik', state: 'Maharashtra' },
  { name: 'Kyokushin Bengaluru', club: 'Kyokushin Bengaluru', code: 'KYB', coachName: 'Sensei Kiran Rao', district: 'Bengaluru', state: 'Karnataka' },
  { name: 'Shito Hyderabad', club: 'Shito Ryu Hyderabad', code: 'SRH', coachName: 'Sensei Lakshmi Reddy', district: 'Hyderabad', state: 'Telangana' },
  { name: 'Budokan Goa', club: 'Budokan Goa', code: 'BKG', coachName: 'Sensei Joel Dsouza', district: 'North Goa', state: 'Goa' },
].map((t, i) => ({ ...t, country: 'India', email: `coach${i + 1}@test.example`, mobile: `98${String(76543210 + i * 1111).slice(0, 8)}` }))

// --- wipe ------------------------------------------------------------------------

/** Every collection that holds tournament or match data. */
export const WIPED_COLLECTIONS = COLLECTIONS.filter((name) => !KEEP.has(name))

/** Removes every tournament and match. Returns how many records went, by collection. */
export async function wipeTournaments(stores) {
  const removed = {}
  for (const name of WIPED_COLLECTIONS) {
    const n = await stores[name].removeWhere({})
    if (n) removed[name] = n
  }
  return removed
}

/** Team manager logins of tournaments that no longer exist. */
export async function removeOrphanCoaches(stores) {
  const live = new Set((await stores.tournaments.list({})).map((t) => t.id))
  let removed = 0
  for (const coach of await listCoachAccounts()) {
    if (live.has(coach.tournamentId)) continue
    await deleteUser(coach.uid)
    removed += 1
  }
  return removed
}

async function backupFirst(stores, log) {
  const backup = await createBackup(stores)
  const rows = Object.values(backup.collections).reduce((n, list) => n + list.length, 0)
  const dir = path.resolve(process.cwd(), 'backups')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `before-wipe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeFile(file, JSON.stringify(backup))
  log(`[seed] backup of the current data (${rows} records) written to ${file}`)
  return file
}

// --- the builder ------------------------------------------------------------------

function builder(stores, { now = new Date(), log = console.log } = {}) {
  const tms = createTms(stores, { now: () => new Date() })
  const random = seededRandom(2026)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const usedNames = new Set()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  /** A date `offset` days from today, as YYYY-MM-DD. */
  const day = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  const year = (date) => Number(date.slice(0, 4))
  let officials = { referees: [], judges: [] }

  const name = (gender) => {
    for (let i = 0; i < 400; i += 1) {
      const n = `${pick(FIRST[gender])} ${pick(LAST)}`
      if (!usedNames.has(n)) { usedNames.add(n); return n }
    }
    const n = `${pick(FIRST[gender])} ${pick(LAST)} ${usedNames.size}`
    usedNames.add(n)
    return n
  }

  /** A date of birth giving `age` on `masterAgeDate`. */
  const dobFor = (age, masterAgeDate) => {
    // Between age and age + 1 years before the master date, never on a birthday.
    const d = new Date(`${masterAgeDate}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() - age - 1)
    return new Date(d.getTime() + (30 + Math.floor(random() * 300)) * 86_400_000).toISOString().slice(0, 10)
  }

  /**
   * One tournament with its details, rules and categories. `groups` are age
   * groups: { name, gender, minAge, maxAge, weights: [[label, min, max, settings?]], settings? }.
   */
  async function tournament(spec) {
    const { name: title, slug, start, groups = [], details = true, settings = {}, extra = {} } = spec
    const t = await stores.tournaments.insert({
      name: title, location: spec.venue || 'Shree Shiv Chhatrapati Sports Complex, Pune', date: day(start),
      template: 'kumite', status: 'active', judgeCount: 4, slotMinutes: DEFAULT_SLOT_MINUTES,
    })
    const masterAgeDate = day(start)
    const base = { slug: `${SCENARIO_PREFIX}${slug}`, description: spec.description }
    await tms.updateTournament(admin, t.id, details ? {
      ...base, type: spec.type || 'kata_kumite', masterAgeDate,
      organizer: 'Test Karate Association', association: 'Test State Karate Federation', venue: spec.venue || 'Shree Shiv Chhatrapati Sports Complex',
      city: 'Pune', district: 'Pune', state: 'Maharashtra', country: 'India',
      contactPerson: 'Tournament Office', contactMobile: '9800000000', contactEmail: 'office@test.example',
      registrationStart: day(spec.regOpen ?? start - 40), registrationClose: day(spec.regClose ?? start - 5),
      weighInDate: day(start - 1), startDate: day(start), endDate: day(start + (spec.days || 2) - 1),
      rules: 'WKF rules apply. Protective gear (mitts, shin and foot guards, mouth guard) is compulsory for Kumite.',
      terms: 'Coaches confirm every player is medically fit and insured. Entry fees are not refundable.',
      settings: { poolSize: 8, mats: 3, matchDurationSec: 120, pointGap: 8, emailNotifications: false, fees: { kata: 500, kumite: 700, both: 1000, team: 0 }, ...settings },
      ...extra,
    } : { ...base, ...extra })

    const categories = {}
    for (const g of groups) {
      const group = await tms.ageGroups.create(admin, t.id, { name: g.name, gender: g.gender, minAge: g.minAge, maxAge: g.maxAge, ...(g.settings ? { settings: g.settings } : {}) })
      categories[g.name] = { group, weights: {} }
      for (const [label, min, max, wsettings] of g.weights || []) {
        categories[g.name].weights[label] = await tms.weightCategories.create(admin, t.id, { ageGroupId: group.id, name: label, minWeight: min, maxWeight: max, ...(wsettings ? { settings: wsettings } : {}) })
      }
    }
    return { id: t.id, slug: base.slug, masterAgeDate, groups, categories }
  }

  /**
   * Teams, each with its people: the head coach (from the team form), a team
   * manager who also coaches, and on every other team someone who is both a
   * judge and a referee.
   */
  async function teams(t, count = TEAMS.length) {
    const rows = []
    for (const [i, team] of TEAMS.slice(0, count).entries()) {
      const row = await tms.teams.create(admin, t.id, team)
      await tms.teamMembers.create(admin, t.id, { teamId: row.id, name: name(i % 2 ? 'F' : 'M'), roles: ['team_manager', 'coach'], mobile: `97${String(10000000 + i * 4321).slice(0, 8)}` })
      if (i % 2 === 0) await tms.teamMembers.create(admin, t.id, { teamId: row.id, name: name('M'), roles: ['judge', 'referee'], qualification: 'State referee (Grade B)' })
      rows.push(row)
    }
    return rows
  }

  /** A weight inside [min, max), or a little over max when `over`. */
  const weightIn = (min, max) => {
    const lo = min ?? (max - 6)
    const hi = max ?? (min + 8)
    return Math.round((lo + 0.3 + random() * (hi - lo - 0.6)) * 10) / 10
  }

  /**
   * Players for one age group: `entries` is a list of
   *   { events, weight: label | null, count }
   * Returns the created players.
   */
  async function players(t, teamRows, groupName, entries, options = {}) {
    const g = t.groups.find((x) => x.name === groupName)
    const made = []
    for (const entry of entries) {
      const wdef = entry.weight ? g.weights.find((w) => w[0] === entry.weight) : null
      for (let i = 0; i < entry.count; i += 1) {
        const team = teamRows[(made.length + i + groupName.length) % teamRows.length]
        const age = g.minAge + Math.floor(random() * (g.maxAge - g.minAge + 1))
        const weight = wdef ? weightIn(wdef[1], wdef[2]) : Math.round((40 + random() * 30) * 10) / 10
        made.push(await tms.createPlayer(admin, t.id, {
          teamId: team.id, name: entry.name || name(g.gender), dob: entry.dob || dobFor(age, t.masterAgeDate), gender: g.gender,
          events: entry.events, weight, club: team.club, district: team.district, state: team.state, country: 'India',
          belt: pick(['Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black']), ...(entry.extra || {}),
        }, options))
      }
    }
    return made
  }

  const approve = async (t, list, { paid = 1 } = {}) => {
    for (const p of list) {
      await tms.setRegistrationStatus(admin, t.id, p.id, 'approve')
      if (random() < paid) await tms.recordPayment(admin, t.id, p.id, { status: 'PAID', method: pick(['UPI', 'Cash', 'Bank transfer']), transactionId: `TXN${Math.floor(random() * 1e8)}` })
    }
  }

  /** Weighs every approved kumite player at their registered weight (± a little). */
  const weighAll = async (t, skip = new Set()) => {
    for (const p of await tms.listPlayers(t.id, { event: 'kumite' })) {
      if (skip.has(p.id) || !['APPROVED', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'WEIGH_IN_PENDING'].includes(p.registrationStatus)) continue
      const drift = Math.round((random() - 0.5) * 4) / 10
      const cat = p.entries?.kumite
      const wc = cat?.weightCategoryId ? await stores.weightCategories.get(cat.weightCategoryId) : null
      let w = Math.round((p.weight + drift) * 10) / 10
      if (wc?.maxWeight != null && w > wc.maxWeight) w = wc.maxWeight
      if (wc?.minWeight != null && w <= wc.minWeight) w = Math.round((wc.minWeight + 0.1) * 10) / 10
      await tms.recordWeighIn(admin, t.id, p.id, { actualWeight: w })
    }
  }

  const steps = async (t, list) => { for (const to of list) await tms.setLifecycle(admin, t.id, to) }

  /** Categorise, lock entries, draw pools; optionally lock the draw and generate bouts. */
  async function draw(t, { lockDraw = true } = {}) {
    await tms.categorize(admin, t.id)
    await tms.setEntriesLock(admin, t.id, true)
    const pools = await tms.generatePools(admin, t.id, { seed: 2026 })
    let created = 0
    if (lockDraw) {
      await tms.setDrawLock(admin, t.id, true)
      created = (await tms.generateMatches(admin, t.id)).created
    }
    return { pools, created }
  }

  /**
   * Mat times from 09:00 on the first day, with a referee and judges. Run
   * again later, it schedules only bouts that have no time yet (knockout
   * rounds created as winners go through), after the last one on each mat.
   */
  async function schedule(t, { officials: assign = true } = {}) {
    const tour = await stores.tournaments.get(t.id)
    const start = new Date(`${tour.startDate}T03:30:00Z`).getTime()
    const slot = DEFAULT_SLOT_MINUTES * 60_000
    const matches = await tms.listMatches(t.id)
    const next = {}
    for (const m of matches) {
      if (!m.scheduledAt) continue
      const mat = m.mat || 1
      next[mat] = Math.max(next[mat] || start, new Date(m.scheduledAt).getTime() + slot)
    }
    let i = 0
    for (const m of matches) {
      if (m.scheduledAt) continue
      const mat = m.mat || 1
      const startsAt = new Date(next[mat] || start).toISOString()
      next[mat] = (next[mat] || start) + slot
      const patch = { scheduledAt: startsAt, endsAt: endOfSlot(startsAt, DEFAULT_SLOT_MINUTES) }
      if (assign && officials.referees.length) {
        patch.refereeId = officials.referees[i % officials.referees.length].uid
        patch.judgeIds = officials.judges.slice(0, 4).map((j) => j.uid)
      }
      await stores.matches.update(m.id, patch)
      i += 1
    }
  }

  /** Fights one bout by points (or as the given result type). */
  async function fight(t, m, { type = 'COMPLETED', winner = null, aka = null, ao = null, reason = null, finishReason = null } = {}) {
    const a = aka ?? Math.floor(random() * 6)
    let b = ao ?? Math.floor(random() * 6)
    if (aka == null && ao == null && a === b) b = (b + 1) % 7
    const w = winner || (a > b ? 'red' : a < b ? 'blue' : 'red')
    await tms.correctResult(admin, t.id, m.id, { winner: w, avgRed: a, avgBlue: b, resultType: type, finishReason }, reason)
  }

  const boutsOf = async (t, key) => (await tms.listMatches(t.id, key ? { divisionKey: key } : {})).filter((m) => m.redId && m.blueId)
  const openBouts = async (t, key) => (await boutsOf(t, key)).filter((m) => !boutOutcome(m) && m.status !== 'cancelled')

  /** Fights every pool bout of a category, then its final stage, until medals are decided. */
  async function finishDivision(t, key) {
    for (const m of await openBouts(t, key)) await fight(t, m)
    for (let guard = 0; guard < 8; guard += 1) {
      const result = (await tms.results(t.id)).find((d) => d.key === key)
      if (result?.canGenerateBracket) await tms.generateBracket(admin, t.id, key)
      const open = await openBouts(t, key)
      if (!open.length) break
      for (const m of open) await fight(t, m)
    }
  }

  /** Runs a kata category's rounds; stops with the last round open when `leaveOpen`. */
  async function kata(t, key, { leaveOpen = false, partial = 0 } = {}) {
    for (let guard = 0; guard < 6; guard += 1) {
      const round = await tms.createKataRound(admin, t.id, key, { seed: 2026, start: true }).catch(() => null)
      if (!round) return
      const last = round.name === 'Final'
      const performers = leaveOpen && last ? round.performerIds.slice(0, partial) : round.performerIds
      for (const playerId of performers) {
        const base = 7 + random() * 1.5
        for (let seat = 1; seat <= round.judges; seat += 1) {
          await tms.submitKataScore(admin, t.id, round.id, { playerId, seat, score: Math.round((base + random() * 0.6) * 10) / 10 })
        }
      }
      if (leaveOpen && last) return
      await tms.completeKataRound(admin, t.id, round.id)
      if (last) return
    }
  }

  /**
   * The referees and judges to put on matches. When the database has none,
   * test officials are created, so every scheduled match has a panel.
   */
  async function loadOfficials() {
    const read = async () => {
      const all = await listAssignableOfficials().catch(() => [])
      return { referees: all.filter((u) => u.role === 'referee'), judges: all.filter((u) => u.role === 'judge') }
    }
    officials = await read()
    const wanted = [
      ...(officials.referees.length ? [] : [1, 2].map((n) => ({ email: `test.referee${n}@test.local`, role: 'referee' }))),
      ...(officials.judges.length ? [] : [1, 2, 3, 4].map((n) => ({ email: `test.judge${n}@test.local`, role: 'judge', seat: n }))),
    ]
    const created = []
    for (const account of wanted) {
      if (await findUserRecordByEmail(account.email)) continue
      await createUser({ ...account, password: OFFICIAL_PASSWORD })
      created.push(account.email)
    }
    if (created.length) {
      log(`[seed] no referee/judge accounts found, so test officials were created (password ${OFFICIAL_PASSWORD}): ${created.join(', ')}`)
      officials = await read()
    }
  }

  return { tms, random, pick, day, name, dobFor, tournament, teams, players, approve, weighAll, steps, draw, schedule, fight, boutsOf, openBouts, finishDivision, kata, loadOfficials, get officials() { return officials } }
}

// --- the scenarios -------------------------------------------------------------------

const JUNIORS = [
  { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13, weights: [['-40 KG', null, 40], ['-45 KG', 40, 45], ['+45 KG', 45, null]] },
  { name: 'Girls 12-13', gender: 'F', minAge: 12, maxAge: 13, weights: [['-40 KG', null, 40], ['+40 KG', 40, null]] },
  { name: 'Boys 14-15', gender: 'M', minAge: 14, maxAge: 15, weights: [['-52 KG', null, 52], ['-57 KG', 52, 57], ['+57 KG', 57, null]] },
  { name: 'Girls 14-15', gender: 'F', minAge: 14, maxAge: 15, weights: [['-47 KG', null, 47], ['+47 KG', 47, null]] },
]

/**
 * Builds the test tournaments. Returns a summary per tournament. Skipped
 * (returns null) when test tournaments are already there.
 */
export async function seedScenarios(stores, { wipe = false, backup = false, now = new Date(), log = console.log } = {}) {
  if (wipe) {
    if (backup) await backupFirst(stores, log)
    const removed = await wipeTournaments(stores)
    const coaches = await removeOrphanCoaches(stores)
    if (coaches) removed['coach logins'] = coaches
    log(`[seed] wiped: ${Object.entries(removed).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing to remove'}`)
  }
  const existing = (await stores.tournaments.list({})).filter((t) => String(t.slug || '').startsWith(SCENARIO_PREFIX))
  if (existing.length) {
    log(`[seed] ${existing.length} test tournaments are already there. Use --wipe --yes to start again.`)
    return null
  }
  const b = builder(stores, { now, log })
  const { tms, day } = b
  await b.loadOfficials()
  const summary = []
  const note = (t, title, status, scenarios) => summary.push({ id: t.id, slug: t.slug, title, status, scenarios })

  // 1. DRAFT: just created, details missing ------------------------------------------
  {
    const t = await b.tournament({ name: 'Test 01 · Draft Cup (details missing)', slug: 'draft-cup', start: 60, details: false, description: 'Just created. Details, dates and categories still to fill in.' })
    note(t, 'Draft Cup', 'DRAFT', ['Details incomplete: registration cannot open until they are filled in', 'No categories, teams or players', 'Guide bar shows "Fill in details and rules" as the next step'])
  }

  // 2. REGISTRATION OPEN, but the window starts next week -------------------------------
  {
    const t = await b.tournament({ name: 'Test 02 · Monsoon Open (registration opens next week)', slug: 'monsoon-open', start: 45, regOpen: 7, regClose: 35, groups: JUNIORS, description: 'Registration is open in the system but the coach window starts next week.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    await tms.saveLink(admin, t.id, {})
    note(t, 'Monsoon Open', 'REGISTRATION_OPEN', ['Coach link exists, but the registration window has not started (coaches see "not open yet")', 'Categories ready, no entries yet'])
  }

  // 3. REGISTRATION OPEN, coaches entering players: every registration case ------------
  {
    const t = await b.tournament({ name: 'Test 03 · District Open (registration open)', slug: 'district-open', start: 25, regOpen: -10, regClose: 15, groups: JUNIORS, description: 'Coaches are registering. Every registration and payment case is here.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const link = await tms.saveLink(admin, t.id, { password: LINK_PASSWORD, expiresAt: `${day(15)}T23:59:59.000Z` })
    const teamRows = await b.teams(t)
    const all = []
    for (const g of JUNIORS) {
      all.push(...await b.players(t, teamRows, g.name, g.weights.map(([w]) => ({ events: ['kumite'], weight: w, count: 2 })).concat([{ events: ['kata'], count: 2 }, { events: ['kata', 'kumite'], weight: g.weights[0][0], count: 2 }])))
    }
    // Statuses: approved and paid, approved but unpaid, pending, submitted by a coach, rejected, sent back for correction.
    const [toApprove, unpaid, rejected, correction, failed, refunded] = [all.slice(0, 20), all.slice(20, 26), all.slice(26, 28), all.slice(28, 30), all.slice(30, 31), all.slice(31, 32)]
    await b.approve(t, toApprove)
    await b.approve(t, unpaid, { paid: 0 })
    for (const p of rejected) await tms.setRegistrationStatus(admin, t.id, p.id, 'reject', 'Age proof does not match the date of birth')
    for (const p of correction) await tms.setRegistrationStatus(admin, t.id, p.id, 'request_correction', 'Please upload a clearer photo')
    for (const p of failed) { await tms.setRegistrationStatus(admin, t.id, p.id, 'approve'); await tms.recordPayment(admin, t.id, p.id, { status: 'FAILED', method: 'UPI', transactionId: 'TXNFAILED01' }) }
    for (const p of refunded) { await tms.setRegistrationStatus(admin, t.id, p.id, 'approve'); await tms.recordPayment(admin, t.id, p.id, { status: 'REFUNDED', method: 'Bank transfer', transactionId: 'TXNREFUND01', note: 'Player injured before the event' }) }
    // Entered by a coach through the link: "Submitted", waiting for the officer.
    const submitted = await b.players(t, teamRows, 'Boys 14-15', [{ events: ['kumite'], weight: '-57 KG', count: 3 }], { status: 'SUBMITTED' })
    // A possible duplicate (same name and date of birth), confirmed on purpose.
    const original = all[0]
    await tms.createPlayer(admin, t.id, { teamId: original.teamId, name: original.name, dob: original.dob, gender: original.gender, events: original.events, weight: original.weight, club: original.club, district: original.district, state: original.state, country: 'India', confirmDuplicate: true })
    // Too old for every age group: no category until an admin moves them.
    await b.players(t, teamRows, 'Boys 14-15', [{ events: ['kumite'], weight: '-57 KG', count: 1, dob: `${Number(t.masterAgeDate.slice(0, 4)) - 19}-05-10` }])
    // A team that was switched off: it cannot add players.
    const inactive = await tms.teams.create(admin, t.id, { name: 'Inactive Dojo', club: 'Inactive Dojo', code: 'IND', coachName: 'Sensei Test', district: 'Satara', state: 'Maharashtra', country: 'India', email: 'inactive@test.example', mobile: '9811111111' })
    await tms.teams.update(admin, t.id, inactive.id, { active: false })
    note(t, 'District Open', 'REGISTRATION_OPEN', [
      `Coach link /register/${link.token} (password ${LINK_PASSWORD}), expires in 15 days`,
      'Players: approved + paid, approved + unpaid, pending verification, submitted by coach, rejected (with reason), sent back for correction (draft)',
      'Payments: paid, pending, failed, refunded',
      'A possible duplicate player (same name and date of birth)',
      'A player too old for every age group (no category)',
      'An inactive team that cannot add players',
      'Team members: head coach, a team manager who also coaches, and judges who also referee',
      'Kata only, Kumite only, and Kata + Kumite entries',
    ])
  }

  // 4. REGISTRATION CLOSED → VERIFICATION: soft lock, closed window, link switched off ---------
  {
    const t = await b.tournament({ name: 'Test 04 · Coastal Cup (registration closed, verifying)', slug: 'coastal-cup', start: 12, regOpen: -40, regClose: -2, groups: JUNIORS.slice(0, 2), description: 'Registration closed two days ago. Officers are still checking entries.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    await tms.saveLink(admin, t.id, {})
    const teamRows = await b.teams(t, 4)
    const all = [
      ...await b.players(t, teamRows, 'Boys 12-13', [{ events: ['kumite'], weight: '-40 KG', count: 5 }, { events: ['kumite'], weight: '-45 KG', count: 4 }, { events: ['kata'], count: 3 }]),
      ...await b.players(t, teamRows, 'Girls 12-13', [{ events: ['kumite'], weight: '-40 KG', count: 4 }, { events: ['kata', 'kumite'], weight: '+40 KG', count: 3 }]),
    ]
    await b.approve(t, all.slice(0, 12), { paid: 0.7 })
    await tms.setSoftLock(admin, t.id, true)
    await tms.saveLink(admin, t.id, { active: false })
    await b.steps(t, ['REGISTRATION_CLOSED', 'VERIFICATION'])
    note(t, 'Coastal Cup', 'VERIFICATION', ['Registration window closed by date; coach link switched off', 'Coach entries soft-locked', `${all.length - 12} players still waiting for verification`, 'Some approved players have not paid'])
  }

  // 5. WEIGH-IN: every weigh-in result --------------------------------------------------
  {
    const t = await b.tournament({ name: 'Test 05 · Western Zone Championship (weigh-in day)', slug: 'western-zone', start: 1, regOpen: -45, regClose: -5, groups: JUNIORS.slice(2), description: 'Weigh-in is happening today. Every weigh-in result is here.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const teamRows = await b.teams(t)
    const all = [
      ...await b.players(t, teamRows, 'Boys 14-15', [{ events: ['kumite'], weight: '-52 KG', count: 6 }, { events: ['kumite'], weight: '-57 KG', count: 6 }, { events: ['kumite'], weight: '+57 KG', count: 4 }, { events: ['kata'], count: 4 }]),
      ...await b.players(t, teamRows, 'Girls 14-15', [{ events: ['kumite'], weight: '-47 KG', count: 5 }, { events: ['kata', 'kumite'], weight: '+47 KG', count: 4 }]),
    ]
    await b.approve(t, all)
    await b.steps(t, ['REGISTRATION_CLOSED', 'WEIGH_IN'])
    const kumite = (await tms.listPlayers(t.id, { event: 'kumite' }))
    const byWeight = (label) => kumite.filter((p) => p.entries?.kumite?.label?.includes(label) || p.entries?.kumite?.divisionKey?.includes(label))
    const light = kumite.filter((p) => p.gender === 'M' && p.weight < 52)
    // Passed, at the registered weight.
    for (const p of kumite.slice(0, 10)) await tms.recordWeighIn(admin, t.id, p.id, { actualWeight: p.weight })
    // Heavier than registered: moved to the next category automatically.
    if (light[0]) await tms.recordWeighIn(admin, t.id, light[light.length - 1].id, { actualWeight: 54.6, notes: 'Weighed 54.6 kg, registered under 52' })
    // Failed, and a recheck.
    const rest = kumite.slice(10)
    if (rest[0]) await tms.recordWeighIn(admin, t.id, rest[0].id, { actualWeight: rest[0].weight + 3, status: 'FAILED', notes: 'Over the limit after two attempts' })
    if (rest[1]) await tms.recordWeighIn(admin, t.id, rest[1].id, { actualWeight: rest[1].weight + 0.4, status: 'RECHECK_REQUIRED', notes: 'Scale showed 0.4 kg over; weigh again in 30 minutes' })
    await tms.sendWeighInReminder(admin, t.id)
    void byWeight
    note(t, 'Western Zone Championship', 'WEIGH_IN', ['Weighed and passed', 'Heavier than registered: moved to the next weight category automatically', 'Failed weigh-in, and a recheck required', `${Math.max(0, rest.length - 2)} kumite players not weighed yet`, 'Weigh-in reminder sent to teams (Notifications)'])
  }

  // 6. DRAW STAGE: entries locked, pools drawn, draw not locked yet ------------------------
  {
    const groups = [
      { name: 'Seniors Male', gender: 'M', minAge: 18, maxAge: 34, weights: [['-60 KG', null, 60], ['-67 KG', 60, 67], ['-75 KG', 67, 75], ['-84 KG', 75, 84, { poolMode: 'overflow', poolSize: 8 }], ['+84 KG', 84, null, { poolSystem: 'knockout' }]] },
      { name: 'Seniors Female', gender: 'F', minAge: 18, maxAge: 34, weights: [['-55 KG', null, 55], ['+55 KG', 55, null]] },
    ]
    const t = await b.tournament({ name: 'Test 06 · Senior Nationals Trials (draw stage)', slug: 'senior-trials', start: 3, regOpen: -50, regClose: -7, groups, description: 'Entries locked and pools drawn. The draw is not locked yet, so pools can still be changed.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const teamRows = await b.teams(t)
    const all = [
      ...await b.players(t, teamRows, 'Seniors Male', [
        { events: ['kumite'], weight: '-60 KG', count: 1 }, { events: ['kumite'], weight: '-67 KG', count: 2 }, { events: ['kumite'], weight: '-75 KG', count: 3 },
        { events: ['kumite'], weight: '-84 KG', count: 17 }, { events: ['kumite'], weight: '+84 KG', count: 6 }, { events: ['kata'], count: 6 },
      ]),
      ...await b.players(t, teamRows, 'Seniors Female', [{ events: ['kumite'], weight: '-55 KG', count: 9 }, { events: ['kata', 'kumite'], weight: '+55 KG', count: 4 }]),
    ]
    await b.approve(t, all)
    await b.steps(t, ['REGISTRATION_CLOSED', 'WEIGH_IN'])
    await b.weighAll(t)
    await b.draw(t, { lockDraw: false })
    // A player moved between the two pools of the 9-player category, with a reason.
    const pools = await tms.listPools(t.id)
    // The women's -55 KG (9 players) is drawn into two pools; one player changes pool.
    const split = Object.values(pools.reduce((acc, p) => { (acc[p.divisionKey] ||= []).push(p); return acc }, {}))
      .find((list) => list.length === 2 && list.every((p) => p.playerIds.length < 8))
      ?.sort((x, y) => y.playerIds.length - x.playerIds.length)
    if (split) await tms.movePlayer(admin, t.id, { playerId: split[0].playerIds[0], fromPoolId: split[0].id, toPoolId: split[1].id, reason: 'Club-mates were in the same pool' })
    note(t, 'Senior Nationals Trials', (await stores.tournaments.get(t.id)).lifecycleStatus, [
      'Entries locked, pools drawn, draw NOT locked (pools can still change)',
      'Category with a single entry (-60 KG): waiting for an admin decision',
      'Categories with 2 and 3 players',
      '17 players split 9 + 8 (overflow pool mode, -84 KG)',
      'Knockout pool system (+84 KG, 6 players: byes)',
      'A player moved between pools, with a reason',
      'Panel kata category',
    ])
  }

  // 7. READY: matches generated, scheduled, officials assigned, passes printed ----------------
  {
    const groups = [
      { name: 'Cadets Male', gender: 'M', minAge: 14, maxAge: 15, weights: [['-57 KG', null, 57], ['+57 KG', 57, null]] },
      { name: 'Cadets Female', gender: 'F', minAge: 14, maxAge: 15, weights: [['-54 KG', null, 54], ['+54 KG', 54, null]] },
    ]
    const t = await b.tournament({ name: 'Test 07 · Cadet Cup (ready to start)', slug: 'cadet-cup', start: 1, regOpen: -40, regClose: -6, groups, description: 'Everything is ready for tomorrow: matches scheduled, officials assigned, passes printed.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const teamRows = await b.teams(t, 4)
    const all = [
      ...await b.players(t, teamRows, 'Cadets Male', [{ events: ['kumite'], weight: '-57 KG', count: 6 }, { events: ['kumite'], weight: '+57 KG', count: 4 }, { events: ['kata'], count: 5 }]),
      ...await b.players(t, teamRows, 'Cadets Female', [{ events: ['kumite'], weight: '-54 KG', count: 5 }, { events: ['kata', 'kumite'], weight: '+54 KG', count: 3 }]),
    ]
    await b.approve(t, all)
    await b.steps(t, ['REGISTRATION_CLOSED', 'WEIGH_IN'])
    await b.weighAll(t)
    await b.draw(t)
    await b.schedule(t)
    await tms.setLifecycle(admin, t.id, 'READY')
    const [first] = await b.openBouts(t)
    if (first) await tms.swapCorners(admin, t.id, first.id, 'AKA belt colour mix-up')
    await tms.generatePasses(admin, t.id, { kinds: ['player', 'coach'] })
    const passes = await tms.listPasses(t.id)
    for (const p of passes.slice(0, 8)) await tms.checkIn(admin, t.id, p.code)
    note(t, 'Cadet Cup', 'READY', ['Draw locked, matches generated', 'Every match has a mat, a time' + (b.officials.referees.length ? ', a referee and judges' : ''), 'Corners swapped on one bout (with a reason)', `Accreditation passes printed (${passes.length}); 8 people checked in`])
  }

  // 8. LIVE: every match and result situation ------------------------------------------------
  {
    const groups = [
      { name: 'Seniors Male', gender: 'M', minAge: 18, maxAge: 34, weights: [['-50 KG', null, 50], ['-60 KG', 50, 60], ['-67 KG', 60, 67], ['-75 KG', 67, 75], ['-84 KG', 75, 84, { poolMode: 'overflow', poolSize: 8 }], ['+84 KG', 84, null, { poolSystem: 'knockout' }]] },
      { name: 'Seniors Female', gender: 'F', minAge: 18, maxAge: 34, weights: [['-55 KG', null, 55], ['+55 KG', 55, null]] },
    ]
    const t = await b.tournament({ name: 'Test 08 · State Championship (LIVE now)', slug: 'state-championship', start: 0, regOpen: -50, regClose: -7, groups, description: 'Competition day. Matches in every state, every result type, results at every stage.' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const teamRows = await b.teams(t)
    const all = [
      ...await b.players(t, teamRows, 'Seniors Male', [
        { events: ['kumite'], weight: '-50 KG', count: 1 }, { events: ['kumite'], weight: '-60 KG', count: 1 }, { events: ['kumite'], weight: '-67 KG', count: 2 },
        { events: ['kumite'], weight: '-75 KG', count: 3 }, { events: ['kumite'], weight: '-84 KG', count: 17 }, { events: ['kumite'], weight: '+84 KG', count: 6 },
        { events: ['kata'], count: 8 },
      ]),
      ...await b.players(t, teamRows, 'Seniors Female', [{ events: ['kumite'], weight: '-55 KG', count: 5 }, { events: ['kata', 'kumite'], weight: '+55 KG', count: 4 }]),
    ]
    await b.approve(t, all)
    await b.steps(t, ['REGISTRATION_CLOSED', 'WEIGH_IN'])
    await b.weighAll(t)
    await b.draw(t)
    await b.schedule(t)
    await b.steps(t, ['READY', 'LIVE'])

    const divs = await tms.divisions(t.id)
    const key = (label, event = 'kumite') => {
      const found = divs.find((d) => d.event === event && d.label.includes(label))
      if (!found) throw new Error(`no ${event} category "${label}" in: ${divs.map((d) => `${d.event}:${d.label}(${d.count})`).join(', ')}`)
      return found.key
    }
    const done = []

    // Single entries: one awarded the gold, one "no competition".
    await tms.decideSingleEntry(admin, t.id, key('-60 KG'), 'award')
    await tms.decideSingleEntry(admin, t.id, key('-50 KG'), 'no_competition')

    // -67 KG (2 players): won by walkover. Published, then locked.
    const [w] = await b.openBouts(t, key('-67 KG'))
    await b.fight(t, w, { type: 'WALKOVER', winner: 'red', aka: 0, ao: 0, finishReason: 'AO did not report to the mat after three calls' })

    // Female -55 KG (5 players, 10 bouts): every exceptional ending, plus a correction.
    const f55 = await b.openBouts(t, key('-55 KG'))
    const endings = [
      { type: 'COMPLETED', aka: 5, ao: 2 },
      { type: 'COMPLETED', aka: 1, ao: 1, winner: 'blue', finishReason: 'Senshu: AO scored first' },
      { type: 'COMPLETED', aka: 0, ao: 0, winner: 'red', finishReason: 'Hantei (judges decision) 3–1 for AKA' },
      { type: 'COMPLETED', aka: 8, ao: 0, finishReason: '8-point gap' },
      { type: 'NO_SHOW', winner: 'red', aka: 0, ao: 0, finishReason: 'AO absent at the call' },
      { type: 'KIKEN', winner: 'blue', aka: 1, ao: 2, finishReason: 'AKA withdrew injured' },
      { type: 'DISQUALIFIED', winner: 'red', aka: 3, ao: 4, finishReason: 'Shikkaku: AO ignored the referee' },
      { type: 'MANUAL_OVERRIDE', winner: 'blue', aka: 2, ao: 2, finishReason: 'Scoreboard failed; result decided by the tatami manager' },
    ]
    for (const [i, m] of f55.entries()) await b.fight(t, m, endings[i] || {})
    // An official correction of a finished bout (Rule 6: needs a reason).
    const [corrected] = (await b.boutsOf(t, key('-55 KG'))).filter((m) => boutOutcome(m))
    await tms.correctResult(admin, t.id, corrected.id, { winner: 'red', avgRed: 6, avgBlue: 2, resultType: 'COMPLETED' }, 'Video review: a waza-ari for AKA was missed')
    done.push(key('-67 KG'), key('-55 KG'))
    await tms.publishResults(admin, t.id, true)
    await tms.setDivisionLock(admin, t.id, key('-67 KG'), true)

    // -75 KG (3 players): finished and verified, not published.
    await b.finishDivision(t, key('-75 KG'))
    await tms.verifyResult(admin, t.id, key('-75 KG')).catch(() => null)

    // Female +55 KG: finished, provisional, with medals set by hand.
    await b.finishDivision(t, key('+55 KG'))
    const plus55 = divs.find((d) => d.key === key('+55 KG'))
    if (plus55) await tms.overrideMedals(admin, t.id, plus55.key, [{ playerId: plus55.playerIds[1], medal: 'gold' }, { playerId: plus55.playerIds[0], medal: 'silver' }, { playerId: plus55.playerIds[2], medal: 'bronze' }], 'Appeal upheld: semi-final result reversed by the jury')

    // +84 KG knockout (6 players): first round fought, the rest to come.
    const ko = await b.openBouts(t, key('+84 KG'))
    for (const m of ko.slice(0, 2)) await b.fight(t, m)

    // -84 KG (17 players, pools of 9 + 8): bouts in every state.
    const big = await b.openBouts(t, key('-84 KG'))
    for (const m of big.slice(0, 10)) await b.fight(t, m)
    const [called, calledTwice, ready, open, live, paused, cancelled] = big.slice(10, 17)
    await tms.callMatch(admin, t.id, called.id)
    await tms.callMatch(admin, t.id, calledTwice.id); await tms.callMatch(admin, t.id, calledTwice.id)
    await tms.callMatch(admin, t.id, ready.id)
    await tms.markAttendance(admin, t.id, ready.id, 'aka', true); await tms.markAttendance(admin, t.id, ready.id, 'ao', true)
    await tms.setMatchStatus(admin, t.id, open.id, 'open')
    for (const [m, to] of [[live, 'live'], [paused, 'paused']]) {
      await tms.setMatchStatus(admin, t.id, m.id, 'open')
      await tms.recordLiveEvent(admin, m.id, { seq: 1, cmd: 'CLOCK_START', before: null, after: null })
      await tms.recordLiveEvent(admin, m.id, { seq: 2, cmd: 'SCORE', payload: { side: 'aka', type: 'wazaAri' }, before: { match: { scores: { aka: 0, ao: 0 } } }, after: { match: { scores: { aka: 2, ao: 0 } } } })
      await tms.recordLiveEvent(admin, m.id, { seq: 3, cmd: 'PENALTY', payload: { side: 'ao', category: 'c1', level: 1 }, before: { match: { scores: { aka: 2, ao: 0 } } }, after: { match: { scores: { aka: 2, ao: 0 } } } })
      if (to === 'paused') await tms.recordLiveEvent(admin, m.id, { seq: 4, cmd: 'CLOCK_STOP', before: null, after: null })
    }
    await b.fight(t, cancelled, { type: 'CANCELLED', reason: 'Bout cancelled: both players in the wrong category' })
    // A player withdrawn after the draw: their remaining bouts become kiken.
    // (Someone with no bout in progress, so the live, paused and called bouts stay as they are.)
    const busy = new Set([called, calledTwice, ready, open, live, paused].flatMap((m) => [m.akaPlayerId, m.aoPlayerId]))
    const withdrawn = big.slice(17).flatMap((m) => [m.akaPlayerId, m.aoPlayerId]).find((id) => id && !busy.has(id))
    if (withdrawn) await tms.withdrawPlayer(admin, t.id, withdrawn, 'Injured in an earlier bout; doctor advised no further bouts')

    // Kata: the men's category in its final, half the performers scored.
    const kataKey = key('Seniors Male', 'kata')
    if (kataKey) await b.kata(t, kataKey, { leaveOpen: true, partial: 2 })
    // The women's kata: round 1 set up, not started yet.
    await tms.createKataRound(admin, t.id, key('Seniors Female', 'kata'), { seed: 2026 })

    await b.schedule(t) // knockout bouts created as winners went through
    await tms.generatePasses(admin, t.id, { kinds: ['player', 'coach'] })
    const passes = await tms.listPasses(t.id)
    for (const p of passes.slice(0, Math.floor(passes.length * 0.7))) await tms.checkIn(admin, t.id, p.code)

    note(t, 'State Championship', 'LIVE', [
      'Matches: scheduled, called, called twice, ready (both present), console open, live (with score events), paused, cancelled',
      'Results: points win, senshu, hantei (decision), 8-point gap, walkover, no-show, kiken, disqualification (shikkaku), manual override',
      'An official correction of a finished bout, with a reason (in the bout history and audit log)',
      'A player withdrawn after the draw: remaining bouts walked over',
      'Single entries: one awarded gold, one "no competition"',
      'Category results: provisional (with medals set by hand), verified, published, locked',
      '17 players in pools of 9 + 8; knockout category with the first round fought',
      'Kata: men\'s final open with only some performers scored; women\'s round 1 set up, not started',
      'Passes printed; about 70% checked in',
    ])
  }

  // 9. COMPLETED: everything finished, published, locked, certificates issued -----------------
  async function completed(spec) {
    const groups = [
      { name: 'Sub-Juniors Male', gender: 'M', minAge: 10, maxAge: 11, weights: [['-30 KG', null, 30], ['-35 KG', 30, 35], ['+35 KG', 35, null]] },
      { name: 'Sub-Juniors Female', gender: 'F', minAge: 10, maxAge: 11, weights: [['-30 KG', null, 30], ['+30 KG', 30, null]] },
      { name: 'Juniors Male', gender: 'M', minAge: 16, maxAge: 17, weights: [['-61 KG', null, 61], ['+61 KG', 61, null]] },
    ]
    const t = await b.tournament({ ...spec, groups, regOpen: spec.start - 60, regClose: spec.start - 10 })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const teamRows = await b.teams(t)
    const all = [
      ...await b.players(t, teamRows, 'Sub-Juniors Male', [{ events: ['kumite'], weight: '-30 KG', count: 5 }, { events: ['kumite'], weight: '-35 KG', count: 9 }, { events: ['kumite'], weight: '+35 KG', count: 3 }, { events: ['kata'], count: 6 }]),
      ...await b.players(t, teamRows, 'Sub-Juniors Female', [{ events: ['kumite'], weight: '-30 KG', count: 4 }, { events: ['kata', 'kumite'], weight: '+30 KG', count: 4 }]),
      ...await b.players(t, teamRows, 'Juniors Male', [{ events: ['kumite'], weight: '-61 KG', count: 6 }, { events: ['kumite'], weight: '+61 KG', count: 2 }]),
    ]
    await b.approve(t, all.slice(0, -1))
    // One rejected entry stays in the history.
    await tms.setRegistrationStatus(admin, t.id, all[all.length - 1].id, 'reject', 'Entry received after the deadline')
    await b.steps(t, ['REGISTRATION_CLOSED', 'WEIGH_IN'])
    await b.weighAll(t)
    await tms.setWeighInClosed(admin, t.id, true)
    await b.draw(t)
    await b.schedule(t)
    await b.steps(t, ['READY', 'LIVE'])
    for (const d of await tms.divisions(t.id)) {
      if (d.event === 'kata') await b.kata(t, d.key)
      else if (d.playerIds.length === 1) await tms.decideSingleEntry(admin, t.id, d.key, 'award')
      else await b.finishDivision(t, d.key)
    }
    await b.schedule(t)
    await tms.publishResults(admin, t.id, true)
    await tms.generateCertificates(admin, t.id, { types: ['medal', 'participation'] })
    await tms.issueCustomCertificate(admin, t.id, { name: all[3].name, award: 'Best Fighter of the Tournament', club: all[3].club })
    await tms.generatePasses(admin, t.id, { kinds: ['player', 'coach'] })
    for (const p of (await tms.listPasses(t.id)).slice(0, 20)) await tms.checkIn(admin, t.id, p.code)
    await tms.setLifecycle(admin, t.id, 'COMPLETED')
    return t
  }

  {
    const t = await completed({ name: 'Test 09 · Diwali Karate Cup (completed)', slug: 'diwali-cup', start: -12, description: 'Finished last week: every bout fought, results published and locked, certificates issued.' })
    note(t, 'Diwali Karate Cup', 'COMPLETED', ['Every bout fought, pools and knockout finals', 'Kata rounds to the final', 'Results published and locked; medal tally', 'Medal, participation and special-award certificates (QR verifiable)', 'Weigh-in closed; one rejected entry kept in the history'])
  }

  // 10. ARCHIVED ------------------------------------------------------------------------------
  {
    const t = await completed({ name: 'Test 10 · Winter Open 2025 (archived)', slug: 'winter-open-2025', start: -300, description: 'Last season. Archived: read-only history.' })
    await tms.setLifecycle(admin, t.id, 'ARCHIVED')
    note(t, 'Winter Open 2025', 'ARCHIVED', ['Read-only history: nothing can be changed', 'Results, certificates and the audit log still visible'])
  }

  const width = Math.max(...summary.map((s) => s.title.length))
  log(`\n[seed] ${summary.length} test tournaments ready${isMongoConfigured() ? ' in MongoDB' : ' (in memory)'}\n`)
  for (const s of summary) {
    log(`  ${s.title.padEnd(width)}  ${s.status.padEnd(19)} /tournament/${s.slug}`)
    for (const line of s.scenarios) log(`      · ${line}`)
  }
  log('')
  return summary
}

async function main() {
  const args = process.argv.slice(2)
  const wipe = args.includes('--wipe')
  if (wipe && !args.includes('--yes')) {
    console.error('[seed] --wipe deletes EVERY tournament and match. Run again with --wipe --yes to go ahead (a backup is written first).')
    process.exitCode = 1
    return
  }
  if (!isMongoConfigured()) console.warn('[seed] MONGODB_URI is not set: this run uses the in-memory store and nothing is kept.')
  await seedScenarios(createStores(), { wipe, backup: wipe && !args.includes('--no-backup') })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
  .catch((err) => {
    console.error('[seed] failed:', err?.code || err?.message || err, err?.details ? JSON.stringify(err.details) : '', err?.stack?.split('\n').slice(1, 4).join('\n'))
    process.exitCode = 1
  })
  .finally(() => (isMongoConfigured() ? closeMongo() : undefined))
