import { describe, it, expect, beforeEach } from 'vitest'
import { tms, setActor } from './local'
import * as legacy from '../domain/local'

// The offline build runs the shared service on this browser's storage, with
// PRD bouts written under the scoring app's historic keys. This walks the
// draw end to end through that adapter.
describe('offline tournament management', () => {
  beforeEach(() => {
    localStorage.clear()
    setActor({ uid: 'admin-uid-001', role: 'admin' })
  })

  it('takes a tournament from setup to matches the referee console can open', async () => {
    const t = await legacy.tournaments.create({ name: 'Local Open', location: 'Pune', date: '2027-01-15', template: 'kumite' })
    await tms.updateTournament(t.id, { masterAgeDate: '2027-01-01' })
    const group = await tms.ageGroups.create(t.id, { name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 })
    await tms.weightCategories.create(t.id, { ageGroupId: group.id, name: '-35 KG', maxWeight: 35 })
    const team = await tms.teams.create(t.id, { name: 'ABC' })
    for (let i = 0; i < 9; i += 1) {
      const p = await tms.players.create(t.id, { teamId: team.id, name: `P${i}`, dob: '2014-03-03', gender: 'M', events: ['kumite'], weight: 33 })
      await tms.registration(t.id, p.id, 'approve')
    }
    await tms.setLock(t.id, 'entries', true)
    const pools = await tms.generatePools(t.id, { poolSize: 8, seed: 1 })
    expect(pools.map((p) => p.playerIds.length)).toEqual([5, 4])
    await tms.setLock(t.id, 'draw', true)
    expect((await tms.generateMatches(t.id)).created).toBe(16)

    // the bouts live where the scoring app has always looked for them
    const [category] = await legacy.categories.list(t.id)
    expect(category.name).toBe('Boys 12-13 / Kumite / -35 KG')
    const bouts = await legacy.matches.list(category.id)
    expect(bouts).toHaveLength(16)
    expect(await legacy.matches.find(bouts[0].id)).toMatchObject({ redId: bouts[0].redId, stage: 'pool' })

    // and the audit trail names the person at this browser
    const trail = await tms.audit(t.id)
    expect(trail.find((a) => a.action === 'draw.locked')).toMatchObject({ actorId: 'admin-uid-001', actorRole: 'admin' })
  })

  it('opens a password-protected link for a coach and keeps them to their team', async () => {
    const t = await legacy.tournaments.create({ name: 'Local Open', location: 'Pune', date: '2027-01-15', template: 'kumite' })
    await tms.updateTournament(t.id, { masterAgeDate: '2027-01-01' })
    await tms.setLifecycle(t.id, 'REGISTRATION_OPEN')
    const link = await tms.saveLink(t.id, { password: 'secret' })
    await expect(tms.public.openLink(link.token, 'nope')).rejects.toMatchObject({ code: 'invalid_password' })
    const session = await tms.public.openLink(link.token, 'secret')
    const { session: withTeam } = await tms.coach.createTeam(session, { name: 'Dojo' })
    await tms.coach.createPlayer(withTeam, { name: 'Kid', dob: '2014-03-03', gender: 'M', events: ['kata'] })
    const me = await tms.coach.me(withTeam)
    expect(me.players).toHaveLength(1)
    expect(me.players[0].registrationStatus).toBe('SUBMITTED')
  })
})
