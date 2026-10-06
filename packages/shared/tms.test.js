import { describe, it, expect, beforeEach } from 'vitest'
import { createTms, TMS_COLLECTIONS, divisionKey } from './tms.js'
import { memoryStores } from './memoryStore.js'
import { poolSizes, drawPools, roundRobin, poolName, seededRandom } from './pools.js'
import { poolStandings, buildBracket, seedOrder, bracketMedals, medalTally, qualifierSeeds } from './results.js'
import { validatePlayer, parseCsv, validateBulkRows, publicPlayer, normalizeForm, DEFAULT_FIELDS } from './registration.js'
import { hashSecret, verifySecret } from './secret.js'
import { can, PERMISSION } from './permissions.js'

const LEGACY = ['tournaments', 'categories', 'competitors', 'matches']
const admin = { uid: 'admin-1', role: 'admin' }

describe('pools (Rules 3-4)', () => {
  it('uses the configured size and splits evenly', () => {
    expect(poolSizes(8, 8)).toEqual([8])
    expect(poolSizes(16, 8)).toEqual([8, 8])
    expect(poolSizes(20, 8)).toEqual([7, 7, 6])
    expect(poolSizes(10, 8)).toEqual([5, 5])
    expect(poolSizes(10, 4)).toEqual([4, 3, 3])
  })

  it('names pools A..Z then AA', () => {
    expect(poolName(0)).toBe('A')
    expect(poolName(25)).toBe('Z')
    expect(poolName(26)).toBe('AA')
  })

  it('places every player exactly once and keeps clubmates apart where it can', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, teamId: i < 2 ? 'same' : `t${i}` }))
    const pools = drawPools(players, { poolSize: 8, random: seededRandom(7) })
    expect(pools.map((p) => p.players.length)).toEqual([5, 5])
    expect(pools.flatMap((p) => p.players.map((x) => x.id)).sort()).toEqual(players.map((p) => p.id).sort())
    const poolOf = (id) => pools.findIndex((p) => p.players.some((x) => x.id === id))
    expect(poolOf('p0')).not.toBe(poolOf('p1'))
  })

  it('snakes seeds so seeds 1 and 2 land in different pools', () => {
    const players = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, seed: i < 4 ? i + 1 : null }))
    const pools = drawPools(players, { poolSize: 8, method: 'seeded', random: seededRandom(1) })
    const poolOf = (id) => pools.findIndex((p) => p.players.some((x) => x.id === id))
    expect(poolOf('p0')).not.toBe(poolOf('p1'))
    expect(poolOf('p0')).toBe(poolOf('p3'))
  })

  it('is reproducible from its seed', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` }))
    const a = drawPools(players, { poolSize: 4, random: seededRandom(42) })
    const b = drawPools(players, { poolSize: 4, random: seededRandom(42) })
    expect(a).toEqual(b)
  })

  it('pairs everyone once and balances corners', () => {
    const bouts = roundRobin(['a', 'b', 'c', 'd', 'e'])
    expect(bouts).toHaveLength(10)
    const pairs = new Set(bouts.map((b) => [b.aka, b.ao].sort().join()))
    expect(pairs.size).toBe(10)
    const akaCounts = ['a', 'b', 'c', 'd', 'e'].map((id) => bouts.filter((b) => b.aka === id).length)
    expect(Math.max(...akaCounts) - Math.min(...akaCounts)).toBeLessThanOrEqual(1)
  })
})

describe('results', () => {
  const bout = (aka, ao, winner, akaScore = 0, aoScore = 0) =>
    ({ aka, ao, status: 'completed', winner, avgRed: akaScore, avgBlue: aoScore })

  it('ranks by points and breaks a tie head to head', () => {
    const rows = poolStandings(['a', 'b', 'c'], [
      bout('a', 'b', 'red', 3, 1), bout('b', 'c', 'red', 2, 0), bout('c', 'a', 'red', 4, 0),
    ])
    // all three are 1-1; a beat b, b beat c, c beat a, so score difference decides
    expect(rows.map((r) => r.points)).toEqual([3, 3, 3])
    expect(rows[0].id).toBe('c')
    expect(rows.every((r) => r.played === 2)).toBe(true)
  })

  it('marks the configured number of qualifiers', () => {
    const rows = poolStandings(['a', 'b', 'c'], [bout('a', 'b', 'red'), bout('a', 'c', 'red'), bout('b', 'c', 'red')], { qualifiersPerPool: 1 })
    expect(rows.filter((r) => r.qualified).map((r) => r.id)).toEqual(['a'])
  })

  it('seeds a bracket so 1 and 2 meet only in the final', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    const bracket = buildBracket([{ id: 'A1' }, { id: 'B1' }, { id: 'A2' }, { id: 'B2' }])
    const semis = bracket.filter((m) => m.round === 1)
    expect(semis.map((m) => [m.aka, m.ao])).toEqual([['A1', 'B2'], ['B1', 'A2']])
    expect(bracket.find((m) => m.round === 2).name).toBe('Final')
  })

  it('crosses pool qualifiers', () => {
    const seeds = qualifierSeeds([
      { pool: 'A', standings: [{ id: 'a1', played: 1 }, { id: 'a2', played: 1 }] },
      { pool: 'B', standings: [{ id: 'b1', played: 1 }, { id: 'b2', played: 1 }] },
    ], 2)
    expect(seeds.map((s) => s.id)).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('gives gold, silver and two bronzes from a bracket', () => {
    const medals = bracketMedals([
      { round: 1, aka: 'a', ao: 'd', status: 'completed', winner: 'red' },
      { round: 1, aka: 'b', ao: 'c', status: 'completed', winner: 'blue' },
      { round: 2, aka: 'a', ao: 'c', status: 'completed', winner: 'blue' },
    ])
    expect(medals).toEqual([
      { id: 'c', rank: 1, medal: 'gold' }, { id: 'a', rank: 2, medal: 'silver' },
      { id: 'd', rank: 3, medal: 'bronze' }, { id: 'b', rank: 3, medal: 'bronze' },
    ])
  })

  it('tallies by club, gold first', () => {
    const tally = medalTally([
      { club: 'XYZ', medal: 'silver' }, { club: 'ABC', medal: 'gold' }, { club: 'XYZ', medal: 'silver' },
    ])
    expect(tally[0]).toMatchObject({ name: 'ABC', gold: 1, total: 1 })
    expect(tally[1]).toMatchObject({ name: 'XYZ', silver: 2, total: 2 })
  })
})

describe('registration form and bulk upload', () => {
  it('normalises a player and reports what is wrong', () => {
    const ok = validatePlayer({ name: 'Rahul', dob: '15/06/2014', gender: 'Boy', events: 'Kata + Kumite', weight: '34.5' })
    expect(ok.errors).toEqual([])
    expect(ok.player).toMatchObject({ dob: '2014-06-15', gender: 'M', events: ['kata', 'kumite'], weight: 34.5 })

    const bad = validatePlayer({ name: '', dob: '31/02/2014', gender: 'x', events: 'judo', email: 'nope' })
    expect(bad.errors.map((e) => e.field).sort()).toEqual(['dob', 'email', 'events', 'gender', 'name'])
  })

  it('needs a weight for kumite only', () => {
    expect(validatePlayer({ name: 'A', dob: '2014-01-01', gender: 'M', events: ['kata'] }).errors).toEqual([])
    expect(validatePlayer({ name: 'A', dob: '2014-01-01', gender: 'M', events: ['kumite'] }).errors[0].field).toBe('weight')
  })

  it('keeps system fields in an edited form', () => {
    const form = normalizeForm([{ key: 'name', label: 'Full name' }, { key: 'tshirt', label: 'T-shirt', type: 'dropdown', options: ['S', 'M'] }])
    expect(form.find((f) => f.key === 'name').label).toBe('Full name')
    expect(form.find((f) => f.key === 'dob')).toBeTruthy()
    expect(form.find((f) => f.key === 'tshirt').builtIn).toBe(false)
  })

  it('previews a CSV with row-level errors and duplicates', () => {
    const csv = 'Team,Player Name,DOB,Gender,Event,Weight (kg)\nABC,Rahul,2014-06-15,M,kumite,34\nABC,Rahul,2014-06-15,M,kumite,34\nNOPE,Amit,bad,M,kata,\n'
    const { valid, errors } = validateBulkRows(parseCsv(csv), { teams: [{ id: 't1', name: 'ABC' }] })
    expect(valid).toHaveLength(1)
    expect(errors.map((e) => `${e.row}:${e.field}`)).toEqual(['3:name', '4:dob', '4:team'])
  })

  it('parses quoted CSV cells', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']])
  })

  it('never lets a private field through to the public (Rule 8)', () => {
    const shown = publicPlayer({ id: '1', name: 'R', mobile: '9999', email: 'a@b.c', fatherName: 'F', motherName: 'M', idProof: 'x', dob: '2014-01-01', club: 'ABC' })
    expect(Object.keys(shown).sort()).toEqual(['club', 'id', 'name'])
  })

  it('has every default field from section 12', () => {
    expect(DEFAULT_FIELDS.map((f) => f.label)).toEqual(expect.arrayContaining(['Player Name', 'Father Name', 'Federation ID', 'Belt']))
  })
})

describe('secrets and permissions', () => {
  it('hashes and verifies a link password', async () => {
    const stored = await hashSecret('dojo2027')
    expect(await verifySecret('dojo2027', stored)).toBe(true)
    expect(await verifySecret('wrong', stored)).toBe(false)
  })

  it('keeps referees out of configuration', () => {
    expect(can('referee', PERMISSION.MATCH_SCORE)).toBe(true)
    expect(can('referee', PERMISSION.CATEGORY_CONFIGURE)).toBe(false)
    expect(can('weighin_officer', PERMISSION.WEIGHIN_RECORD)).toBe(true)
  })
})

// --- section 64: the acceptance flow, end to end ------------------------------

describe('section 64 core flow', () => {
  let stores, tms, tournament, coach, ageGroup, w35

  beforeEach(async () => {
    stores = memoryStores([...LEGACY, ...TMS_COLLECTIONS])
    tms = createTms(stores, { now: () => new Date('2026-12-01T10:00:00Z') })
    tournament = await stores.tournaments.insert({ name: 'State Open', location: 'Pune', date: '2027-01-15', template: 'kumite', status: 'draft' })
  })

  const setUp = async () => {
    await tms.updateTournament(admin, tournament.id, { masterAgeDate: '2027-01-01', type: 'kumite', settings: { poolSize: 8 } })
    ageGroup = await tms.ageGroups.create(admin, tournament.id, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 })
    w35 = await tms.weightCategories.create(admin, tournament.id, { ageGroupId: ageGroup.id, name: '-35 KG', maxWeight: 35 })
    await tms.weightCategories.create(admin, tournament.id, { ageGroupId: ageGroup.id, name: '-40 KG', minWeight: 35, maxWeight: 40 })
    await tms.setLifecycle(admin, tournament.id, 'REGISTRATION_OPEN')
    const link = await tms.saveLink(admin, tournament.id, { password: 'open-sesame' })
    const session = await tms.openLink(link.token, 'open-sesame')
    coach = { uid: `coach:${session.linkId}`, role: 'coach', tournamentId: session.tournamentId }
    const team = await tms.teams.create(coach, tournament.id, { name: 'ABC Karate', club: 'ABC Karate', state: 'MH' })
    coach = { ...coach, teamId: team.id }
    for (let i = 0; i < 10; i += 1) {
      await tms.createPlayer(coach, tournament.id, {
        name: `Player ${i}`, dob: `2014-0${(i % 9) + 1}-10`, gender: 'M', events: ['kumite'], weight: 30 + (i % 5),
      })
    }
    return team
  }

  it('runs from an empty tournament to a certificate', async () => {
    await setUp()

    // the link refuses the wrong password
    const { token } = await tms.getLink(tournament.id)
    await expect(tms.openLink(token, 'nope')).rejects.toMatchObject({ code: 'invalid_password' })

    // approve, then ages come from the master date (Rule 1) and categories follow (Rule 2)
    let players = await tms.listPlayers(tournament.id)
    expect(players).toHaveLength(10)
    for (const p of players) await tms.setRegistrationStatus(admin, tournament.id, p.id, 'approve')
    players = await tms.listPlayers(tournament.id)
    expect(players.every((p) => p.registrationStatus === 'APPROVED')).toBe(true)
    expect(players.every((p) => p.age === 12)).toBe(true)
    expect(players.every((p) => p.entries.kumite.weightCategoryId === w35.id)).toBe(true)
    expect(players[0].entries.kumite.divisionKey).toBe(divisionKey('kumite', ageGroup.id, w35.id))

    await tms.categorize(admin, tournament.id)
    const [division] = await tms.divisions(tournament.id)
    expect(division).toMatchObject({ label: 'Boys 12-13 / Kumite / -35 KG', count: 10 })

    // pools need locked entries; locking is audited
    await expect(tms.generatePools(admin, tournament.id)).rejects.toMatchObject({ code: 'entries_not_locked' })
    await tms.setLifecycle(admin, tournament.id, 'REGISTRATION_CLOSED')
    await tms.setLifecycle(admin, tournament.id, 'VERIFICATION')
    await tms.setEntriesLock(admin, tournament.id, true)
    await expect(tms.createPlayer(admin, tournament.id, { teamId: coach.teamId, name: 'Late', dob: '2014-01-01', gender: 'M', events: ['kumite'], weight: 33 }))
      .rejects.toMatchObject({ code: 'entries_locked' })

    const pools = await tms.generatePools(admin, tournament.id, { seed: 3 })
    expect(pools.map((p) => [p.name, p.playerIds.length])).toEqual([['A', 5], ['B', 5]])

    // matches need the draw confirmed
    await expect(tms.generateMatches(admin, tournament.id)).rejects.toMatchObject({ code: 'draw_not_locked' })
    await tms.setDrawLock(admin, tournament.id, true)
    await expect(tms.movePlayer(admin, tournament.id, { playerId: pools[0].playerIds[0], fromPoolId: pools[0].id, toPoolId: pools[1].id }))
      .rejects.toMatchObject({ code: 'draw_locked' })
    const { created } = await tms.generateMatches(admin, tournament.id)
    expect(created).toBe(20) // two pools of five: 10 bouts each

    // AKA / AO are stored on the bout, and the bout lands in the scoring app's own records
    const matches = await tms.listMatches(tournament.id)
    expect(matches[0]).toMatchObject({ matchNumber: 'M-001', stage: 'pool', poolName: 'A' })
    expect(matches[0].akaName).toBeTruthy()
    expect(matches[0].aoName).toBeTruthy()
    const [category] = await stores.categories.list({ tournamentId: tournament.id })
    expect(category.name).toBe('Boys 12-13 / Kumite / -35 KG')

    // the referee console records results as red (AKA) / blue (AO)
    for (const m of matches) {
      await stores.matches.update(m.id, { status: 'completed', winner: m.akaPlayerId < m.aoPlayerId ? 'red' : 'blue', avgRed: 3, avgBlue: 1 })
    }

    let res = await tms.results(tournament.id)
    expect(res[0].pools.every((p) => p.complete)).toBe(true)
    expect(res[0].pools[0].standings[0].rank).toBe(1)
    expect(res[0].canGenerateBracket).toBe(true)

    // the final stage: top two from each pool, semis then the final
    const bracket = await tms.generateBracket(admin, tournament.id, division.key)
    expect(bracket.rounds.map((r) => r.name)).toEqual(['Semi Final', 'Final'])
    let knockout = (await tms.listMatches(tournament.id)).filter((m) => m.stage === 'knockout')
    expect(knockout).toHaveLength(2)
    for (const m of knockout) await stores.matches.update(m.id, { status: 'completed', winner: 'red', avgRed: 2, avgBlue: 0 })
    await tms.syncBracket(tournament.id, division.key)
    knockout = (await tms.listMatches(tournament.id)).filter((m) => m.stage === 'knockout')
    expect(knockout).toHaveLength(3)
    const final = knockout.find((m) => m.roundName === 'Final')
    expect(final.akaName).toBeTruthy()

    // Rule 6: changing a finished result needs a reason
    await stores.matches.update(final.id, { status: 'completed', winner: 'blue', avgRed: 1, avgBlue: 2 })
    await expect(tms.correctResult(admin, tournament.id, final.id, { winner: 'red', avgRed: 4, avgBlue: 2 }))
      .rejects.toMatchObject({ code: 'correction_reason_required' })
    await tms.correctResult(admin, tournament.id, final.id, { winner: 'red', avgRed: 4, avgBlue: 2 }, 'Video review')

    res = await tms.results(tournament.id)
    expect(res[0].medals.map((m) => m.medal)).toEqual(['gold', 'silver', 'bronze', 'bronze'])
    expect(res[0].medals[0].name).toBe(final.akaName)

    // publish, tally, certificate
    await expect(tms.generateCertificates(admin, tournament.id)).rejects.toMatchObject({ code: 'results_not_published' })
    await tms.publishResults(admin, tournament.id)
    expect(await tms.tally(tournament.id, 'club')).toEqual([{ name: 'ABC Karate', gold: 1, silver: 1, bronze: 2, total: 4 }])
    const { certificates } = await tms.generateCertificates(admin, tournament.id)
    expect(certificates).toHaveLength(4)
    expect(new Set(certificates.map((c) => c.certificateId)).size).toBe(4)

    // the public sees results but nothing private (Rule 8)
    const view = await tms.publicView(tournament.id)
    expect(view.medals).toHaveLength(4)
    expect(JSON.stringify(view)).not.toMatch(/"dob"|"mobile"|"email"|fatherName|motherName/)

    // and every critical step left an audit record
    const actions = (await tms.auditTrail(tournament.id)).map((a) => a.action)
    expect(actions).toEqual(expect.arrayContaining([
      'entries.locked', 'pools.generated', 'draw.locked', 'matches.generated', 'match.result_changed',
      'results.published', 'certificates.generated', 'registration.status_changed',
    ]))
  })

  it('stops a coach once entries lock (Rule 7) and keeps them to their own team', async () => {
    const team = await setUp()
    const other = await tms.teams.create(admin, tournament.id, { name: 'XYZ Dojo' })
    const [player] = await tms.listPlayers(tournament.id, { teamId: team.id })
    await expect(tms.createPlayer({ ...coach, teamId: other.id }, tournament.id, { name: 'X', dob: '2014-01-01', gender: 'M', events: ['kata'] }))
      .resolves.toBeTruthy()
    await expect(tms.updatePlayer({ ...coach, teamId: other.id }, tournament.id, player.id, { name: 'Hijack' }))
      .rejects.toMatchObject({ code: 'not_your_team' })
    await tms.setEntriesLock(admin, tournament.id, true)
    await expect(tms.updatePlayer(coach, tournament.id, player.id, { name: 'Renamed' }))
      .rejects.toMatchObject({ code: 'entries_locked' })
    await expect(tms.setEntriesLock(admin, tournament.id, false)).rejects.toMatchObject({ code: 'reason_required' })
    await tms.setEntriesLock(admin, tournament.id, false, 'Late correction')
    expect((await tms.auditTrail(tournament.id))[0]).toMatchObject({ action: 'entries.unlocked', reason: 'Late correction' })
  })

  it('records a category override and a weigh-in move in the audit log', async () => {
    await setUp()
    const [player] = await tms.listPlayers(tournament.id)
    await tms.setRegistrationStatus(admin, tournament.id, player.id, 'approve')
    const moved = await tms.recordWeighIn(admin, tournament.id, player.id, { actualWeight: 37.2 })
    expect(moved.weighIn).toMatchObject({ status: 'PASSED', actualWeight: 37.2 })
    expect(moved.entries.kumite.weightCategoryId).not.toBe(w35.id)

    await expect(tms.overrideCategory(admin, tournament.id, player.id, 'kumite', { ageGroupId: ageGroup.id, weightCategoryId: w35.id }))
      .rejects.toMatchObject({ code: 'reason_required' })
    const over = await tms.overrideCategory(admin, tournament.id, player.id, 'kumite', { ageGroupId: ageGroup.id, weightCategoryId: w35.id }, 'Referee committee decision')
    expect(over.entries.kumite).toMatchObject({ override: true, weightCategoryId: w35.id })
    const trail = (await tms.auditTrail(tournament.id)).filter((a) => a.entityId === player.id).map((a) => a.action)
    expect(trail).toEqual(expect.arrayContaining(['weighin.recorded', 'player.category_overridden']))
  })

  it('requires a reason to reject, and tells the team', async () => {
    await setUp()
    const [player] = await tms.listPlayers(tournament.id)
    await expect(tms.setRegistrationStatus(admin, tournament.id, player.id, 'reject')).rejects.toMatchObject({ code: 'rejection_reason_required' })
    const rejected = await tms.setRegistrationStatus(admin, tournament.id, player.id, 'reject', 'DOB proof missing')
    expect(rejected).toMatchObject({ registrationStatus: 'REJECTED', rejectionReason: 'DOB proof missing' })
    const overview = await tms.coachOverview(coach)
    expect(overview.notifications[0].message).toMatch(/DOB proof missing/)
  })

  it('imports a clean bulk file and refuses one with errors', async () => {
    await setUp()
    const bad = 'Player Name,DOB,Gender,Event,Weight (kg)\nNew One,2014-02-02,M,kumite,\n'
    await expect(tms.importBulk(coach, tournament.id, bad)).rejects.toMatchObject({ code: 'bulk_has_errors' })
    const good = 'Player Name,DOB,Gender,Event,Weight (kg)\nNew One,2014-02-02,M,kumite,33\nNew Two,2013-03-03,M,kata,\n'
    const { created } = await tms.importBulk(coach, tournament.id, good)
    expect(created).toBe(2)
    expect(await tms.listPlayers(tournament.id)).toHaveLength(12)
  })

  it('will not change the master date once entries are locked', async () => {
    await setUp()
    await tms.setEntriesLock(admin, tournament.id, true)
    await expect(tms.updateTournament(admin, tournament.id, { masterAgeDate: '2028-01-01' })).rejects.toMatchObject({ code: 'entries_locked' })
  })

  it('refuses an illegal lifecycle jump', async () => {
    await expect(tms.setLifecycle(admin, tournament.id, 'LIVE')).rejects.toMatchObject({ code: 'invalid_transition' })
    await expect(tms.setLifecycle(admin, tournament.id, 'REGISTRATION_OPEN')).rejects.toMatchObject({ code: 'master_age_date_required' })
  })
})

describe('tournament rules on the console (section 29) and result types (section 27)', () => {
  it('sets a match up under the tournament rules, but never mid-bout', async () => {
    const { initialMatchState, applyCommand, withOutcome } = await import('./commands.js')
    let s = applyCommand(initialMatchState(), 'RULES', { durationMs: 120_000, pointGap: 5 }, 0)
    expect(s.durationMs).toBe(120_000)
    expect(s.clock.remainingMs).toBe(120_000)
    s = applyCommand(s, 'SCORE', { side: 'aka', type: 'ippon' }, 1)
    s = applyCommand(s, 'SCORE', { side: 'aka', type: 'wazaAri' }, 2)
    // 5-point gap ends it under these rules, where the default needs 8
    expect(withOutcome(s, undefined, 3).outcome).toMatchObject({ ended: true, winner: 'aka', method: 'gapRule' })
    expect(applyCommand(s, 'RULES', { durationMs: 60_000, pointGap: 8 }, 4)).toBe(s)
  })

  it('refuses rules a tournament could not have set', async () => {
    const { rulesFrom } = await import('./commands.js')
    expect(rulesFrom({ durationMs: 5, pointGap: -1 })).toMatchObject({ durationMs: 180_000, pointGap: 8 })
  })

  it('records walkovers and cancellations, and a cancelled bout counts for nobody', async () => {
    const { boutOutcome, poolComplete } = await import('./results.js')
    expect(boutOutcome({ status: 'completed', winner: 'red', result: { type: 'WALKOVER' } }).winner).toBe('aka')
    expect(boutOutcome({ status: 'cancelled', winner: null })).toBeNull()
    expect(poolComplete([{ status: 'completed', winner: 'red' }, { status: 'cancelled' }])).toBe(true)
  })
})
