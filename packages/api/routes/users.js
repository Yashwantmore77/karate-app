import { Router } from 'express'
import { listUsers, createUser, updateUser, deleteUser, findUserRecord, findUser } from '../auth/users.js'
import { requireAuth, requireRole, tournamentFor } from '../auth/middleware.js'
import { badRequest, forbidden, notFound, conflict, unauthorized } from '../lib/errors.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { revokeOtherSessions, createSession, revokeSession } from '../auth/sessions.js'
import { signToken, IMPERSONATION_TTL } from '../auth/jwt.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'
import { rateLimit } from '../lib/rateLimit.js'
import { issueImpersonationTicket, redeemImpersonationTicket } from '../auth/impersonationTickets.js'

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
      if (out.organizationId !== undefined && out.organizationId !== org) throw forbidden('organization_forbidden')
      out.organizationId = org
    }
    return out
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
  // Only a super admin makes, changes or removes a super admin: otherwise any
  // admin could promote itself, or lock the super admin out.
  const assertMayTouch = (req, target = null) => {
    if (req.user.role !== 'super_admin' && (req.body?.role === 'super_admin' || target?.role === 'super_admin')) throw forbidden('role_forbidden')
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
    assertMayTouch(req)
    const org = await scopeOf(req)
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
    assertMayTouch(req, before)
    if (body.role && before && body.role !== before.role) {
      // Your own role is changed by another administrator, never by yourself:
      // otherwise the last admin can demote themselves out of the system.
      if (req.params.uid === req.user.uid) throw badRequest('cannot_change_own_role')
      if (['referee', 'judge'].includes(before.role)) await assertNotAssigned(req.params.uid)
    }
    const user = await updateUser(req.params.uid, body)
    // A sign-in carries the role it was issued with, so a new role or password ends the others.
    if (user.role !== before?.role || body.password) await revokeOtherSessions(user.uid, req.user.sid)
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
    assertMayTouch(req, before)
    if (before && ['referee', 'judge'].includes(before.role)) await assertNotAssigned(req.params.uid)
    await deleteUser(req.params.uid)
    await revokeOtherSessions(req.params.uid, null)
    await audit(req.user, { action: 'user.changed', entity: 'user', entityId: req.params.uid, before: { email: before?.email, role: before?.role }, reason: 'deleted' })
    res.status(204).end()
  })

  // KAN-429: an admin's lens into another account, for support or for seeing
  // exactly what someone else sees — one click, opened in a tab of its own,
  // no password or 2FA step. That is a deliberate product choice, leaning
  // entirely on the limits below (never another admin, never the admin's
  // own account, no chaining, never outside the organisation, 30 minutes,
  // a rate limit of its own) plus the session being revocable and every
  // write it makes being audited under both identities, rather than on
  // asking anything of the admin first.
  const impersonateLimit = rateLimit({ windowMs: 60_000, max: 10, code: 'too_many_requests', keyOf: (req) => `impersonate:${req.user.uid}` })

  router.post('/:uid/impersonate', impersonateLimit, async (req, res) => {
    if (req.user.impersonatedBy) throw forbidden('already_impersonating')
    if (req.params.uid === req.user.uid) throw badRequest('cannot_impersonate_self')

    await assertInScope(req.params.uid, await scopeOf(req))
    const target = await findUser(req.params.uid)
    if (!target) throw notFound()
    if (['admin', 'super_admin'].includes(target.role)) throw forbidden('cannot_impersonate_admin')

    const sid = await createSession({ uid: target.uid, ip: clientIp(req), userAgent: userAgent(req), impersonatedBy: req.user.uid, ttlMs: 30 * 60_000 })
    const token = signToken(target, sid, { impersonatedBy: req.user.uid, impersonatorSid: req.user.sid, ttl: IMPERSONATION_TTL })
    await audit(req.user, { action: 'user.impersonation_started', entity: 'user', entityId: target.uid })
    // The token itself never reaches this response: only a one-time ticket
    // does, redeemed by the new tab that is about to open it
    // (impersonationPublicRoutes below) — so this bearer token never sits
    // in a URL, in browser history or in anything that logs one.
    res.json({ ticket: issueImpersonationTicket({ token, user: target }) })
  })

  return router
}

/**
 * The two impersonation (KAN-429) routes that take no admin-shaped token:
 *
 * - Ending a lens needs no admin role on the calling token — while
 *   impersonating, the token carries the *target's* role, which may be
 *   anything. Its own check (the caller must be authenticated as the
 *   session it is ending) is the whole of its authorization, same as any
 *   account ending its own session.
 * - Redeeming a ticket needs no token at all: it is what hands the new tab
 *   its first one. A ticket is good for one redemption, within a minute of
 *   being issued (impersonationTickets.js); anything else is refused the
 *   same as a token that never verified.
 *
 * Both are mounted ahead of userRoutes' admin-only router at the same
 * prefix, so these two paths answer before that gate ever runs.
 */
export function impersonationPublicRoutes({ audit = async () => {} } = {}) {
  const router = Router()
  router.post('/:uid/impersonate/end', requireAuth, async (req, res) => {
    if (req.params.uid !== req.user.uid || !req.user.impersonatedBy) throw forbidden()
    await revokeSession(req.user.sid, req.user.uid)
    await audit(req.user, { action: 'user.impersonation_stopped', entity: 'user', entityId: req.user.uid })
    res.json({ ok: true })
  })
  router.post('/impersonate/exchange', (req, res) => {
    const row = redeemImpersonationTicket(String(req.body?.ticket || ''))
    if (!row) throw unauthorized('ticket_expired')
    res.json(row)
  })
  return router
}
