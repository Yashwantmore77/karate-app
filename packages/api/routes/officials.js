import { Router } from 'express'
import { listAssignableOfficials } from '../auth/users.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { badRequest } from '../lib/errors.js'

const SELECTABLE = ['referee', 'judge', 'admin']

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
  router.use(requireAuth, requireRole('referee'))

  router.get('/', async (req, res) => {
    const { role } = req.query
    if (role !== undefined && !SELECTABLE.includes(role)) throw badRequest('invalid_role')

    const officials = await listAssignableOfficials()
    res.json({ officials: role ? officials.filter((o) => o.role === role) : officials })
  })

  return router
}
