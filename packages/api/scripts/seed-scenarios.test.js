import { describe, it, expect } from 'vitest'
import { createStores } from '../lib/store.js'
import { createTms } from '@kumite/shared/tms.js'
import { seedScenarios, wipeTournaments } from './seed-scenarios.js'
import { listAssignableOfficials, listCoachAccounts, createCoachAccount, deleteUser } from '../auth/users.js'

const count = (list, f) => list.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a }, {})

describe('test tournament scenarios', () => {
  it('wipes every tournament and match, then builds a tournament for each stage with every case', async () => {
    const stores = createStores()
    const quiet = () => {}
    const old = await stores.tournaments.insert({ name: 'Old Cup', location: 'X', date: '2026-01-01', template: 'kumite' })
    await stores.matches.insert({ categoryId: 'legacy', status: 'completed' })
    await stores.organizations.insert({ name: 'Kept Federation' })
    await createCoachAccount({ email: 'old.coach@test.example', password: 'coach12345', tournamentId: old.id, teamId: 'team-1' })
    // A database with no referees or judges: test officials are created for the matches.
    for (const o of await listAssignableOfficials()) if (['referee', 'judge'].includes(o.role)) await deleteUser(o.uid)

    const summary = await seedScenarios(stores, { wipe: true, log: quiet })
    expect(await stores.tournaments.get(old.id)).toBeNull()
    expect(await stores.matches.list({ categoryId: 'legacy' })).toHaveLength(0)
    expect(await stores.organizations.list({})).toHaveLength(1)
    expect(await listCoachAccounts()).toHaveLength(0)
    const officials = await listAssignableOfficials()
    expect(officials.filter((o) => o.role === 'referee').map((o) => o.email)).toEqual(['test.referee1@test.local', 'test.referee2@test.local'])
    expect(officials.filter((o) => o.role === 'judge')).toHaveLength(4)

    expect(summary.map((s) => s.status)).toEqual([
      'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_OPEN', 'VERIFICATION', 'WEIGH_IN', 'DRAW_GENERATED', 'READY', 'LIVE', 'COMPLETED', 'ARCHIVED',
    ])
    const tms = createTms(stores)
    const by = Object.fromEntries(summary.map((s) => [s.title, s.id]))
    const players = (title) => stores.players.list({ tournamentId: by[title] })

    // Registration open: every registration and payment case.
    const reg = await players('District Open')
    expect(Object.keys(count(reg, (p) => p.registrationStatus))).toEqual(expect.arrayContaining(['PAYMENT_VERIFIED', 'APPROVED', 'REJECTED', 'DRAFT', 'PENDING_VERIFICATION', 'SUBMITTED']))
    expect(Object.keys(count(reg, (p) => p.payment.status))).toEqual(expect.arrayContaining(['PAID', 'PENDING', 'FAILED', 'REFUNDED']))
    expect(reg.some((p) => p.duplicateOf)).toBe(true)
    expect(await stores.teams.list({ tournamentId: by['District Open'], active: false })).toHaveLength(1)
    // Team members with several roles each.
    const people = await stores.teamMembers.list({ tournamentId: by['District Open'] })
    expect(people.some((m) => m.roles.includes('team_manager') && m.roles.includes('coach'))).toBe(true)
    expect(people.some((m) => m.roles.includes('judge') && m.roles.includes('referee'))).toBe(true)

    // Coach links: open for the District Open only.
    const window = async (title) => tms.linkInfo((await stores.registrationLinks.list({ tournamentId: by[title] }))[0].token).catch((e) => ({ error: e.code }))
    expect(await window('District Open')).toMatchObject({ registrationOpen: true, requiresPassword: true })
    expect(await window('Monsoon Open')).toMatchObject({ registrationOpen: false })
    expect(await window('Coastal Cup')).toMatchObject({ error: 'link_disabled' })

    // Weigh-in: passed, failed, recheck, pending.
    const weigh = count((await players('Western Zone Championship')).filter((p) => p.weighIn), (p) => p.weighIn.status)
    expect(Object.keys(weigh)).toEqual(expect.arrayContaining(['PASSED', 'FAILED', 'RECHECK_REQUIRED', 'PENDING']))

    // Draw stage: pools drawn (including the 9 + 8 split), draw not locked.
    const trials = await stores.tournaments.get(by['Senior Nationals Trials'])
    expect(trials).toMatchObject({ entriesLocked: true })
    expect(trials.drawLocked).toBeFalsy()
    expect((await stores.pools.list({ tournamentId: trials.id })).map((p) => p.playerIds.length)).toEqual(expect.arrayContaining([9, 8]))

    // Live: every match state and every result type.
    const live = await tms.listMatches(by['State Championship'])
    expect(live.every((m) => m.refereeId && m.judgeIds?.length === 4)).toBe(true)
    expect(Object.keys(count(live, (m) => m.status))).toEqual(expect.arrayContaining(['scheduled', 'called', 'ready', 'open', 'live', 'paused', 'completed', 'cancelled']))
    expect(Object.keys(count(live.filter((m) => m.result), (m) => m.result.type))).toEqual(expect.arrayContaining(['COMPLETED', 'WALKOVER', 'NO_SHOW', 'KIKEN', 'DISQUALIFIED', 'MANUAL_OVERRIDE', 'CANCELLED']))
    const results = count(await tms.results(by['State Championship']), (d) => d.resultStatus)
    expect(Object.keys(results)).toEqual(expect.arrayContaining(['PROVISIONAL', 'VERIFIED', 'PUBLISHED', 'LOCKED']))
    expect((await players('State Championship')).some((p) => p.registrationStatus === 'WITHDRAWN')).toBe(true)

    // Closed: results locked and certificates issued.
    for (const title of ['Diwali Karate Cup', 'Winter Open 2025']) {
      const r = await tms.results(by[title])
      expect(r.length).toBeGreaterThan(0)
      expect(r.every((d) => d.resultStatus === 'LOCKED')).toBe(true)
      expect(Object.keys(count(await stores.certificates.list({ tournamentId: by[title] }), (c) => c.type))).toEqual(expect.arrayContaining(['gold', 'participation', 'custom']))
    }

    // Not built twice; a wipe on its own clears it all.
    expect(await seedScenarios(stores, { log: quiet })).toBeNull()
    await wipeTournaments(stores)
    expect(await stores.tournaments.list({})).toHaveLength(0)
    expect(await stores.players.list({})).toHaveLength(0)
  }, 180_000)
})
