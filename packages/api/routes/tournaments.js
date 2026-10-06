import { Router } from 'express'
import { requireAuth, requireRole, tournamentAccess, mayAccessTournament } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { bodyReader, loadOrFail } from './resource.js'

const DAY = { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, max: 10, nullable: true }

const TOURNAMENT_SCHEMA = {
  name: { type: 'string', required: true, min: 3, max: 120 },
  location: { type: 'string', required: true, min: 1, max: 160 },
  // A calendar day, not an instant: a tournament is "on the 15th" everywhere,
  // and storing a timestamp would drag a timezone into that.
  date: { type: 'string', required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, max: 10 },
  template: { type: 'enum', values: ['kata', 'kumite'], required: true },
  status: { type: 'enum', values: ['draft', 'active', 'completed'], default: 'draft' },

  // PRD section 5. All optional, so the scoring app's own tournament form keeps
  // working unchanged; the PRD lifecycle lives in `lifecycleStatus`, moved only
  // through /tournaments/:id/lifecycle so every step is checked and audited.
  type: { type: 'enum', values: ['kata', 'kumite', 'kata_kumite'], nullable: true },
  slug: { type: 'string', max: 80, pattern: /^[a-z0-9-]+$/, nullable: true },
  description: { type: 'string', max: 2000, nullable: true },
  logoUrl: { type: 'string', max: 500, nullable: true },
  organizer: { type: 'string', max: 160, nullable: true },
  association: { type: 'string', max: 160, nullable: true },
  venue: { type: 'string', max: 160, nullable: true },
  address: { type: 'string', max: 300, nullable: true },
  city: { type: 'string', max: 80, nullable: true },
  district: { type: 'string', max: 80, nullable: true },
  state: { type: 'string', max: 80, nullable: true },
  country: { type: 'string', max: 80, nullable: true },
  contactPerson: { type: 'string', max: 120, nullable: true },
  contactMobile: { type: 'string', max: 30, nullable: true },
  contactEmail: { type: 'string', max: 200, nullable: true },
  registrationStart: { ...DAY },
  registrationClose: { ...DAY },
  weighInDate: { ...DAY },
  startDate: { ...DAY },
  endDate: { ...DAY },
  // Rule 1: every age is taken against this date, never today.
  masterAgeDate: { ...DAY },
}

export function tournamentRoutes(stores, tms) {
  const router = Router()
  const body = bodyReader(TOURNAMENT_SCHEMA)
  const { tournaments, categories, competitors, matches } = stores

  // Reading the schedule is open to any signed-in role: a judge needs to see
  // what is on before they can be sent to a mat.
  router.use(requireAuth)

  router.param('id', tournamentAccess(findUserRecord))

  router.get('/', async (req, res) => {
    // A coach session belongs to one tournament and reads it through /coach.
    if (req.user.role === 'coach') return res.status(403).json({ error: 'forbidden' })
    const account = await findUserRecord(req.user.uid)
    const rows = await tournaments.list()
    res.json({ tournaments: rows.filter((t) => mayAccessTournament(account, t.id)) })
  })

  router.get('/:id', async (req, res) => {
    res.json({ tournament: await loadOrFail(tournaments, req.params.id) })
  })

  router.post('/', requireRole('admin'), async (req, res) => {
    res.status(201).json({ tournament: await tournaments.insert(body.forCreate(req.body)) })
  })

  router.patch('/:id', requireRole('admin'), async (req, res) => {
    const patch = body.forPatch(req.body)
    await loadOrFail(tournaments, req.params.id)
    // Through the service, so a master-date change re-ages every player and is
    // refused once entries are locked.
    res.json({ tournament: await tms.updateTournament(req.user, req.params.id, patch) })
  })

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(tournaments, req.params.id)

    // Cascade by hand: the store has no foreign keys, so dropping a tournament
    // without its descendants would leave categories, competitors and matches
    // that no screen can reach and no query will ever clean up.
    const owned = await categories.list({ tournamentId: req.params.id })
    for (const category of owned) {
      await competitors.removeWhere({ categoryId: category.id })
      await matches.removeWhere({ categoryId: category.id })
    }
    await categories.removeWhere({ tournamentId: req.params.id })
    await tms.purgeTournament(req.params.id)
    await tournaments.remove(req.params.id)

    res.status(204).end()
  })

  return router
}
