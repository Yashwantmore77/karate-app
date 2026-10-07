import { Router } from 'express'
import { requireAuth, requireRole, tournamentAccess, mayAccessTournament } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { bodyReader, loadOrFail } from './resource.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { DEFAULT_SLOT_MINUTES, SLOT_MIN_MINUTES, SLOT_MAX_MINUTES } from '../lib/schedule.js'
import { tournamentProblems } from '@kumite/shared/tms.js'
import { badRequest } from '../lib/errors.js'

const DAY = { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, max: 10, nullable: true }
// PRD v1 §6: registration opens and closes at a date and time, read in the
// tournament's own time zone. A bare date still works (start / end of day).
const LOCAL_TIME = { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, max: 16, nullable: true }

const TOURNAMENT_SCHEMA = {
  name: { type: 'string', required: true, min: 3, max: 120 },
  location: { type: 'string', required: true, min: 1, max: 160 },
  // A calendar day, not an instant: a tournament is "on the 15th" everywhere,
  // and storing a timestamp would drag a timezone into that.
  date: { type: 'string', required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, max: 10 },
  template: { type: 'enum', values: ['kata', 'kumite'], required: true },
  status: { type: 'enum', values: ['draft', 'active', 'completed'], default: 'draft' },
  // How many judges sit on a panel here. Four is the usual WKF panel, but
  // smaller events run three or two, so it is the tournament's to decide.
  judgeCount: { type: 'integer', min: 1, max: 8, default: 4 },
  // How long one bout occupies its mat, and therefore everyone on it. This is
  // what makes two matches "at the same time" a question with an answer, so
  // the clash check has something to measure.
  //
  // A match stores the window it was given, so changing this moves later
  // bouts without disturbing ones already on the schedule.
  slotMinutes: {
    type: 'integer',
    min: SLOT_MIN_MINUTES,
    max: SLOT_MAX_MINUTES,
    default: DEFAULT_SLOT_MINUTES,
  },

  // PRD section 5. All optional, so the scoring app's own tournament form keeps
  // working unchanged; the PRD lifecycle lives in `lifecycleStatus`, moved only
  // through /tournaments/:id/lifecycle so every step is checked and audited.
  type: { type: 'enum', values: ['kata', 'kumite', 'kata_kumite'], nullable: true },
  slug: { type: 'string', max: 80, pattern: /^[a-z0-9-]+$/, nullable: true },
  description: { type: 'string', max: 2000, nullable: true },
  // PRD point 2: shown on the public page and accepted at registration.
  rules: { type: 'string', max: 20000, nullable: true, trim: false },
  terms: { type: 'string', max: 20000, nullable: true, trim: false },
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
  registrationStart: { ...LOCAL_TIME },
  registrationClose: { ...LOCAL_TIME },
  timezone: { type: 'string', max: 60, nullable: true },
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
    const { page, limit, q } = readPageQuery(req.query)
    const account = await findUserRecord(req.user.uid)
    // An account limited to some tournaments (PRD section 4) pages through
    // only those; everyone else pages the store directly.
    if ((account?.tournamentIds?.length || account?.organizationId) && account.role !== 'super_admin') {
      const needle = q.toLowerCase()
      const allowed = (await tournaments.list()).filter((t) => mayAccessTournament(account, t.id, t)
        && (!needle || [t.name, t.location].some((v) => String(v ?? '').toLowerCase().includes(needle))))
      const start = (page - 1) * limit
      return res.json({ tournaments: allowed.slice(start, start + limit), ...pageMeta({ page, limit, total: allowed.length }) })
    }
    const { rows, total } = await tournaments.paginate({}, {
      q, searchFields: ['name', 'location'], page, limit,
    })
    res.json({ tournaments: rows, ...pageMeta({ page, limit, total }) })
  })

  router.get('/:id', async (req, res) => {
    res.json({ tournament: await loadOrFail(tournaments, req.params.id) })
  })

  router.post('/', requireRole('admin'), async (req, res) => {
    // A tournament belongs to its creator's organisation; a super admin may
    // name one (PRD point 33).
    const { organizationId, ...rest } = req.body || {}
    const account = await findUserRecord(req.user.uid)
    const org = account?.organizationId || (req.user.role === 'super_admin' && typeof organizationId === 'string' ? organizationId.slice(0, 80) : null)
    if (org && stores.organizations && !(await stores.organizations.get(org))) return res.status(400).json({ error: 'invalid_organizationId' })
    const doc = body.forCreate(rest)
    // PRD v1 §6 field rules (lengths, dates in order, a real time zone).
    const problems = tournamentProblems(doc)
    if (problems.length) throw badRequest('invalid_tournament', { problems })
    res.status(201).json({ tournament: await tournaments.insert(org ? { ...doc, organizationId: org } : doc) })
  })

  router.patch('/:id', requireRole('admin'), async (req, res) => {
    // confirmImpact acknowledges a master-date change that re-ages players
    // (PRD v1 §9); it is an instruction, not a field.
    const { confirmImpact, ...fields } = req.body || {}
    const patch = { ...body.forPatch(fields), ...(confirmImpact === true ? { confirmImpact: true } : {}) }
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
