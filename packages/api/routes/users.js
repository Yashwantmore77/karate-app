import { Router } from 'express'
import { listUsers, createUser, updateUser, deleteUser, findUserRecord, findUser } from '../auth/users.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'

/**
 * Account administration. There is no self-service signup anywhere in the
 * system by design: accounts exist because an administrator created them, so
 * every route here is behind the admin gate.
 *
 * PRD point 33: an administrator inside an organisation manages only that
 * organisation's accounts, and every account they create joins it. Only a
 * super admin moves accounts between organisations or makes super admins.
 */
export function userRoutes() {
  const router = Router()
  router.use(requireAuth, requireRole('admin'))

  const scopeOf = async (req) => {
    if (req.user.role === 'super_admin') return null
    return (await findUserRecord(req.user.uid))?.organizationId || null
  }
  const scopedBody = (body, org) => {
    const out = { ...(body || {}) }
    if (org) {
      if (out.role === 'super_admin') throw forbidden('role_forbidden')
      if (out.organizationId !== undefined && out.organizationId !== org) throw forbidden('organization_forbidden')
      out.organizationId = org
    }
    return out
  }
  const assertInScope = async (uid, org) => {
    if (!org) return
    const target = await findUser(uid)
    if (!target) throw notFound()
    if (target.organizationId !== org) throw forbidden('organization_forbidden')
  }

  router.get('/', async (req, res) => {
    const { page, limit, q } = readPageQuery(req.query)
    const organizationId = (await scopeOf(req)) || (req.user.role === 'super_admin' && typeof req.query.organizationId === 'string' ? req.query.organizationId : null)
    const { rows, total } = await listUsers({ q, page, limit, organizationId })
    res.json({ users: rows, ...pageMeta({ page, limit, total }) })
  })

  router.post('/', async (req, res) => {
    res.status(201).json({ user: await createUser(scopedBody(req.body, await scopeOf(req))) })
  })

  router.patch('/:uid', async (req, res) => {
    const org = await scopeOf(req)
    await assertInScope(req.params.uid, org)
    const body = scopedBody(req.body, org)
    if (org && req.body?.organizationId === undefined) delete body.organizationId
    res.json({ user: await updateUser(req.params.uid, body) })
  })

  router.delete('/:uid', async (req, res) => {
    // Removing your own account would leave the admin surface unreachable if
    // you were the only administrator, and there is no way back in from here.
    if (req.params.uid === req.user.uid) throw badRequest('cannot_delete_self')
    await assertInScope(req.params.uid, await scopeOf(req))
    await deleteUser(req.params.uid)
    res.status(204).end()
  })

  return router
}
