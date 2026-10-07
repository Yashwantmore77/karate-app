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
    const events = []
    for (const tournament of await stores.tournaments.list({})) {
      if (!mayAccessTournament(account, tournament.id, tournament)) continue
      const players = await stores.players.list({ tournamentId: tournament.id })
      if (!players.length) continue
      const [teams, matches, medals] = await Promise.all([
        stores.teams.list({ tournamentId: tournament.id }), tms.listMatches(tournament.id), tms.listMedals(tournament.id),
      ])
      events.push({ tournament, players, teams, matches, medals })
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json(buildAnalytics(events))
  })

  return router
}
