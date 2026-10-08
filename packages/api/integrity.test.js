import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from './index.js'
import { createUser, createCoachAccount, listCoachAccounts } from './auth/users.js'
import { FEATURES } from '@kumite/shared/features.js'

// The gaps found in the October review: every older route reaches only the
// caller's tournaments and respects the draw, the result locks and a closed
// tournament; deletions are guarded and recorded.

let http, port, stores, tms

const call = async (method, path, body, token) => {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}
const login = async (email, password = 'test123') => (await call('POST', '/auth/login', { email, password })).body.token

beforeEach(async () => {
  const app = createApp()
  ;({ http, stores, tms } = app)
  port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
})
afterEach(() => new Promise((resolve) => http.close(resolve)))

/** Two organisations, each with an admin and a tournament holding one category and bout. */
async function twoOrganisations() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`
  await createUser({ email: `root${stamp}@x.local`, password: 'password1', role: 'super_admin' })
  const root = await login(`root${stamp}@x.local`, 'password1')
  const orgA = (await call('POST', '/organizations', { name: `A ${stamp}`, slug: `a-${stamp}` }, root)).body.organization
  const orgB = (await call('POST', '/organizations', { name: `B ${stamp}`, slug: `b-${stamp}` }, root)).body.organization
  await call('POST', '/users', { email: `a${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: orgA.id }, root)
  await call('POST', '/users', { email: `b${stamp}@x.local`, password: 'password1', role: 'admin', organizationId: orgB.id }, root)
  const adminA = await login(`a${stamp}@x.local`, 'password1')
  const adminB = await login(`b${stamp}@x.local`, 'password1')
  const t = { location: 'Pune', date: '2027-01-15', template: 'kumite' }
  const tb = (await call('POST', '/tournaments', { ...t, name: 'B Open' }, adminB)).body.tournament
  const cb = (await call('POST', `/tournaments/${tb.id}/categories`, { name: 'B -60', ageGroup: 'Senior', gender: 'M', division: '-60' }, adminB)).body.category
  const red = (await call('POST', `/categories/${cb.id}/competitors`, { name: 'Red B', bib: '1', age: 20 }, adminB)).body.competitor
  const blue = (await call('POST', `/categories/${cb.id}/competitors`, { name: 'Blue B', bib: '2', age: 21 }, adminB)).body.competitor
  const mb = (await call('POST', `/categories/${cb.id}/matches`, { redId: red.id, blueId: blue.id }, adminB)).body.match
  return { root, adminA, adminB, tb, cb, red, blue, mb, stamp }
}

describe('organisation reach on the scoring routes (review 1, 2, 3)', () => {
  it('keeps another organisation\'s categories, entrants and bouts out of reach', async () => {
    const { adminA, adminB, cb, red, mb } = await twoOrganisations()
    for (const path of [`/categories/${cb.id}`, `/categories/${cb.id}/competitors`, `/competitors/${red.id}`, `/matches/${mb.id}`, `/categories/${cb.id}/matches`]) {
      expect((await call('GET', path, undefined, adminA)).status, path).toBe(403)
      expect((await call('GET', path, undefined, adminB)).status, path).toBe(200)
    }
    expect((await call('PATCH', `/categories/${cb.id}`, { name: 'Taken' }, adminA)).status).toBe(403)
    expect((await call('DELETE', `/categories/${cb.id}`, undefined, adminA)).status).toBe(403)
    expect((await call('DELETE', `/competitors/${red.id}`, undefined, adminA)).status).toBe(403)
    expect((await call('DELETE', `/matches/${mb.id}`, undefined, adminA)).status).toBe(403)
    // The event-wide list shows only the caller's own bouts.
    expect((await call('GET', '/matches', undefined, adminA)).body.total).toBe(0)
    expect((await call('GET', '/matches', undefined, adminB)).body.matches.map((m) => m.id)).toEqual([mb.id])
    expect((await call('GET', `/matches?categoryId=${cb.id}`, undefined, adminA)).status).toBe(403)
  })

  it('keeps coach sessions off the staff scoring routes', async () => {
    const { cb, tb } = await twoOrganisations()
    await createCoachAccount({ email: `coach${Date.now()}@x.local`, password: 'password1', tournamentId: tb.id, teamId: 'team-1' })
    const coach = (await listCoachAccounts()).at(-1)
    const token = await login(coach.email, 'password1')
    for (const path of ['/matches', `/categories/${cb.id}`, `/categories/${cb.id}/competitors`]) {
      expect((await call('GET', path, undefined, token)).status, path).toBe(403)
    }
  })

  it('records a deleted bout, and a fought one needs a reason (Rule 6)', async () => {
    const { adminB, mb, tb } = await twoOrganisations()
    await stores.matches.update(mb.id, { status: 'completed', winner: 'red', avgRed: 3, avgBlue: 1 })
    expect((await call('DELETE', `/matches/${mb.id}`, undefined, adminB)).body.error).toBe('correction_reason_required')
    expect((await call('DELETE', `/matches/${mb.id}?reason=${encodeURIComponent('Entered twice by mistake')}`, undefined, adminB)).status).toBe(204)
    const logged = (await stores.auditLog.list({ tournamentId: tb.id })).find((a) => a.action === 'match.deleted')
    expect(logged).toMatchObject({ entityId: mb.id, reason: 'Entered twice by mistake' })
  })
})

describe('draw, result locks and closed tournaments (review 4, 5)', () => {
  it('leaves a drawn category to its draw', async () => {
    const { adminB, cb, red, mb } = await twoOrganisations()
    await stores.categories.update(cb.id, { divisionKey: 'k1' })
    expect((await call('PATCH', `/categories/${cb.id}`, { name: 'x' }, adminB)).body.error).toBe('managed_by_draw')
    expect((await call('DELETE', `/categories/${cb.id}`, undefined, adminB)).body.error).toBe('managed_by_draw')
    expect((await call('POST', `/categories/${cb.id}/competitors`, { name: 'Late Entry', bib: '9', age: 22 }, adminB)).body.error).toBe('managed_by_draw')
    expect((await call('DELETE', `/competitors/${red.id}`, undefined, adminB)).body.error).toBe('managed_by_draw')
    expect((await call('POST', `/categories/${cb.id}/matches`, {}, adminB)).body.error).toBe('managed_by_draw')
    expect((await call('POST', `/categories/${cb.id}/matches/draw`, {}, adminB)).body.error).toBe('managed_by_draw')
    // Scheduling a drawn bout still works.
    expect((await call('PATCH', `/matches/${mb.id}`, { mat: 2 }, adminB)).status).toBe(200)
  })

  it('refuses to delete a bout of a locked draw, or a category with results', async () => {
    const { adminB, cb, mb, tb } = await twoOrganisations()
    await stores.matches.update(mb.id, { status: 'completed', winner: 'blue' })
    expect((await call('DELETE', `/categories/${cb.id}`, undefined, adminB)).body.error).toBe('category_has_results')
    await stores.categories.update(cb.id, { divisionKey: 'k1' })
    await stores.tournaments.update(tb.id, { drawLocked: true })
    expect((await call('DELETE', `/matches/${mb.id}?reason=x`, undefined, adminB)).body.error).toBe('draw_locked')
  })

  it('treats an archived tournament as read-only and a completed one as closed', async () => {
    const { adminB, cb, red, blue, mb, tb } = await twoOrganisations()
    await stores.tournaments.update(tb.id, { lifecycleStatus: 'COMPLETED' })
    expect((await call('POST', `/categories/${cb.id}/matches`, { redId: red.id, blueId: blue.id }, adminB)).body.error).toBe('tournament_completed')
    expect((await call('POST', `/tournaments/${tb.id}/categories`, { name: 'New', ageGroup: 'S', gender: 'F', division: 'x' }, adminB)).body.error).toBe('tournament_completed')
    expect(await tms.liveCommandBlock(mb.id)).toBe('tournament_closed')
    await stores.tournaments.update(tb.id, { lifecycleStatus: 'ARCHIVED' })
    expect((await call('PATCH', `/matches/${mb.id}`, { mat: 3 }, adminB)).body.error).toBe('tournament_archived')
    expect((await call('PATCH', `/categories/${cb.id}`, { name: 'x' }, adminB)).body.error).toBe('tournament_archived')
  })
})

describe('deleting a tournament (review 6)', () => {
  it('is refused while live, and otherwise removes everything it owns', async () => {
    const { adminB, tb, mb } = await twoOrganisations()
    await stores.tournaments.update(tb.id, { lifecycleStatus: 'LIVE' })
    expect((await call('DELETE', `/tournaments/${tb.id}`, undefined, adminB)).body.error).toBe('tournament_live')
    await stores.tournaments.update(tb.id, { lifecycleStatus: 'COMPLETED' })
    for (const name of ['passes', 'kataRounds', 'kataScores', 'medalOverrides', 'matchEvents', 'divisionResults']) await stores[name].insert({ tournamentId: tb.id })
    await stores.liveStates.insert({ id: mb.id, seq: 3 })
    await createCoachAccount({ email: `gone${Date.now()}@x.local`, password: 'password1', tournamentId: tb.id, teamId: 't' })

    expect((await call('DELETE', `/tournaments/${tb.id}`, undefined, adminB)).status).toBe(204)
    for (const name of ['passes', 'kataRounds', 'kataScores', 'medalOverrides', 'matchEvents', 'divisionResults']) {
      expect(await stores[name].list({ tournamentId: tb.id }), name).toHaveLength(0)
    }
    expect(await stores.liveStates.get(mb.id)).toBeNull()
    expect((await listCoachAccounts()).filter((c) => c.tournamentId === tb.id)).toHaveLength(0)
    expect((await stores.auditLog.list({ tournamentId: null })).find((a) => a.action === 'tournament.deleted' && a.entityId === tb.id)).toBeTruthy()
  })
})

describe('business rules (review 7-12)', () => {
  const coachActor = (t, teamId) => ({ uid: 'coach-x', role: 'coach', tournamentId: t.id, teamId })
  const admin = { uid: 'admin-uid-001', role: 'admin' }

  /** An open tournament with a team and one approved, paid kumite player. */
  async function openTournament() {
    const t = await stores.tournaments.insert({ name: 'Rules Cup', location: 'Pune', date: '2027-06-01', template: 'kumite' })
    await tms.updateTournament(admin, t.id, {
      type: 'kata_kumite', masterAgeDate: '2027-06-01', organizer: 'Org', venue: 'Hall', startDate: '2027-06-01', endDate: '2099-12-31',
      registrationStart: '2020-01-01', registrationClose: '2099-12-30', contactMobile: '9800000000', contactEmail: 'o@x.in',
      settings: { fees: { kata: 500, kumite: 700, both: 1000, team: 0 }, emailNotifications: false },
    })
    await tms.ageGroups.create(admin, t.id, { name: 'Seniors', gender: 'M', minAge: 18, maxAge: 40 })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const team = await tms.teams.create(admin, t.id, { name: 'Dojo One', email: 'coach@dojo.in', mobile: '9811111111' })
    const player = await tms.createPlayer(admin, t.id, { teamId: team.id, name: 'Arjun Patil', dob: '2000-03-03', gender: 'M', events: ['kumite'], weight: 70, country: 'India' })
    await tms.setRegistrationStatus(admin, t.id, player.id, 'approve')
    if (FEATURES.payments) await tms.recordPayment(admin, t.id, player.id, { status: 'PAID', method: 'UPI' })
    return { t, team, player: await stores.players.get(player.id) }
  }

  it('sends a player back to verification when the coach changes them after approval (7)', async () => {
    const { t, team, player } = await openTournament()
    const after = await tms.updatePlayer(coachActor(t, team.id), t.id, player.id, { weight: 74 })
    expect(after.registrationStatus).toBe('PENDING_VERIFICATION')
    expect((await stores.auditLog.list({ tournamentId: t.id })).some((a) => a.action === 'player.sent_for_reverification')).toBe(true)
    // An organiser's own correction does not.
    await tms.setRegistrationStatus(admin, t.id, player.id, 'approve')
    expect((await tms.updatePlayer(admin, t.id, player.id, { weight: 75 })).registrationStatus).toBe('APPROVED')
  })

  it('keeps payments off while the system is free: no fees, no payment records', async () => {
    const { t, player } = await openTournament()
    expect(player.payment).toBeNull()
    await expect(tms.recordPayment(admin, t.id, player.id, { status: 'PAID' })).rejects.toMatchObject({ code: 'payments_disabled' })
    expect((await tms.dashboard(t.id)).pendingPayment).toBe(0)
    expect((await tms.publicTournament(await stores.tournaments.get(t.id))).fees).toBeUndefined()
    const { REPORT_KEYS } = await import('@kumite/shared/reports.js')
    expect(REPORT_KEYS).not.toContain('payment')
  })

  it('shows what is still owed when events are added after payment (8, with payments switched on)', async () => {
    FEATURES.payments = true
    try {
      const { t, player } = await openTournament()
      const after = await tms.updatePlayer(admin, t.id, player.id, { events: ['kata', 'kumite'] })
      expect(after.payment).toMatchObject({ amount: 1000, paidAmount: 700, balanceDue: 300, status: 'PENDING' })
      const paid = await tms.recordPayment(admin, t.id, player.id, { status: 'PAID', amount: 1000 })
      expect(paid.payment.balanceDue).toBeUndefined()
      const fewer = await tms.updatePlayer(admin, t.id, player.id, { events: ['kata'] })
      expect(fewer.payment).toMatchObject({ amount: 500, status: 'PAID', refundDue: 500 })
    } finally {
      FEATURES.payments = false
    }
  })

  it('refuses unusable team contact details (9)', async () => {
    const { t, team } = await openTournament()
    await expect(tms.teams.create(admin, t.id, { name: 'Bad Mail', email: 'not-an-email' })).rejects.toMatchObject({ code: 'invalid_email' })
    await expect(tms.teams.update(admin, t.id, team.id, { mobile: 'call me' })).rejects.toMatchObject({ code: 'invalid_mobile' })
  })

  it('checks tournament dates against each other (10)', async () => {
    const { t } = await openTournament()
    await expect(tms.updateTournament(admin, t.id, { endDate: '2027-06-02' })).rejects.toMatchObject({ code: 'invalid_tournament' })
    await expect(tms.updateTournament(admin, t.id, { weighInDate: '2100-01-05' })).rejects.toMatchObject({ code: 'invalid_tournament' })
    // Registration may run into the event itself (on-site entries).
    await expect(tms.updateTournament(admin, t.id, { registrationClose: '2099-12-31' })).resolves.toBeTruthy()
  })

  it('protects officials still on bouts, and an admin\'s own role (11)', async () => {
    const adminToken = await login('admin@kata.local')
    const stamp = Date.now()
    const ref = (await call('POST', '/users', { email: `ref${stamp}@x.local`, password: 'password1', role: 'referee' }, adminToken)).body.user
    const m = await stores.matches.insert({ categoryId: 'c', status: 'scheduled', refereeId: ref.uid })
    expect((await call('DELETE', `/users/${ref.uid}`, undefined, adminToken)).body).toMatchObject({ error: 'official_assigned', details: { matches: 1 } })
    expect((await call('PATCH', `/users/${ref.uid}`, { role: 'judge' }, adminToken)).body.error).toBe('official_assigned')
    await stores.matches.update(m.id, { status: 'completed', winner: 'red' })
    expect((await call('DELETE', `/users/${ref.uid}`, undefined, adminToken)).status).toBe(204)
    expect((await call('PATCH', '/users/admin-uid-001', { role: 'referee' }, adminToken)).body.error).toBe('cannot_change_own_role')
  })

  it('deletes a team with players only for an organiser, with a reason (12)', async () => {
    const { t, team } = await openTournament()
    await expect(tms.teams.remove(coachActor(t, team.id), t.id, team.id)).rejects.toMatchObject({ code: 'team_has_players' })
    await expect(tms.teams.remove(admin, t.id, team.id)).rejects.toMatchObject({ code: 'reason_required' })
    await tms.teams.remove(admin, t.id, team.id, 'Club withdrew from the event')
    expect(await stores.players.list({ tournamentId: t.id })).toHaveLength(0)
  })
})

describe('loading a standard category set', () => {
  it('adds the SGFI groups in one go, and refuses when one overlaps', async () => {
    const adminToken = await login('admin@kata.local')
    const t = (await call('POST', '/tournaments', { name: 'School Games', location: 'Dewas', date: '2026-12-01', template: 'kumite', type: 'kata_kumite' }, adminToken)).body.tournament
    const loaded = await call('POST', `/tournaments/${t.id}/category-presets`, { preset: 'sgfi' }, adminToken)
    expect(loaded.status).toBe(201)
    expect(loaded.body).toEqual({ ageGroups: 6, weightCategories: 69 })
    const again = await call('POST', `/tournaments/${t.id}/category-presets`, { preset: 'sgfi' }, adminToken)
    expect(again.body).toMatchObject({ error: 'overlapping_age_group', details: { with: 'U-14 Boys' } })
    expect((await call('POST', `/tournaments/${t.id}/category-presets`, { preset: 'nope' }, adminToken)).body.error).toBe('unknown_preset')
  })

  it('loads only the age groups for a kata-only tournament', async () => {
    const adminToken = await login('admin@kata.local')
    const t = (await call('POST', '/tournaments', { name: 'School Kata', location: 'Dewas', date: '2026-12-01', template: 'kumite', type: 'kata' }, adminToken)).body.tournament
    const loaded = await call('POST', `/tournaments/${t.id}/category-presets`, { preset: 'sgfi' }, adminToken)
    expect(loaded.body).toEqual({ ageGroups: 6, weightCategories: 0 })
  })
})

describe('team members: managers, coaches, judges and referees', () => {
  it('lets a team list several people, each with one or more roles', async () => {
    const adminToken = await login('admin@kata.local')
    const t = (await call('POST', '/tournaments', { name: 'Members Cup', location: 'Dewas', date: '2026-12-01', template: 'kumite', type: 'kata_kumite' }, adminToken)).body.tournament
    const team = (await call('POST', `/tournaments/${t.id}/teams`, { name: 'Dewas Dojo', coachName: 'Vinay Patel', mobile: '9999999999' }, adminToken)).body.team
    // The coach named on the team is its first member.
    let members = (await call('GET', `/tournaments/${t.id}/team-members`, undefined, adminToken)).body.members
    expect(members).toMatchObject([{ name: 'Vinay Patel', roles: ['coach'], teamId: team.id }])

    const add = (body) => call('POST', `/tournaments/${t.id}/team-members`, { teamId: team.id, ...body }, adminToken)
    expect((await add({ name: 'Asha Rao', roles: ['team_manager', 'coach'] })).status).toBe(201)
    expect((await add({ name: 'Ravi Kumar', roles: ['referee', 'judge'], email: 'ravi@x.in' })).body.member.roles).toEqual(['judge', 'referee'])
    expect((await add({ name: 'No Role', roles: [] })).body.error).toBe('invalid_roles')
    expect((await add({ name: 'Bad Role', roles: ['captain'] })).status).toBe(400)
    expect((await add({ name: 'asha  rao', roles: ['coach'] })).body.error).toBe('member_exists')
    expect((await add({ name: 'Bad Mail', roles: ['coach'], email: 'nope' })).body.error).toBe('invalid_email')

    members = (await call('GET', `/tournaments/${t.id}/team-members`, undefined, adminToken)).body.members
    const vinay = members.find((m) => m.name === 'Vinay Patel')
    // A coach who is also a referee.
    expect((await call('PATCH', `/tournaments/${t.id}/team-members/${vinay.id}`, { roles: ['coach', 'referee'] }, adminToken)).body.member.roles).toEqual(['coach', 'referee'])

    // Passes: one each, with every role written on it.
    await call('POST', `/tournaments/${t.id}/passes/generate`, { kinds: ['coach', 'official'] }, adminToken)
    // (Staff accounts get official passes too; here only the team's people.)
    const passes = (await call('GET', `/tournaments/${t.id}/passes`, undefined, adminToken)).body.passes.filter((p) => p.team === 'Dewas Dojo')
    expect(passes.map((p) => [p.name, p.role]).sort()).toEqual([
      ['Asha Rao', 'Team Manager & Coach'], ['Ravi Kumar', 'Judge & Referee'], ['Vinay Patel', 'Coach & Referee'],
    ])
    expect(passes.find((p) => p.name === 'Ravi Kumar').kind).toBe('official')

    // Deleting the team takes its members with it.
    expect((await call('DELETE', `/tournaments/${t.id}/teams/${team.id}`, undefined, adminToken)).status).toBe(204)
    expect((await call('GET', `/tournaments/${t.id}/team-members`, undefined, adminToken)).body.members).toHaveLength(0)
  })

  it('lets a coach manage only their own team\'s members', async () => {
    const t = await stores.tournaments.insert({ name: 'Coach Members', location: 'X', date: '2027-06-01', template: 'kumite' })
    const admin = { uid: 'admin-uid-001', role: 'admin' }
    await tms.updateTournament(admin, t.id, {
      type: 'kata_kumite', masterAgeDate: '2027-06-01', organizer: 'Org', venue: 'Hall', startDate: '2027-06-01', endDate: '2099-12-31',
      registrationStart: '2020-01-01', registrationClose: '2099-12-30', contactMobile: '9800000000', contactEmail: 'o@x.in',
    })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const mine = await tms.teams.create(admin, t.id, { name: 'Mine' })
    const other = await tms.teams.create(admin, t.id, { name: 'Other' })
    const coach = { uid: 'c1', role: 'coach', tournamentId: t.id, teamId: mine.id }
    const m = await tms.teamMembers.create(coach, t.id, { teamId: other.id, name: 'Sneaky Entry', roles: ['coach'] })
    expect(m.teamId).toBe(mine.id) // a coach always adds to their own team
    const theirs = await tms.teamMembers.create(admin, t.id, { teamId: other.id, name: 'Their Coach', roles: ['coach'] })
    await expect(tms.teamMembers.remove(coach, t.id, theirs.id)).rejects.toMatchObject({ code: 'not_your_team' })
    expect((await tms.coachOverview(coach)).members.map((x) => x.name)).toEqual(['Sneaky Entry'])
  })
})

describe('arranging a bracket by hand', () => {
  it('rebuilds the first round from the arrangement, until the first bout starts', async () => {
    const adminToken = await login('admin@kata.local')
    const admin = { uid: 'admin-uid-001', role: 'admin' }
    const t = await stores.tournaments.insert({ name: 'Bracket Cup', location: 'Dewas', date: '2027-06-01', template: 'kumite' })
    await tms.updateTournament(admin, t.id, {
      type: 'kumite', masterAgeDate: '2027-06-01', organizer: 'Org', venue: 'Hall', startDate: '2027-06-01', endDate: '2099-12-31',
      registrationStart: '2020-01-01', registrationClose: '2099-12-30', contactMobile: '9800000000', contactEmail: 'o@x.in',
      settings: { poolSystem: 'knockout', requireWeighInForDraw: false, emailNotifications: false },
    })
    const g = await tms.ageGroups.create(admin, t.id, { name: 'Seniors', gender: 'M', minAge: 18, maxAge: 40 })
    await tms.weightCategories.create(admin, t.id, { ageGroupId: g.id, name: '-60 KG', maxWeight: 60 })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const team = await tms.teams.create(admin, t.id, { name: 'Dojo' })
    for (const n of ['Aarav Shah', 'Bhavin Rao', 'Chetan Iyer', 'Dev Patil', 'Eshan More']) {
      const p = await tms.createPlayer(admin, t.id, { teamId: team.id, name: n, dob: '2000-01-01', gender: 'M', events: ['kumite'], weight: 55, country: 'India' })
      await tms.setRegistrationStatus(admin, t.id, p.id, 'approve')
    }
    await tms.categorize(admin, t.id)
    await tms.setEntriesLock(admin, t.id, true)
    await tms.generatePools(admin, t.id, { seed: 1 })
    await tms.setDrawLock(admin, t.id, true)
    await tms.generateMatches(admin, t.id)

    const list = (await call('GET', `/tournaments/${t.id}/brackets`, undefined, adminToken)).body.brackets
    expect(list).toHaveLength(1)
    const key = list[0].divisionKey
    const view = (await call('GET', `/tournaments/${t.id}/bracket?divisionKey=${encodeURIComponent(key)}`, undefined, adminToken)).body.bracket
    expect(view).toMatchObject({ size: 8, started: false })
    expect(view.entries).toHaveLength(5)

    // Five players in eight places: every bout needs at least one of them.
    const ids = view.entries.map((e) => e.id)
    const put = (layout) => call('PUT', `/tournaments/${t.id}/bracket/layout`, { divisionKey: key, layout }, adminToken)
    expect((await put([...ids, null, null, null])).body.error).toBe('empty_bout')
    expect((await put([ids[0], ids[0], ids[2], null, ids[3], null, ids[4], null])).body.error).toBe('invalid_layout')
    expect((await put(ids)).body.error).toBe('invalid_layout') // not 8 places
    const good = [ids[4], ids[3], ids[2], null, ids[1], null, ids[0], null]
    const arranged = (await put(good)).body.bracket
    expect(arranged.layout).toEqual(good)
    expect(arranged.rounds[0].matches.map((m) => [m.aka?.id || null, m.ao?.id || null])).toEqual([[ids[4], ids[3]], [ids[2], null], [ids[1], null], [ids[0], null]])
    // Only the real bout exists; the three byes go straight through.
    expect((await tms.listMatches(t.id)).filter((m) => m.stage === 'knockout' && m.round === 1)).toHaveLength(1)

    // Once a bout is called to the mat, the arrangement is fixed.
    const bout = (await tms.listMatches(t.id)).find((m) => m.stage === 'knockout' && m.redId && m.blueId)
    await tms.callMatch(admin, t.id, bout.id)
    expect((await put(good)).body.error).toBe('bracket_started')
    await tms.correctResult(admin, t.id, bout.id, { winner: 'red', avgRed: 3, avgBlue: 0 })
    expect((await put(good)).body.error).toBe('bracket_started')
    expect((await stores.auditLog.list({ tournamentId: t.id })).some((a) => a.action === 'bracket.arranged')).toBe(true)
  })
})

describe('review of the October changes', () => {
  const admin = { uid: 'admin-uid-001', role: 'admin' }
  async function open(type) {
    const t = await stores.tournaments.insert({ name: `Type ${type}`, location: 'X', date: '2027-06-01', template: 'kumite' })
    await tms.updateTournament(admin, t.id, {
      type, masterAgeDate: '2027-06-01', organizer: 'Org', venue: 'Hall', startDate: '2027-06-01', endDate: '2099-12-31',
      registrationStart: '2020-01-01', registrationClose: '2099-12-30', contactMobile: '9800000000', contactEmail: 'o@x.in',
    })
    await tms.setLifecycle(admin, t.id, 'REGISTRATION_OPEN')
    const team = await tms.teams.create(admin, t.id, { name: 'Dojo' })
    return { t, team }
  }
  const player = (teamId, events) => ({ teamId, name: `P ${events.join(' ')} ${Math.random()}`, dob: '2000-01-01', gender: 'M', events, weight: 60, country: 'India' })

  it('accepts only the events a tournament holds', async () => {
    const { t, team } = await open('kumite')
    await expect(tms.createPlayer(admin, t.id, player(team.id, ['kata']))).rejects.toMatchObject({ code: 'invalid_player' })
    const p = await tms.createPlayer(admin, t.id, player(team.id, ['kumite']))
    await expect(tms.updatePlayer(admin, t.id, p.id, { events: ['kata', 'kumite'] })).rejects.toMatchObject({ code: 'invalid_player' })
    const csv = 'Name,DOB,Gender,Events,Weight,Team,Country\nAmit Rao,2000-01-01,M,Kata,60,Dojo,India\nBina Rao,2000-02-02,F,Kumite,55,Dojo,India'
    const preview = await tms.previewBulk(admin, t.id, csv)
    expect(preview.valid).toHaveLength(1)
    expect(preview.errors.some((e) => e.field === 'events' && e.row === 2)).toBe(true)
    await expect(tms.importBulk(admin, t.id, csv)).rejects.toMatchObject({ code: 'bulk_has_errors' })
  })

  it('will not change the type so it drops an event with entries; no type means both', async () => {
    const { t, team } = await open('kata_kumite')
    await tms.createPlayer(admin, t.id, player(team.id, ['kata']))
    await expect(tms.updateTournament(admin, t.id, { type: 'kumite' })).rejects.toMatchObject({ code: 'type_has_entries', details: { events: ['kata'], players: 1 } })
    await expect(tms.updateTournament(admin, t.id, { type: 'kata' })).resolves.toBeTruthy()
    const { tournamentEvents } = await import('@kumite/shared/tms.js')
    expect(tournamentEvents({ template: 'kata' })).toEqual(['kata', 'kumite'])
    expect(tournamentEvents({ type: 'kumite', template: 'kata' })).toEqual(['kumite'])
  })
})
