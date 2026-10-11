import { Router } from 'express'
import { listAssignableOfficials, findUserRecord } from '../auth/users.js'
import { requireAuth, requireTournamentAdmin } from '../auth/middleware.js'
import { badRequest } from '../lib/errors.js'

const SELECTABLE = ['referee', 'judge', 'admin', 'tournament_owner']

/**
 * Who can be put on a match.
 *
 * Separate from /users on purpose. Building a panel is ordinary referee work,
 * but the account roster is an administrator's surface — it exists to create,
 * demote and delete people. This returns only what a picker needs to show a
 * name and nothing that would let a referee act on an account.
 */
export function officialRoutes() {
  const router = Router()
  router.use(requireAuth, requireTournamentAdmin('referee'))

  router.get('/', async (req, res) => {
    const { role } = req.query
    if (role !== undefined && !SELECTABLE.includes(role)) throw badRequest('invalid_role')

    // An account inside an organisation picks from that organisation's people.
    const organizationId = req.user.role === 'super_admin'
      ? null
      : (await findUserRecord(req.user.uid))?.organizationId || null
    const officials = await listAssignableOfficials({ organizationId })
    res.json({ officials: role ? officials.filter((o) => o.role === role) : officials })
  })

  return router
}
