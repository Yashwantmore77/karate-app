import { Router } from 'express'
import { requireAuth, mayAccessTournament } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { forbidden } from '../lib/errors.js'
import { validate } from '../lib/validate.js'
import { withMeta } from './tms.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { buildAnalytics } from '@kumite/shared/analytics.js'

const LINK = {
  kind: { type: 'enum', values: ['same', 'apart'], required: true },
  playerIds: { type: 'array', items: { type: 'string', max: 80 }, maxItems: 2, unique: true, required: true },
}

/**
 * Phase 2 "advanced analytics": athletes and clubs across every tournament
 * the account may see (its organisation's, or its assigned ones). Medals
 * count once results are published. An organiser can say which player
 * records are one athlete where name and birthday get it wrong (KAN-369).
 */
export function analyticsRoutes(stores, tms) {
  const router = Router()
  router.use(requireAuth)

  // The tournaments this account may see, once it holds `permission`.
  const reachOf = async (req, permission) => {
    if (!can(req.user.role, permission)) throw forbidden()
    const account = req.user.role === 'super_admin' ? { role: 'super_admin' } : await findUserRecord(req.user.uid)
    if (!account) throw forbidden()
    return (await stores.tournaments.list({})).filter((t) => mayAccessTournament(account, t.id, t))
  }
  const reaches = (tournaments) => {
    const ids = new Set(tournaments.map((t) => t.id))
    return (tournamentId) => ids.has(tournamentId)
  }

  router.get('/', async (req, res) => {
    const reach = await reachOf(req, P.REPORT_EXPORT)
    // Every reachable tournament's data in a fixed number of reads (KAN-368).
    const [events, links] = await Promise.all([tms.analyticsEvents(reach), tms.athleteLinks()])
    res.setHeader('Cache-Control', 'no-store')
    res.json(buildAnalytics(events, links))
  })

  router.post('/athlete-links', async (req, res) => {
    const reach = await reachOf(req, P.TOURNAMENT_MANAGE)
    const link = await tms.addAthleteLink(withMeta(req), validate(req.body, LINK), { reaches: reaches(reach) })
    res.status(201).json({ link })
  })

  router.delete('/athlete-links/:id', async (req, res) => {
    const reach = await reachOf(req, P.TOURNAMENT_MANAGE)
    await tms.removeAthleteLink(withMeta(req), req.params.id, { reaches: reaches(reach) })
    res.status(204).end()
  })

  return router
}
