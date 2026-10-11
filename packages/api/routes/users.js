import { Router } from 'express'
import { listUsers, createUser, updateUser, deleteUser, findUserRecord, findUser } from '../auth/users.js'
import { requireAuth, requireRole, tournamentFor } from '../auth/middleware.js'
import { badRequest, forbidden, notFound, conflict } from '../lib/errors.js'
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
export function userRoutes({ audit = async () => {}, stores = null } = {}) {
  const router = Router()
  router.use(requireAuth, requireRole('admin'))

  /** Unfinished bouts this official is put on (as referee or judge). */
  const openAssignments = async (uid) => {
    if (!stores?.matches) return 0
    return (await stores.matches.list()).filter((m) => !['completed', 'cancelled'].includes(m.status) && !m.winner
      && (m.refereeId === uid || (m.judgeIds || []).includes(uid))).length
  }
  /** An official still on bouts keeps their account and role until they are replaced there. */
  const assertNotAssigned = async (uid) => {
    const n = await openAssignments(uid)
    if (n) throw conflict('official_assigned', { matches: n })
  }

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
  /**
   * A tournament owner is created by the super admin alone: the role hands
   * someone a whole event, so who may hold it is not an organisation admin's
   * decision. Handing that owner its tournaments is, and stays below with the
   * rest of the assignment fields.
   */
  const assertMayGrantOwner = (req, role, before = null) => {
    if (req.user.role === 'super_admin') return
    const owner = 'tournament_owner'
    if (role === owner || (role && before?.role === owner)) throw forbidden('role_forbidden')
  }
  // Tournament roles and assignments may only name tournaments the acting
  // admin's organisation runs (PRD point 33, PRD v1 §4).
  const assertTournamentsInScope = async (body, org) => {
    if (!org) return
    const ids = [...Object.keys(body?.tournamentRoles || {}), ...(Array.isArray(body?.tournamentIds) ? body.tournamentIds : [])]
    for (const id of ids) {
      const tournament = await tournamentFor(String(id))
      if (!tournament || tournament.organizationId !== org) throw forbidden('organization_forbidden')
    }
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
    const org = await scopeOf(req)
    assertMayGrantOwner(req, req.body?.role)
    await assertTournamentsInScope(req.body, org)
    const user = await createUser(scopedBody(req.body, org))
    // PRD v1 §22 audit: account and role changes.
    await audit(req.user, { action: 'user.changed', entity: 'user', entityId: user.uid, after: { email: user.email, role: user.role, tournamentRoles: user.tournamentRoles || null, organizationId: user.organizationId || null }, reason: 'created' })
    res.status(201).json({ user })
  })

  router.patch('/:uid', async (req, res) => {
    const org = await scopeOf(req)
    await assertInScope(req.params.uid, org)
    await assertTournamentsInScope(req.body, org)
    const body = scopedBody(req.body, org)
    if (org && req.body?.organizationId === undefined) delete body.organizationId
    const before = await findUser(req.params.uid)
    assertMayGrantOwner(req, body.role, before)
    if (body.role && before && body.role !== before.role) {
      // Your own role is changed by another administrator, never by yourself:
      // otherwise the last admin can demote themselves out of the system.
      if (req.params.uid === req.user.uid) throw badRequest('cannot_change_own_role')
      if (['referee', 'judge'].includes(before.role)) await assertNotAssigned(req.params.uid)
    }
    const user = await updateUser(req.params.uid, body)
    const pick = (u) => ({ email: u?.email, role: u?.role, seat: u?.seat ?? null, tournamentIds: u?.tournamentIds || [], tournamentRoles: u?.tournamentRoles || null, organizationId: u?.organizationId || null })
    await audit(req.user, { action: 'user.changed', entity: 'user', entityId: user.uid, before: pick(before), after: pick(user), reason: body.password ? 'password changed' : null })
    res.json({ user })
  })

  router.delete('/:uid', async (req, res) => {
    // Removing your own account would leave the admin surface unreachable if
    // you were the only administrator, and there is no way back in from here.
    if (req.params.uid === req.user.uid) throw badRequest('cannot_delete_self')
    await assertInScope(req.params.uid, await scopeOf(req))
    const before = await findUser(req.params.uid)
    // Removing an owner is the same decision as creating one.
    if (before?.role === 'tournament_owner' && req.user.role !== 'super_admin') throw forbidden('role_forbidden')
    if (before && ['referee', 'judge'].includes(before.role)) await assertNotAssigned(req.params.uid)
    await deleteUser(req.params.uid)
    await audit(req.user, { action: 'user.changed', entity: 'user', entityId: req.params.uid, before: { email: before?.email, role: before?.role }, reason: 'deleted' })
    res.status(204).end()
  })

  return router
}
