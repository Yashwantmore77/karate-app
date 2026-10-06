// Sample data for trying the app: one tournament carried from setup to live
// results, plus the two officer accounts. Run from packages/api:
//
//   npm run seed:sample            add the sample (skipped if it is already there)
//   npm run seed:sample -- --reset remove the sample tournament first, then add it
//
// It reads .env like the server does, so with MONGODB_URI set it writes to
// that database. Everything goes through the same tournament service the API
// uses, so the sample obeys every rule real data does (ages from the master
// date, locks, audit log). Nothing outside the sample tournament is touched,
// apart from creating the officer accounts when they are missing.

import { pathToFileURL } from 'node:url'
import { createStores } from '../lib/store.js'
import { isMongoConfigured, closeMongo } from '../db/mongo.js'
import { createTms } from '@kumite/shared/tms.js'
import { seededRandom } from '@kumite/shared/pools.js'
import { boutOutcome } from '@kumite/shared/results.js'
import { findUserRecordByEmail, createUser } from '../auth/users.js'
import { DEFAULT_SLOT_MINUTES, endOfSlot } from '../lib/schedule.js'

const SLUG = 'sample-open-2027'
const LINK_PASSWORD = 'sample123'
const OFFICER_PASSWORD = 'test12345' // accounts need 8+ characters
const admin = { uid: 'admin-uid-001', role: 'admin', meta: { ip: null, userAgent: 'seed-sample' } }
const random = seededRandom(2027)
const pick = (list) => list[Math.floor(random() * list.length)]

const FIRST = {
  M: ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Kabir', 'Ishaan', 'Rohan', 'Aditya', 'Sai', 'Atharv', 'Dhruv', 'Krish', 'Yash', 'Om', 'Vivaan', 'Pranav'],
  F: ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Ira', 'Kiara', 'Anika', 'Riya', 'Navya', 'Tara', 'Meera', 'Sara', 'Pari', 'Avni', 'Isha'],
}
const LAST = ['Sharma', 'Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Shinde', 'More', 'Pawar', 'Jadhav', 'Rao', 'Mehta']

const TEAMS = [
  { name: 'Shotokan Pune', club: 'Shotokan Karate Pune', code: 'SKP', coachName: 'Sensei Rahul Patil', district: 'Pune', state: 'Maharashtra' },
  { name: 'Goju Mumbai', club: 'Goju Ryu Mumbai', code: 'GRM', coachName: 'Sensei Neha Joshi', district: 'Mumbai', state: 'Maharashtra' },
  { name: 'Wado Nashik', club: 'Wado Kai Nashik', code: 'WKN', coachName: 'Sensei Amit Shinde', district: 'Nashik', state: 'Maharashtra' },
  { name: 'Kyokushin Bengaluru', club: 'Kyokushin Bengaluru', code: 'KYB', coachName: 'Sensei Kiran Rao', district: 'Bengaluru', state: 'Karnataka' },
  { name: 'Shito Hyderabad', club: 'Shito Ryu Hyderabad', code: 'SRH', coachName: 'Sensei Lakshmi Reddy', district: 'Hyderabad', state: 'Telangana' },
  { name: 'Budokan Goa', club: 'Budokan Goa', code: 'BKG', coachName: 'Sensei Joel Dsouza', district: 'North Goa', state: 'Goa' },
].map((t, i) => ({ ...t, country: 'India', email: `coach${i + 1}@sample.example`, mobile: `98${String(76543210 + i * 1111).slice(0, 8)}` }))

// Age groups with their weight classes; [label, min, max] with null for open.
const GROUPS = [
  { name: 'Boys 10-11', gender: 'M', minAge: 10, maxAge: 11, born: [2015, 2016], weights: [['-30 KG', null, 30], ['-35 KG', 30, 35], ['+35 KG', 35, null]], players: 10 },
  { name: 'Girls 10-11', gender: 'F', minAge: 10, maxAge: 11, born: [2015, 2016], weights: [['-30 KG', null, 30], ['+30 KG', 30, null]], players: 8 },
  { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13, born: [2013, 2014], weights: [['-35 KG', null, 35], ['-40 KG', 35, 40], ['-45 KG', 40, 45], ['+45 KG', 45, null]], players: 22 },
  { name: 'Girls 12-13', gender: 'F', minAge: 12, maxAge: 13, born: [2013, 2014], weights: [['-35 KG', null, 35], ['-40 KG', 35, 40], ['+40 KG', 40, null]], players: 12 },
  { name: 'Boys 14-15', gender: 'M', minAge: 14, maxAge: 15, born: [2011, 2012], weights: [['-50 KG', null, 50], ['-55 KG', 50, 55], ['+55 KG', 55, null]], players: 10 },
]

const weightIn = ([, min, max]) => {
  const lo = min ?? (max - 6)
  const hi = max ?? (min + 8)
  return Math.round((lo + 0.3 + random() * (hi - lo - 0.6)) * 10) / 10
}

async function removeSample(stores, tms) {
  const existing = (await stores.tournaments.list({ slug: SLUG }))[0]
  if (!existing) return false
  for (const category of await stores.categories.list({ tournamentId: existing.id })) {
    await stores.competitors.removeWhere({ categoryId: category.id })
    await stores.matches.removeWhere({ categoryId: category.id })
  }
  await stores.categories.removeWhere({ tournamentId: existing.id })
  await tms.purgeTournament(existing.id)
  await stores.auditLog.removeWhere({ tournamentId: existing.id })
  await stores.tournaments.remove(existing.id)
  return true
}

async function ensureOfficers() {
  const made = []
  for (const [email, role] of [['registrar@kata.local', 'registration_officer'], ['weighin@kata.local', 'weighin_officer'], ['announcer@kata.local', 'announcer'], ['viewer@kata.local', 'viewer']]) {
    if (await findUserRecordByEmail(email)) continue
    await createUser({ email, password: OFFICER_PASSWORD, role })
    made.push(email)
  }
  return made
}

/** Builds the sample in the given stores. Returns null when it is already there. */
export async function seedSample(stores, { reset = false, log = console.log } = {}) {
  const tms = createTms(stores)
  if (reset && await removeSample(stores, tms)) log('[seed] removed the previous sample tournament')
  if ((await stores.tournaments.list({ slug: SLUG })).length) {
    log(`[seed] the sample tournament (${SLUG}) is already there. Use --reset to rebuild it.`)
    return null
  }

  // --- setup -----------------------------------------------------------------
  const tournament = await stores.tournaments.insert({
    name: 'Sample State Open 2027', location: 'Shree Shiv Chhatrapati Sports Complex, Pune', date: '2027-01-16',
    template: 'kumite', status: 'active', judgeCount: 4, slotMinutes: DEFAULT_SLOT_MINUTES,
  })
  const tid = tournament.id
  await tms.updateTournament(admin, tid, {
    slug: SLUG, type: 'kata_kumite', masterAgeDate: '2027-01-01',
    description: 'Sample data for trying the system. Safe to delete (npm run seed:sample -- --reset).',
    organizer: 'Sample Karate Association', association: 'Sample State Karate Federation', venue: 'Shree Shiv Chhatrapati Sports Complex',
    city: 'Pune', district: 'Pune', state: 'Maharashtra', country: 'India',
    contactPerson: 'Tournament Office', contactMobile: '9800000000', contactEmail: 'office@sample.example',
    registrationStart: '2026-11-01', registrationClose: '2026-12-31', weighInDate: '2027-01-15', startDate: '2027-01-16', endDate: '2027-01-17',
    settings: { poolSize: 8, mats: 3, matchDurationSec: 120, pointGap: 8, emailNotifications: false, fees: { kata: 500, kumite: 700, both: 1000, team: 0 } },
  })

  const groupIds = {}
  const weightRows = {}
  for (const g of GROUPS) {
    const group = await tms.ageGroups.create(admin, tid, { name: g.name, gender: g.gender, minAge: g.minAge, maxAge: g.maxAge })
    groupIds[g.name] = group.id
    weightRows[g.name] = []
    for (const w of g.weights) {
      weightRows[g.name].push(await tms.weightCategories.create(admin, tid, { ageGroupId: group.id, name: w[0], minWeight: w[1], maxWeight: w[2] }))
    }
  }

  await tms.setLifecycle(admin, tid, 'REGISTRATION_OPEN')
  const link = await tms.saveLink(admin, tid, { password: LINK_PASSWORD })

  // --- registration --------------------------------------------------------
  const teams = []
  for (const t of TEAMS) teams.push(await tms.teams.create(admin, tid, t))

  const players = []
  const used = new Set()
  for (const g of GROUPS) {
    for (let i = 0; i < g.players; i += 1) {
      let name
      do { name = `${pick(FIRST[g.gender])} ${pick(LAST)}` } while (used.has(name))
      used.add(name)
      const year = pick(g.born)
      const dob = `${year}-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`
      const roll = random()
      const events = roll < 0.6 ? ['kumite'] : roll < 0.8 ? ['kata', 'kumite'] : ['kata']
      // Most kumite players sit in the first two weight classes, so those
      // categories have enough entrants to need pools.
      const weightClass = g.weights[Math.min(g.weights.length - 1, Math.floor(random() * random() * g.weights.length))]
      const team = teams[(i + GROUPS.indexOf(g)) % teams.length]
      players.push(await tms.createPlayer(admin, tid, {
        teamId: team.id, name, dob, gender: g.gender, events, weight: weightIn(weightClass),
        club: team.club, district: team.district, state: team.state, country: 'India',
        belt: pick(['Yellow', 'Orange', 'Green', 'Blue', 'Brown']),
      }))
    }
  }

  // A few left for the verification screen; everyone else approved.
  const pending = new Set(players.slice(0, 3).map((p) => p.id))
  for (const p of players) {
    if (pending.has(p.id)) continue
    await tms.setRegistrationStatus(admin, tid, p.id, 'approve')
    if (random() < 0.85) await tms.recordPayment(admin, tid, p.id, { status: 'PAID', method: pick(['UPI', 'Cash', 'Bank']), transactionId: `TXN${Math.floor(random() * 1e8)}` })
  }

  await tms.setLifecycle(admin, tid, 'REGISTRATION_CLOSED')
  await tms.setLifecycle(admin, tid, 'VERIFICATION')
  await tms.setLifecycle(admin, tid, 'WEIGH_IN')
  for (const p of await tms.listPlayers(tid, { event: 'kumite' })) {
    if (pending.has(p.id)) continue
    const drift = Math.round((random() - 0.5) * 6) / 10
    await tms.recordWeighIn(admin, tid, p.id, { actualWeight: Math.max(20, Math.round((p.weight + drift) * 10) / 10) })
  }

  // --- draw ------------------------------------------------------------------
  await tms.categorize(admin, tid)
  await tms.setEntriesLock(admin, tid, true)
  const pools = await tms.generatePools(admin, tid, { seed: 2027 })
  await tms.setDrawLock(admin, tid, true)
  const { created } = await tms.generateMatches(admin, tid)
  await tms.setLifecycle(admin, tid, 'READY')
  await tms.setLifecycle(admin, tid, 'LIVE')

  // Times on each mat, 09:00 onwards, one slot per bout.
  const queue = await tms.listMatches(tid)
  const nextSlot = {}
  for (const m of queue) {
    const mat = m.mat || 1
    const startsAt = new Date(Date.UTC(2027, 0, 16, 3, 30) + (nextSlot[mat] || 0) * DEFAULT_SLOT_MINUTES * 60_000).toISOString()
    nextSlot[mat] = (nextSlot[mat] || 0) + 1
    await stores.matches.update(m.id, { scheduledAt: startsAt, endsAt: endOfSlot(startsAt, DEFAULT_SLOT_MINUTES) })
  }

  // --- results ---------------------------------------------------------------
  // Fight out the two biggest categories completely (pools, final stage,
  // medals), and the first few bouts everywhere else, so every screen —
  // standings, bracket, live queue, medal tally, certificates — has data.
  const divisions = (await tms.divisions(tid)).sort((a, b) => b.count - a.count)
  const finished = new Set(divisions.slice(0, 2).map((d) => d.key))
  const fight = async (m) => {
    const aka = Math.floor(random() * 6)
    const ao = Math.floor(random() * 6)
    const winner = aka === ao ? (random() < 0.5 ? 'red' : 'blue') : aka > ao ? 'red' : 'blue'
    await tms.correctResult(admin, tid, m.id, { winner, avgRed: aka + (aka === ao && winner === 'red' ? 1 : 0), avgBlue: ao + (aka === ao && winner === 'blue' ? 1 : 0) })
  }
  for (const m of await tms.listMatches(tid)) {
    if (finished.has(m.divisionKey) || (m.round === 1 && random() < 0.5)) await fight(m)
  }
  for (const key of finished) {
    const result = (await tms.results(tid)).find((d) => d.key === key)
    if (result?.canGenerateBracket) {
      await tms.generateBracket(admin, tid, key)
      // Semi-finals, then the final once its corners are known.
      for (let round = 0; round < 4; round += 1) {
        const open = (await tms.listMatches(tid, { divisionKey: key })).filter((m) => m.stage === 'knockout' && !boutOutcome(m) && m.redId && m.blueId)
        if (!open.length) break
        for (const m of open) await fight(m)
      }
    }
  }
  await tms.publishResults(admin, tid, true)
  const { certificates } = await tms.generateCertificates(admin, tid)

  const officers = await ensureOfficers()
  const matches = await tms.listMatches(tid)

  log(`
[seed] Sample tournament ready${isMongoConfigured() ? ' in MongoDB' : ' (in memory only)'}
  Tournament          Sample State Open 2027   public page: /tournament/${SLUG}
  Age groups          ${GROUPS.length}, weight categories ${Object.values(weightRows).flat().length}
  Teams / players     ${teams.length} / ${players.length} (${pending.size} still awaiting verification)
  Pools / matches     ${pools.length} / ${created} pool bouts, ${matches.length} in all (${matches.filter((m) => boutOutcome(m)).length} finished)
  Medals published    ${(await tms.listMedals(tid)).length}, certificates ${certificates.length}
  Registration link   /register/${link.token}   password: ${LINK_PASSWORD}
  Officer accounts    ${officers.length ? `created ${officers.join(', ')} (password ${OFFICER_PASSWORD})` : 'already present'}
`)
  return { tournamentId: tid, players: players.length, matches: matches.length }
}

async function main() {
  if (!isMongoConfigured()) {
    console.warn('[seed] MONGODB_URI is not set: this run uses the in-memory store and nothing is kept.')
  }
  await seedSample(createStores(), { reset: process.argv.includes('--reset') })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
  .catch((err) => {
    console.error('[seed] failed:', err?.code || err?.message || err, err?.details ? JSON.stringify(err.details) : '')
    process.exitCode = 1
  })
  .finally(() => (isMongoConfigured() ? closeMongo() : undefined))
