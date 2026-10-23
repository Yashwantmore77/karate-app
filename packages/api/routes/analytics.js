import { Router } from 'express'
import { requireAuth, mayAccessTournament } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { forbidden } from '../lib/errors.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { buildAnalytics } from '@kumite/shared/analytics.js'

/**
 * Phase 2 "advanced analytics": athletes and clubs across every tournament
 * the account may see (its organisation's, or its assigned ones). Medals
 * count once results are published.
 */
export function analyticsRoutes(stores, tms) {
  const router = Router()
  router.use(requireAuth)

  router.get('/', async (req, res) => {
    if (!can(req.user.role, P.REPORT_EXPORT)) throw forbidden()
    const account = req.user.role === 'super_admin' ? { role: 'super_admin' } : await findUserRecord(req.user.uid)
    if (!account) throw forbidden()
    const reach = (await stores.tournaments.list({})).filter((t) => mayAccessTournament(account, t.id, t))
    // Every reachable tournament's data in a fixed number of reads (KAN-368).
    const events = await tms.analyticsEvents(reach)
    res.setHeader('Cache-Control', 'no-store')
    res.json(buildAnalytics(events))
  })

  return router
}
