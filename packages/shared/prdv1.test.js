import { describe, it, expect } from 'vitest'
import { createTms, TMS_COLLECTIONS, registrationReadiness } from './tms.js'
import { memoryStores } from './memoryStore.js'
import { evaluateOutcome, DEFAULT_RULES } from './rules.js'
import { applyCommand, initialMatchState, rulesFrom } from './commands.js'
import { drawPools, poolSizes, seededRandom } from './pools.js'
import { buildReport } from './reports.js'
import { kataFinal, componentScore, rankKata } from './kata.js'
import { zonedInstant } from './timezone.js'
import { safePattern, neutralizeFormula, toExportCsv, toCsv } from './registration.js'

const LEGACY = ['tournaments', 'categories', 'competitors', 'matches']
const admin = { uid: 'admin-1', role: 'admin' }
const referee = { uid: 'ref-1', role: 'referee' }
const officer = { uid: 'reg-1', role: 'registration_officer' }
const READY = {
  name: 'PRD Open', organizer: 'State KA', venue: 'Pune', startDate: '2027-01-15', endDate: '2027-01-16', masterAgeDate: '2027-01-01',
  registrationStart: '2026-11-01', registrationClose: '2026-12-31', contactMobile: '+91 98765 43210', contactEmail: 'a@b.co', country: 'India', type: 'kata_kumite',
}

async function world({ settings = {}, at = '2026-12-01T10:00:00Z', tournament = {} } = {}) {
  const stores = memoryStores([...LEGACY, ...TMS_COLLECTIONS])
  let clock = new Date(at)
  const tms = createTms(stores, { now: () => clock })
  const t = await stores.tournaments.insert({ ...READY, settings, ...tournament })
  const g = await tms.ageGroups.create(admin, t.id, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 })
  const w = await tms.weightCategories.create(admin, t.id, { ageGroupId: g.id, name: '-35 KG', maxWeight: 35 })
  const team = await tms.teams.create(admin, t.id, { name: 'ABC Dojo', club: 'ABC Dojo' })
  const add = async (n, extra = {}) => {
    const ids = []
    for (let i = 0; i < n; i += 1) {
      const p = await tms.createPlayer(admin, t.id, { teamId: team.id, name: `Player ${String(i).padStart(2, '0')}${extra.suffix || ''}`, dob: `2014-0${(i % 9) + 1}-1${i % 9}`, gender: 'M', events: ['kumite'], weight: 30 + (i % 5), ...extra.fields })
      await tms.setRegistrationStatus(admin, t.id, p.id, 'approve')
      ids.push(p.id)
    }
    return ids
  }
  return { stores, tms, t, g, w, team, add, setClock: (iso) => { clock = new Date(iso) } }
}

describe('PRD v1 §5-6 lifecycle and configuration', () => {
  it('lists what is missing before registration opens, and checks date ranges', async () => {
    expect(registrationReadiness({ name: 'X Open' }).map((m) => m.field)).toEqual(expect.arrayContaining(['organizer', 'venue', 'startDate', 'contactEmail']))
    const { tms, t } = await world()
    await expect(tms.updateTournament(admin, t.id, { endDate: '2027-01-10' })).rejects.toMatchObject({ code: 'invalid_tournament' })
    await expect(tms.updateTournament(admin, t.id, { registrationClose: '2026-10-01' })).rejects.toMatchObject({ code: 'invalid_tournament' })
    await expect(tms.updateTournament(admin, t.id, { timezone: 'Mars/Olympus' })).rejects.toMatchObject({ code: 'invalid_tournament' })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
  })

  it('locks entries at Entries Locked and Live, reopens only with privilege and reason, archives read-only', async () => {
    const { tms, t, stores, add } = await world()
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    await add(2)
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_CLOSED')
    await tms.setLifecycle(admin, t.id, 'WEIGH_IN')
    await tms.setLifecycle(admin, t.id, 'ENTRIES_LOCKED')
    expect((await stores.tournaments.get(t.id)).entriesLocked).toBe(true)
    // eligible entries show as Locked (PRD v1 §11)
    expect((await tms.listPlayers(t.id)).every((p) => p.registrationStatus === 'LOCKED')).toBe(true)
    await stores.tournaments.update(t.id, { lifecycleStatus: 'COMPLETED' })
    await expect(tms.setLifecycle(officer, t.id, 'LIVE', 'Protest')).rejects.toMatchObject({ code: 'reopen_forbidden' })
    await expect(tms.setLifecycle(admin, t.id, 'LIVE')).rejects.toMatchObject({ code: 'reason_required' })
    await tms.setLifecycle(admin, t.id, 'LIVE', 'Protest upheld')
    await tms.setLifecycle(admin, t.id, 'COMPLETED')
    await tms.setLifecycle(admin, t.id, 'ARCHIVED')
    await expect(tms.updateTournament(admin, t.id, { description: 'x' })).rejects.toMatchObject({ code: 'tournament_archived' })
  })

  it('holds coaches to the registration window, entry-lock deadline and soft lock, in the tournament time zone', async () => {
    const { tms, t, team, setClock } = await world({ settings: { entryLockAt: '2026-12-20' }, tournament: { timezone: 'Asia/Kolkata' } })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const coach = { uid: 'c', role: 'coach', tournamentId: t.id, teamId: team.id }
    const body = { name: 'Coach Kid', dob: '2014-05-05', gender: 'M', events: ['kumite'], weight: 31 }
    setClock('2026-10-15T10:00:00Z')
    await expect(tms.createPlayer(coach, t.id, body)).rejects.toMatchObject({ code: 'registration_not_yet_open' })
    setClock('2026-12-21T10:00:00Z')
    await expect(tms.createPlayer(coach, t.id, body)).rejects.toMatchObject({ code: 'entry_lock_deadline_passed' })
    setClock('2026-12-01T10:00:00Z')
    await tms.setSoftLock(admin, t.id, true)
    await expect(tms.createPlayer(coach, t.id, body)).rejects.toMatchObject({ code: 'entries_soft_locked' })
    // a soft lock stops coaches only
    await expect(tms.createPlayer(admin, t.id, { ...body, teamId: team.id })).resolves.toBeTruthy()
    // the coach portal says closed, and why, whenever a coach save would be refused
    expect(await tms.coachOverview(coach)).toMatchObject({ registrationOpen: false, closedReason: 'entries_soft_locked' })
    await tms.setSoftLock(admin, t.id, false, 'Late entries allowed')
    expect(await tms.coachOverview(coach)).toMatchObject({ registrationOpen: true, closedReason: null })
    setClock('2026-10-15T10:00:00Z')
    expect(await tms.coachOverview(coach)).toMatchObject({ registrationOpen: false, closedReason: 'registration_not_yet_open' })
    expect(zonedInstant('2026-12-31', 'Asia/Kolkata', { endOfDay: true }).toISOString()).toBe('2026-12-31T18:29:59.000Z')
  })

  it('hides private tournaments and lists unlisted ones only by link', async () => {
    const { tms, t, stores } = await world()
    await stores.tournaments.update(t.id, { lifecycleStatus: 'REGISTRATION_OPEN', slug: 'prd-open', settings: { publicVisibility: 'unlisted' } })
    expect(await tms.publicList()).toHaveLength(0)
    expect((await tms.publicView('prd-open')).tournament.name).toBe('PRD Open')
    await stores.tournaments.update(t.id, { settings: { publicVisibility: 'private' } })
    await expect(tms.publicView('prd-open')).rejects.toMatchObject({ code: 'tournament_not_found' })
  })
})

describe('PRD v1 §7-11 registration, age and weigh-in', () => {
  it('flags a possible duplicate for review instead of refusing or merging it', async () => {
    const { tms, t, team, add } = await world()
    await add(1)
    const again = { teamId: team.id, name: '  player 00 ', dob: '2014-01-10', gender: 'M', events: ['kumite'], weight: 30 }
    await expect(tms.createPlayer(admin, t.id, again)).rejects.toMatchObject({ code: 'possible_duplicate' })
    const p = await tms.createPlayer(admin, t.id, { ...again, confirmDuplicate: true })
    expect(p.duplicateOf).toHaveLength(1)
  })

  it('numbers teams, refuses entries for an inactive team and blocks overlapping categories', async () => {
    const { tms, t, team, g } = await world()
    expect(team.teamNumber).toBe('T-001')
    await expect(tms.teams.create(admin, t.id, { name: 'abc   dojo.' })).rejects.toMatchObject({ code: 'team_exists' })
    await tms.teams.update(admin, t.id, team.id, { active: false })
    await expect(tms.createPlayer(admin, t.id, { teamId: team.id, name: 'Late Kid', dob: '2014-01-01', gender: 'M', events: ['kata'] })).rejects.toMatchObject({ code: 'team_inactive' })
    await expect(tms.ageGroups.create(admin, t.id, { name: 'Boys 13-14', gender: 'M', minAge: 13, maxAge: 14 })).rejects.toMatchObject({ code: 'overlapping_age_group' })
    await expect(tms.ageGroups.create(admin, t.id, { name: 'Boys 13-14', gender: 'M', minAge: 13, maxAge: 14, allowOverlap: true })).resolves.toBeTruthy()
    await expect(tms.weightCategories.create(admin, t.id, { ageGroupId: g.id, name: '-33', maxWeight: 33 })).rejects.toMatchObject({ code: 'overlapping_weight_category' })
  })

  it('previews a master-date change before making it', async () => {
    const { tms, t, add } = await world()
    await add(3)
    const preview = await tms.previewMasterDateChange(t.id, '2027-06-30')
    expect(preview.changes.length).toBeGreaterThan(0)
    expect(preview.changes[0]).toMatchObject({ ageBefore: 12, ageAfter: 13 })
    await expect(tms.updateTournament(admin, t.id, { masterAgeDate: '2027-06-30' })).rejects.toMatchObject({ code: 'master_date_change_needs_confirmation' })
    await tms.updateTournament(admin, t.id, { masterAgeDate: '2027-06-30', confirmImpact: true })
  })

  it('closes weigh-in, then records only with the override privilege and a reason; checks precision', async () => {
    const { tms, t, add } = await world({ settings: { weightPrecision: 1 } })
    const [id] = await add(1)
    const weighin = { uid: 'w', role: 'weighin_officer' }
    await expect(tms.recordWeighIn(weighin, t.id, id, { actualWeight: 31.25 })).rejects.toMatchObject({ code: 'invalid_weight_precision' })
    await tms.setWeighInClosed(admin, t.id, true)
    await expect(tms.recordWeighIn(weighin, t.id, id, { actualWeight: 31.2 })).rejects.toMatchObject({ code: 'weighin_closed' })
    await expect(tms.recordWeighIn(admin, t.id, id, { actualWeight: 31.2 })).rejects.toMatchObject({ code: 'reason_required' })
    const p = await tms.recordWeighIn(admin, t.id, id, { actualWeight: 31.2, notes: 'Late arrival, approved by director' })
    expect(p.weighIn).toMatchObject({ status: 'PASSED', override: true, categoryMismatch: false })
  })

  it('keeps unweighed kumite players out of the draw unless excepted, and groups by division', async () => {
    const { tms, t, add } = await world()
    await add(3)
    await add(2, { suffix: ' N', fields: { division: 'Novice' } })
    const divs = await tms.divisions(t.id)
    expect(divs.map((d) => d.label).sort()).toEqual(['Boys 12-13 / Kumite / -35 KG', 'Boys 12-13 / Kumite / -35 KG / Novice'])
    await tms.setEntriesLock(admin, t.id, true)
    const pools = await tms.generatePools(admin, t.id, { seed: 1 })
    expect(pools).toHaveLength(0)
    expect(pools.excluded).toHaveLength(5)
  })
})

describe('PRD v1 §12-13 draw and matches', () => {
  const ready = async (opts = {}) => {
    const w = await world({ settings: { requireWeighInForDraw: false, ...opts.settings } })
    const ids = await w.add(opts.players ?? 8)
    await w.tms.setEntriesLock(admin, w.t.id, true)
    return { ...w, ids }
  }

  it('needs confirmation and the privilege to regenerate, and respects the pool maximum on moves', async () => {
    const { tms, t } = await ready({ settings: { poolSize: 4 } })
    const pools = await tms.generatePools(admin, t.id, { seed: 1 })
    expect(pools.map((p) => p.playerIds.length)).toEqual([4, 4])
    await expect(tms.generatePools(admin, t.id, { seed: 2 })).rejects.toMatchObject({ code: 'regeneration_requires_confirmation' })
    await expect(tms.generatePools(officer, t.id, { seed: 2, confirm: true })).rejects.toMatchObject({ code: 'regenerate_forbidden' })
    const again = await tms.generatePools(admin, t.id, { seed: 2, confirm: true })
    await expect(tms.movePlayer(admin, t.id, { playerId: again[0].playerIds[0], fromPoolId: again[0].id, toPoolId: again[1].id })).rejects.toMatchObject({ code: 'pool_full' })
    await tms.movePlayer(admin, t.id, { playerId: again[0].playerIds[0], fromPoolId: again[0].id, toPoolId: again[1].id, force: true, reason: 'Coach clash' })
  })

  it('splits evenly when uneven pools are not allowed, and refuses seeded draws when seeding is off', async () => {
    expect(poolSizes(18, 8, 'equal')).toEqual([6, 6, 6])
    expect(poolSizes(10, 8, 'equal')).toEqual([5, 5])
    expect(poolSizes(17, 8, 'equal')).toEqual([6, 6, 5])
    const { tms, t } = await ready({ settings: { allowSeeding: false } })
    await expect(tms.generatePools(admin, t.id, { method: 'seeded' })).rejects.toMatchObject({ code: 'seeding_disabled' })
  })

  it('decides a single entry by policy', async () => {
    const auto = await ready({ players: 1, settings: { singlePlayerPolicy: 'auto_award' } })
    expect((await auto.tms.generatePools(admin, auto.t.id)).singles).toHaveLength(1)
    expect((await auto.tms.results(auto.t.id))[0].medals.map((m) => m.medal)).toEqual(['gold'])
    const asked = await ready({ players: 1 })
    let [res] = await asked.tms.results(asked.t.id)
    expect(res).toMatchObject({ singleEntry: true, needsDecision: true, medals: [] })
    await asked.tms.decideSingleEntry(admin, asked.t.id, res.key, 'no_competition')
    ;[res] = await asked.tms.results(asked.t.id)
    expect(res).toMatchObject({ needsDecision: false, medals: [], overrideReason: 'Single entry: no competition' })
  })

  const fightPools = async (tms, t) => {
    for (const m of await tms.listMatches(t.id)) {
      if (m.stage !== 'pool' || !m.redId || !m.blueId) continue
      const red = Number(String(m.akaName).slice(-2))
      const blue = Number(String(m.aoName).slice(-2))
      await tms.correctResult(admin, t.id, m.id, { winner: red < blue ? 'red' : 'blue', avgRed: red < blue ? 3 : 0, avgBlue: red < blue ? 0 : 3 })
    }
  }

  it('qualifies on a points threshold into a master pool, keeping where each came from', async () => {
    const { tms, t } = await ready({ settings: { poolSize: 4, qualificationMode: 'points', qualificationPoints: 6, finalStage: 'master_pool' } })
    await tms.generatePools(admin, t.id, { seed: 3 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    await fightPools(tms, t)
    const [division] = await tms.divisions(t.id)
    const out = await tms.generateBracket(admin, t.id, division.key)
    expect(out.masterPool.playerIds).toHaveLength(4)
    expect(out.masterPool.sources.every((s) => s.place <= 2)).toBe(true)
    for (const m of (await tms.listMatches(t.id)).filter((x) => x.stage === 'master')) {
      await tms.correctResult(admin, t.id, m.id, { winner: 'red', avgRed: 2, avgBlue: 0 })
    }
    const [res] = await tms.results(t.id)
    expect(res.finalStage).toBe('master_pool')
    expect(res.medals.map((m) => m.medal)).toEqual(['gold', 'silver', 'bronze'])
  })

  it('plays a third-place match for one bronze', async () => {
    const { tms, t } = await ready({ settings: { poolSize: 4, thirdPlaceMatch: true } })
    await tms.generatePools(admin, t.id, { seed: 3 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    await fightPools(tms, t)
    const [division] = await tms.divisions(t.id)
    await tms.generateBracket(admin, t.id, division.key)
    for (let i = 0; i < 3; i += 1) {
      for (const m of (await tms.listMatches(t.id)).filter((x) => x.stage === 'knockout' && !x.winner && x.redId && x.blueId)) {
        await tms.correctResult(admin, t.id, m.id, { winner: 'red', avgRed: 2, avgBlue: 1 })
      }
    }
    const ko = (await tms.listMatches(t.id)).filter((x) => x.stage === 'knockout')
    expect(ko.some((m) => m.roundName === 'Third Place')).toBe(true)
    const [res] = await tms.results(t.id)
    expect(res.medals.map((m) => m.medal)).toEqual(['gold', 'silver', 'bronze'])
    expect(res.medals[2].reason).toMatch(/third-place/)
  })

  it('moves a bout through called, ready, live and paused; exceptional endings need a reason; corrections a privilege', async () => {
    const { tms, t, stores } = await ready({ players: 3 })
    await tms.generatePools(admin, t.id, { seed: 1 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    const [m] = await tms.listMatches(t.id)
    expect((await tms.callMatch({ uid: 'a', role: 'announcer' }, t.id, m.id)).status).toBe('called')
    await tms.markAttendance({ uid: 'a', role: 'announcer' }, t.id, m.id, 'aka', true)
    expect((await tms.markAttendance({ uid: 'a', role: 'announcer' }, t.id, m.id, 'ao', true)).status).toBe('ready')
    await tms.recordLiveEvent(referee, m.id, { seq: 1, cmd: 'CLOCK_START', before: {}, after: {} })
    expect((await stores.matches.get(m.id)).status).toBe('live')
    await tms.recordLiveEvent(referee, m.id, { seq: 2, cmd: 'CLOCK_STOP', before: {}, after: {} })
    expect((await stores.matches.get(m.id)).status).toBe('paused')
    await expect(tms.correctResult(referee, t.id, m.id, { winner: 'red', resultType: 'NO_SHOW' })).rejects.toMatchObject({ code: 'finish_reason_required' })
    await tms.correctResult(referee, t.id, m.id, { winner: 'red', resultType: 'NO_SHOW', finishReason: 'AO absent after three calls' })
    expect(await tms.liveCommandBlock(m.id)).toBe('match_completed')
    await expect(tms.correctResult(referee, t.id, m.id, { winner: 'blue' }, 'Wrong side')).rejects.toMatchObject({ code: 'score_correction_forbidden' })
    await tms.correctResult(admin, t.id, m.id, { winner: 'blue' }, 'Wrong side')
    expect((await tms.liveEvents(t.id, m.id)).map((e) => e.cmd)).toEqual(expect.arrayContaining(['RESULT_ENTERED', 'OFFICIAL_CORRECTION']))
  })

  it('withdraws a player after the draw: remaining bouts walked over, history kept', async () => {
    const { tms, t, ids } = await ready({ players: 3 })
    await tms.generatePools(admin, t.id, { seed: 1 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    await expect(tms.withdrawPlayer(admin, t.id, ids[0])).rejects.toMatchObject({ code: 'reason_required' })
    const p = await tms.withdrawPlayer(admin, t.id, ids[0], 'Injury')
    expect(p.registrationStatus).toBe('WITHDRAWN')
    const theirs = (await tms.listMatches(t.id)).filter((m) => m.akaPlayerId === ids[0] || m.aoPlayerId === ids[0])
    expect(theirs.every((m) => m.result?.type === 'KIKEN')).toBe(true)
  })

  it('shows why tied players were separated', async () => {
    const { tms, t } = await ready({ players: 3 })
    await tms.generatePools(admin, t.id, { seed: 1 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    const bouts = await tms.listMatches(t.id)
    // a circle: everyone wins once, so points are level and score decides
    for (const [i, m] of bouts.entries()) await tms.correctResult(admin, t.id, m.id, { winner: 'red', avgRed: 2 + i, avgBlue: 0 })
    const [res] = await tms.results(t.id)
    expect(res.pools[0].standings.filter((r) => r.tieBreak).length).toBeGreaterThan(0)
  })
})

describe('PRD v1 §16 results lifecycle', () => {
  it('runs Provisional → Verified → Published → Locked, and guards published results', async () => {
    const w = await world({ settings: { requireWeighInForDraw: false } })
    const { tms, t } = w
    await w.add(3)
    await tms.setEntriesLock(admin, t.id, true)
    await tms.generatePools(admin, t.id, { seed: 1 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    const bouts = await tms.listMatches(t.id)
    for (const m of bouts) await tms.correctResult(admin, t.id, m.id, { winner: 'red', avgRed: 2, avgBlue: 0 })
    let [res] = await tms.results(t.id)
    expect(res.resultStatus).toBe('PROVISIONAL')
    await tms.verifyResult(admin, t.id, res.key)
    ;[res] = await tms.results(t.id)
    expect(res.resultStatus).toBe('VERIFIED')
    await tms.publishResults(admin, t.id, true)
    ;[res] = await tms.results(t.id)
    expect(res.resultStatus).toBe('PUBLISHED')
    // ordinary permissions cannot change a published result
    const scorer = { uid: 'x', role: 'admin_without_override' }
    await expect(tms.correctResult(scorer, t.id, bouts[0].id, { winner: 'blue' }, 'Typo')).rejects.toMatchObject({ code: 'score_correction_forbidden' })
    await w.stores.tournaments.update(t.id, { lifecycleStatus: 'LIVE' })
    await tms.setLifecycle(admin, t.id, 'COMPLETED')
    ;[res] = await tms.results(t.id)
    expect(res.resultStatus).toBe('LOCKED')
    await expect(tms.publishResults(admin, t.id, false)).rejects.toMatchObject({ code: 'results_locked' })
  })

  it('locks and unlocks one category on its own', async () => {
    const w = await world({ settings: { requireWeighInForDraw: false } })
    const { tms, t } = w
    await w.add(2)
    await tms.setEntriesLock(admin, t.id, true)
    await tms.generatePools(admin, t.id)
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)
    const [m] = await tms.listMatches(t.id)
    await tms.correctResult(admin, t.id, m.id, { winner: 'red', avgRed: 1, avgBlue: 0 })
    let [res] = await tms.results(t.id)
    // only a published result can be locked
    await expect(tms.setDivisionLock(admin, t.id, res.key, true)).rejects.toMatchObject({ code: 'invalid_transition' })
    await tms.publishResults(admin, t.id, true)
    expect((await tms.setDivisionLock(admin, t.id, res.key, true)).status).toBe('LOCKED')
    ;[res] = await tms.results(t.id)
    expect(res.resultStatus).toBe('LOCKED')
    // frozen for everyone, the override holder included, until unlocked
    await expect(tms.correctResult(admin, t.id, m.id, { winner: 'blue', avgRed: 0, avgBlue: 1 }, 'Protest')).rejects.toMatchObject({ code: 'results_locked' })
    await expect(tms.overrideMedals(admin, t.id, res.key, [], 'Protest')).rejects.toMatchObject({ code: 'results_locked' })
    await expect(tms.setDivisionLock(officer, t.id, res.key, false, 'Protest')).rejects.toMatchObject({ code: 'result_override_forbidden' })
    await expect(tms.setDivisionLock(admin, t.id, res.key, false)).rejects.toMatchObject({ code: 'reason_required' })
    expect((await tms.setDivisionLock(admin, t.id, res.key, false, 'Protest upheld')).status).toBe('PUBLISHED')
    await tms.correctResult(admin, t.id, m.id, { winner: 'blue', avgRed: 0, avgBlue: 1 }, 'Protest upheld')
    const audit = await w.stores.auditLog.list({ tournamentId: t.id })
    expect(audit.filter((a) => a.entity === 'division' && ['results.locked', 'results.unlocked'].includes(a.action))).toHaveLength(2)
  })

  it('publishes a verified category at once in automatic mode', async () => {
    const w = await world({ settings: { requireWeighInForDraw: false, resultPublishing: 'auto' } })
    await w.add(2)
    await w.tms.setEntriesLock(admin, w.t.id, true)
    await w.tms.generatePools(admin, w.t.id)
    await w.tms.setDrawLock(admin, w.t.id, true)
    await w.tms.generateMatches(admin, w.t.id)
    const [m] = await w.tms.listMatches(w.t.id)
    expect(m.roundName).toBe('Final') // two players: a direct final
    await w.tms.correctResult(admin, w.t.id, m.id, { winner: 'red', avgRed: 1, avgBlue: 0 })
    const [res] = await w.tms.results(w.t.id)
    expect((await w.tms.verifyResult(admin, w.t.id, res.key)).status).toBe('PUBLISHED')
    expect(await w.tms.listMedals(w.t.id)).toHaveLength(2)
  })
})

describe('PRD v1 §14-15 kata judging', () => {
  it('scores only from an assigned seat, with components, penalties and post-lock override', async () => {
    expect(componentScore(8, 7, 0.7)).toBe(7.7)
    expect(kataFinal([8, 8, 8], 3, 'average', 0.5)).toBe(7.5)
    expect(rankKata([{ playerId: 'a', final: 8, scores: [8, 8, 8] }, { playerId: 'b', final: 8, scores: [9, 7.5, 7.5] }], 'lowest_kept')[0].playerId).toBe('a')
    const stores = memoryStores([...LEGACY, ...TMS_COLLECTIONS])
    const tms = createTms(stores)
    const t = await stores.tournaments.insert({ ...READY, settings: { kataJudges: 3, kataRounds: 1, kataComponents: true } })
    const g = await tms.ageGroups.create(admin, t.id, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 })
    const team = await tms.teams.create(admin, t.id, { name: 'K Dojo' })
    for (const n of ['Asha Patil', 'Bina Rao', 'Chirag Shah']) {
      const p = await tms.createPlayer(admin, t.id, { teamId: team.id, name: n, dob: '2014-03-03', gender: 'M', events: ['kata'] })
      await tms.setRegistrationStatus(admin, t.id, p.id, 'approve')
    }
    await tms.setEntriesLock(admin, t.id, true)
    const [division] = await tms.kataDivisions(t.id)
    expect(g).toBeTruthy()
    const round = await tms.createKataRound(admin, t.id, division.key, { judges: [{ seat: 1, uid: 'j1' }, { seat: 2, uid: 'j2' }, { seat: 3, uid: 'j3' }] })
    await tms.startKataRound(admin, t.id, round.id)
    const stranger = { uid: 'j9', role: 'judge', seat: 1 }
    await expect(tms.submitKataScore(stranger, t.id, round.id, { playerId: round.performerIds[0], technical: 8, athletic: 8 })).rejects.toMatchObject({ code: 'not_assigned_to_round' })
    expect((await tms.kataDivisions(t.id, { judgeUid: 'j9' }))).toHaveLength(0)
    for (const [i, pid] of round.performerIds.entries()) {
      for (const seat of [1, 2, 3]) {
        await tms.submitKataScore({ uid: `j${seat}`, role: 'judge' }, t.id, round.id, { playerId: pid, technical: 8 - i * 0.1, athletic: 7, submissionId: `${pid}-${seat}` })
      }
    }
    // the same submission again changes nothing
    await tms.submitKataScore({ uid: 'j1', role: 'judge' }, t.id, round.id, { playerId: round.performerIds[0], technical: 9.9, athletic: 9.9, submissionId: `${round.performerIds[0]}-1` })
    let view = await tms.kataRoundView(t.id, round.id)
    expect(view.rows.find((r) => r.playerId === round.performerIds[0]).bySeat[1]).toBe(7.7)
    view = await tms.setKataPenalty(admin, t.id, round.id, round.performerIds[0], 0.5, 'Loss of balance')
    expect(view.rows.find((r) => r.playerId === round.performerIds[0]).final).toBe(7.2)
    await tms.completeKataRound(admin, t.id, round.id)
    await expect(tms.overrideKataScore({ uid: 'reg', role: 'registration_officer' }, t.id, round.id, { playerId: round.performerIds[1], seat: 1, technical: 9, athletic: 9 }, 'x')).rejects.toMatchObject({ code: 'result_override_forbidden' })
    view = await tms.overrideKataScore(admin, t.id, round.id, { playerId: round.performerIds[1], seat: 1, technical: 9, athletic: 9 }, 'Scoring sheet typo')
    expect(view.rows.find((r) => r.playerId === round.performerIds[1]).bySeat[1]).toBe(9)
  })
})

describe('PRD v1 §18-19 certificates and reports', () => {
  it('issues participation, coach, official and custom certificates and verifies them', async () => {
    const w = await world({ settings: { requireWeighInForDraw: false, publicCertificates: true } })
    await w.tms.teams.update(admin, w.t.id, w.team.id, { coachName: 'Sensei Rao' })
    await w.add(3)
    await w.tms.setEntriesLock(admin, w.t.id, true)
    await w.tms.generatePools(admin, w.t.id)
    const out = await w.tms.generateCertificates(admin, w.t.id, { types: ['participation', 'coach', 'official'], officials: [{ uid: 'r1', name: 'Ref One', role: 'referee' }] })
    expect(out.created).toBe(5)
    const again = await w.tms.generateCertificates(admin, w.t.id, { types: ['participation'] })
    expect(again.created).toBe(0)
    const custom = await w.tms.issueCustomCertificate(admin, w.t.id, { name: 'Player 00', award: 'Best Fighter' })
    expect((await w.tms.verifyCertificate(custom.certificateId))).toMatchObject({ valid: true, award: 'Best Fighter', tournament: { name: 'PRD Open' } })
    await expect(w.tms.verifyCertificate('CERT-NOPE')).rejects.toMatchObject({ code: 'certificate_not_found' })
    await w.stores.tournaments.update(w.t.id, { lifecycleStatus: 'LIVE', slug: 'prd' })
    expect((await w.tms.publicCertificates('prd', 'player 01')).map((c) => c.type)).toEqual(['participation'])
  })

  it('builds the final-result, medal-tally, audit and filtered player reports', () => {
    const data = {
      players: [{ id: 'p1', name: 'A', gender: 'M', club: 'X', district: 'Pune', state: 'MH', teamId: 't', entries: {} }, { id: 'p2', name: 'B', gender: 'F', club: 'Y', teamId: 't', entries: {} }],
      teams: [{ id: 't', name: 'T' }], groups: [], weights: [], divisions: [], pools: [], matches: [{ id: 'm1', matchNumber: 'M-001' }],
      results: [{ key: 'k', label: 'Cat', event: 'kumite', resultStatus: 'PUBLISHED', medals: [{ rank: 1, medal: 'gold', name: 'A', club: 'X', reason: 'Won the final', sourceMatchId: 'm1' }] }],
      medals: [{ playerId: 'p1', medal: 'gold', club: 'X', district: 'Pune', state: 'MH', country: 'India' }],
      audit: [{ at: '2026-12-01', actorId: 'u', action: 'player.updated', entity: 'player', changes: { weight: { from: 30, to: 31 } }, reason: 'Fix' }],
    }
    expect(buildReport('final-result', data)[1]).toEqual(['Cat', 'kumite', 'PUBLISHED', 1, 'gold', 'A', 'X', 'Won the final', 'M-001'])
    expect(buildReport('medal-tally', data).filter((r) => r[0] === 'district')[0]).toEqual(['district', 'Pune', 1, 0, 0, 1])
    expect(buildReport('audit', data)[1][5]).toBe('weight: 30 → 31')
    expect(buildReport('player', data, { gender: 'F' })).toHaveLength(2)
  })
})

describe('PRD v1 §6/§14 rulesets', () => {
  it('versions a ruleset once a tournament uses it, and applies its rules', async () => {
    const stores = memoryStores([...LEGACY, ...TMS_COLLECTIONS])
    const tms = createTms(stores)
    const t = await stores.tournaments.insert({ ...READY })
    const base = (await tms.listRulesets()).find((r) => r.id === 'builtin-wkf')
    const mine = await tms.createRuleset(admin, { name: 'District rules', kumite: { ...base.kumite, matchDurationSec: 90 }, kata: base.kata })
    await expect(tms.createRuleset(admin, { name: 'Bad', kumite: { ...base.kumite, overtime: 'coin_toss' }, kata: base.kata })).rejects.toMatchObject({ code: 'invalid_ruleset' })
    const edited = await tms.updateRuleset(admin, mine.id, { kumite: { matchDurationSec: 100 } })
    expect(edited.id).toBe(mine.id) // unused: changed in place
    await tms.applyRuleset(admin, t.id, mine.id)
    expect((await stores.tournaments.get(t.id)).settings.matchDurationSec).toBe(100)
    const v2 = await tms.updateRuleset(admin, mine.id, { kumite: { matchDurationSec: 120 } })
    expect(v2).toMatchObject({ version: 2, family: mine.id })
    expect((await stores.rulesets.get(mine.id)).superseded).toBe(true)
    // the tournament keeps the version it applied
    expect((await stores.tournaments.get(t.id))).toMatchObject({ rulesetId: mine.id, rulesetVersion: 1 })
  })

  it('lets a standard ruleset be edited as a new version, and restored', async () => {
    const stores = memoryStores([...LEGACY, ...TMS_COLLECTIONS])
    const tms = createTms(stores)
    const t = await stores.tournaments.insert({ ...READY })
    await tms.applyRuleset(admin, t.id, 'builtin-wkf')
    const v2 = await tms.updateRuleset(admin, 'builtin-wkf', { kumite: { matchDurationSec: 150 } })
    expect(v2).toMatchObject({ family: 'builtin-wkf', version: 2, standard: true, name: 'WKF (standard)' })
    expect(v2.kumite.matchDurationSec).toBe(150)
    // the list shows the edited version in place of the original
    const listed = await tms.listRulesets()
    expect(listed.filter((r) => (r.family || r.id) === 'builtin-wkf').map((r) => r.version)).toEqual([2])
    // the tournament that applied the original keeps it
    expect(await stores.tournaments.get(t.id)).toMatchObject({ rulesetId: 'builtin-wkf', rulesetVersion: 1 })
    expect((await stores.tournaments.get(t.id)).settings.matchDurationSec).toBe(180)
    // the original is never edited twice: edit the current version instead
    await expect(tms.updateRuleset(admin, 'builtin-wkf', { kumite: { matchDurationSec: 160 } })).rejects.toMatchObject({ code: 'ruleset_superseded' })
    await tms.restoreStandard(admin, 'builtin-wkf')
    const back = (await tms.listRulesets()).filter((r) => (r.family || r.id) === 'builtin-wkf')
    expect(back.map((r) => r.id)).toEqual(['builtin-wkf'])
    // editing again after a restore continues the numbering
    expect((await tms.updateRuleset(admin, 'builtin-wkf', { kumite: { pointGap: 6 } })).version).toBe(3)
  })
})

describe('PRD v1 kumite rules and performance', () => {
  it('ends a tie by golden score, extra time or a draw as configured', () => {
    const tied = { scores: { aka: 2, ao: 2 }, senshu: null, penalties: { aka: { c1: 0, c2: 0 }, ao: { c1: 0, c2: 0 } } }
    expect(evaluateOutcome(tied, { ...DEFAULT_RULES, overtime: 'none' }, { expired: true })).toMatchObject({ ended: true, method: 'draw' })
    expect(evaluateOutcome(tied, { ...DEFAULT_RULES, overtime: 'golden_score' }, { expired: true })).toMatchObject({ ended: false, method: 'overtimeDue' })
    const ahead = { ...tied, scores: { aka: 3, ao: 2 } }
    expect(evaluateOutcome(ahead, { ...DEFAULT_RULES, overtime: 'golden_score' }, { inOvertime: true })).toMatchObject({ ended: true, winner: 'aka', method: 'goldenScore' })
    let st = applyCommand(initialMatchState(), 'RULES', rulesFrom({ overtime: 'golden_score', extraTimeMs: 30_000, penaltyCategories: 1, penaltyLadder: ['C1', 'C2', 'H'] }), 0)
    st = applyCommand(st, 'OVERTIME', {}, 0)
    expect(st).toMatchObject({ inOvertime: true, durationMs: 30_000 })
    st = applyCommand(st, 'PENALTY', { side: 'ao', category: 'c1', level: 3 }, 0)
    expect(evaluateOutcome(st.match, st.rules)).toMatchObject({ ended: true, winner: 'aka', method: 'hansoku' })
  })

  it('draws 5,000 entries into pools well within 30 seconds (PRD v1 §2)', () => {
    const players = Array.from({ length: 5000 }, (_, i) => ({ id: `p${i}`, teamId: `t${i % 120}`, seed: i < 64 ? i + 1 : null }))
    const started = Date.now()
    const pools = drawPools(players, { poolSize: 8, method: 'seeded', random: seededRandom(5) })
    expect(Date.now() - started).toBeLessThan(30_000)
    expect(pools.reduce((n, p) => n + p.players.length, 0)).toBe(5000)
  })
})

describe('security review: input and export helpers', () => {
  it('refuses field patterns that can backtrack forever, keeps ordinary ones', () => {
    for (const bad of ['(a+)+b', '(\\w*)*', '(x|y+){2,}', '(a)\\1']) expect(safePattern(bad)).toBeNull()
    for (const ok of ['[A-Z]{2}[0-9]{6}', '([0-9]{3})-[0-9]{4}', '(ab)+', 'KA-[0-9]+']) expect(safePattern(ok)).toBeTruthy()
  })

  it('makes spreadsheet formulas inert in exported CSV, not in imports', () => {
    expect(neutralizeFormula('=HYPERLINK("http://x","y")')).toBe(`'=HYPERLINK("http://x","y")`)
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutralizeFormula('-1+1|cmd!A0')).toBe("'-1+1|cmd!A0")
    expect(neutralizeFormula('-35 KG')).toBe('-35 KG')
    expect(neutralizeFormula('+91 98765 43210')).toBe('+91 98765 43210')
    expect(toExportCsv([['Name'], ['=1+1']])).toBe("Name\r\n'=1+1")
    expect(toCsv([['=1+1']])).toBe('=1+1')
  })
})
