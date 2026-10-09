import { describe, it, expect } from 'vitest'
import { createTms, TMS_COLLECTIONS } from './tms.js'
import { memoryStores } from './memoryStore.js'
import { createKeyedLock } from './lock.js'

// On event day several people press at the same moment: two referees confirm
// their semi-finals, two mats finish together, ten coaches enter players in
// the last hour. Every database call takes a moment (a MongoDB round trip),
// which is when two requests read the same "highest number so far". These
// tests give every store call that moment.

const admin = { uid: 'admin-1', role: 'admin' }
const NOW = () => new Date('2026-12-01T10:00:00Z')
const READY = {
  name: 'Race Open', organizer: 'Race Association', venue: 'Pune', startDate: '2027-01-15', endDate: '2027-01-16', masterAgeDate: '2027-01-01',
  registrationStart: '2026-11-01', registrationClose: '2026-12-31', contactMobile: '+91 98765 43210', contactEmail: 'a@b.co', country: 'India', type: 'kumite',
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

/** The same stores, with every call waiting a moment first. Counts the writes. */
function slow(stores) {
  const writes = { insert: 0, update: 0 }
  const wrapped = Object.fromEntries(Object.entries(stores).map(([name, collection]) => [name, new Proxy(collection, {
    get: (target, prop) => (typeof target[prop] === 'function'
      ? async (...args) => {
        await tick()
        if (prop in writes) writes[prop] += 1
        return target[prop](...args)
      }
      : target[prop]),
  })]))
  return { stores: wrapped, writes }
}

/** A tournament open for entries, with one age group and one team. */
async function open() {
  const raw = memoryStores(['tournaments', 'categories', 'competitors', 'matches', ...TMS_COLLECTIONS])
  const tms = createTms(raw, { now: NOW })
  const t = await raw.tournaments.insert(READY)
  const g = await tms.ageGroups.create(admin, t.id, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 })
  const team = await tms.teams.create(admin, t.id, { name: 'ABC Dojo', club: 'ABC Dojo' })
  return { raw, tms, t, g, team }
}

/**
 * Drawn and locked: `classes` weight classes of `each` players, fought as a
 * knockout (or in pools), with the bouts made unless `matches` is false.
 */
async function drawn({ classes = 1, each = 4, mats = 1, poolSystem = 'knockout', matches = true } = {}) {
  const { raw, tms, t, g, team } = await open()
  await raw.tournaments.update(t.id, { settings: { requireWeighInForDraw: false, mats } })
  for (let c = 0; c < classes; c += 1) {
    await tms.weightCategories.create(admin, t.id, {
      ageGroupId: g.id, name: `-${35 + c * 5} KG`, maxWeight: 35 + c * 5,
      ...(c ? { minWeight: 30 + c * 5 } : {}), ...(poolSystem ? { settings: { poolSystem } } : {}),
    })
    for (let i = 0; i < each; i += 1) {
      const p = await tms.createPlayer(admin, t.id, { teamId: team.id, name: `Player ${c}-${i}`, dob: `2014-03-1${i}`, gender: 'M', events: ['kumite'], weight: 32 + c * 5 })
      await tms.setRegistrationStatus(admin, t.id, p.id, 'approve')
    }
  }
  await tms.categorize(admin, t.id)
  await tms.setEntriesLock(admin, t.id, true)
  await tms.generatePools(admin, t.id, { seed: 1 })
  await tms.setDrawLock(admin, t.id, true)
  if (matches) await tms.generateMatches(admin, t.id)
  return { raw, tms, t, team }
}

const knockoutBouts = async (raw, categoryId) => (await raw.matches.list(categoryId ? { categoryId } : {})).filter((m) => m.stage === 'knockout')
const repeated = (values) => values.filter((v, i) => values.indexOf(v) !== i)

describe('taking turns (lock.js)', () => {
  it('runs one call at a time per key, in order, and other keys alongside', async () => {
    const withLock = createKeyedLock()
    const log = []
    const job = (key, name) => withLock(key, async () => { log.push(`${name} in`); await tick(); log.push(`${name} out`); return name })
    const results = await Promise.all([job('a', 'a1'), job('a', 'a2'), job('b', 'b1')])
    expect(results).toEqual(['a1', 'a2', 'b1'])
    // a2 starts only after a1 is done; b1 does not wait for either.
    expect(log.indexOf('a2 in')).toBeGreaterThan(log.indexOf('a1 out'))
    expect(log.indexOf('b1 in')).toBeLessThan(log.indexOf('a1 out'))
  })

  it('a failure frees the turn for the next call', async () => {
    const withLock = createKeyedLock()
    const failed = withLock('a', async () => { await tick(); throw new Error('boom') })
    const next = withLock('a', async () => 'next ran')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('next ran')
  })
})

describe('event day: requests at the same moment', () => {
  it('two semi-finals confirmed at once create one final', async () => {
    const { raw, t } = await drawn()
    const semis = await knockoutBouts(raw)
    expect(semis).toHaveLength(2)
    const { stores } = slow(raw)
    const tms = createTms(stores, { now: NOW })
    const [{ divisionKey }] = await tms.listBrackets(t.id)
    // What PATCH /matches/:id does for each: save the result, then fill the bracket.
    await Promise.all(semis.map(async (m) => {
      await stores.matches.update(m.id, { status: 'completed', winner: 'red', avgRed: 3, avgBlue: 1 })
      await tms.syncBracket(t.id, divisionKey)
    }))
    const finals = (await knockoutBouts(raw)).filter((m) => m.round === 2)
    expect(finals).toHaveLength(1)
    expect(finals[0].redId).toBe(semis.find((m) => m.bracketKey === 'R1-1').redId)
  })

  it('two mats finishing at once never give two bouts the same match number', async () => {
    const { raw, t } = await drawn({ classes: 2, each: 4, mats: 2 })
    const { stores } = slow(raw)
    const tms = createTms(stores, { now: NOW })
    const categories = await raw.categories.list({ tournamentId: t.id })
    // Each mat confirms its semi-finals one after the other; the two mats at the same time.
    await Promise.all(categories.map(async (category) => {
      for (const m of await knockoutBouts(raw, category.id)) {
        await stores.matches.update(m.id, { status: 'completed', winner: 'red', avgRed: 3, avgBlue: 1 })
        await tms.syncBracket(t.id, category.divisionKey)
      }
    }))
    const numbers = (await raw.matches.list({})).map((m) => m.matchNumber)
    expect(numbers).toHaveLength(6) // 2 semi-finals and a final on each mat
    expect(repeated(numbers)).toEqual([])
  })

  it('people looking at a bracket write nothing', async () => {
    const { raw, t } = await drawn()
    const { stores, writes } = slow(raw)
    const tms = createTms(stores, { now: NOW })
    const [{ divisionKey }] = await tms.listBrackets(t.id)
    await Promise.all(Array.from({ length: 5 }, () => tms.bracketView(t.id, divisionKey)))
    expect(writes).toEqual({ insert: 0, update: 0 })
  })

  it('pressing "Generate matches" twice creates the bouts once', async () => {
    const { raw, t } = await drawn({ classes: 2, each: 3, poolSystem: null, matches: false })
    const tms = createTms(slow(raw).stores, { now: NOW })
    const [first, second] = await Promise.all([tms.generateMatches(admin, t.id), tms.generateMatches(admin, t.id)])
    // Three players in each class fight each other once: 3 bouts a class.
    expect([first.created, second.created]).toEqual([6, 0])
    const bouts = await raw.matches.list({})
    expect(bouts).toHaveLength(6)
    expect(repeated(bouts.map((m) => m.matchNumber))).toEqual([])
    expect(await raw.categories.list({ tournamentId: t.id })).toHaveLength(2)
  })

  it('ten coaches entering players at once get ten different player numbers', async () => {
    const { raw, t, tms: setup } = await open()
    const teams = []
    for (let i = 0; i < 10; i += 1) teams.push(await setup.teams.create(admin, t.id, { name: `Dojo ${i}`, club: `Dojo ${i}` }))
    const tms = createTms(slow(raw).stores, { now: NOW })
    await Promise.all(teams.map((team, i) => tms.createPlayer(admin, t.id, { teamId: team.id, name: `Player ${i}`, dob: `2014-03-1${i % 9}`, gender: 'M', events: ['kumite'], weight: 30 + i })))
    const numbers = (await raw.players.list({ tournamentId: t.id })).map((p) => p.playerNumber)
    expect(numbers).toHaveLength(10)
    expect(repeated(numbers)).toEqual([])
  })

  it('the same player entered twice at once is caught as a possible duplicate', async () => {
    const { raw, t, team } = await open()
    const tms = createTms(slow(raw).stores, { now: NOW })
    const entry = { teamId: team.id, name: 'Aarav Patil', dob: '2014-05-05', gender: 'M', events: ['kumite'], weight: 31 }
    const outcomes = await Promise.allSettled([tms.createPlayer(admin, t.id, entry), tms.createPlayer(admin, t.id, entry)])
    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(outcomes.find((o) => o.status === 'rejected').reason).toMatchObject({ code: 'possible_duplicate' })
  })

  it('teams registering at once get different team numbers', async () => {
    const { raw, t } = await open()
    const tms = createTms(slow(raw).stores, { now: NOW })
    await Promise.all(Array.from({ length: 6 }, (_, i) => tms.teams.create(admin, t.id, { name: `Dojo ${i}`, club: `Dojo ${i}` })))
    const numbers = (await raw.teams.list({ tournamentId: t.id })).map((x) => x.teamNumber)
    expect(numbers).toHaveLength(7) // ABC Dojo and the six
    expect(repeated(numbers)).toEqual([])
  })
})
