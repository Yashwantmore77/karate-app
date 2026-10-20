import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { findUserRecord, listUsers } from '../auth/users.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { forbidden } from '../lib/errors.js'
import { createBackup } from '../lib/backup.js'

// PRD v1 §22-23: the system-wide audit trail (sign-ins, accounts and roles,
// rulesets, organisations) and backups, for the super admin.

export function systemRoutes(stores, tms) {
  const router = Router()
  router.use(requireAuth)
  const allow = (perm) => (req, _res, next) => next(can(req.user.role, perm) ? undefined : forbidden())
  // The organisation the caller belongs to, or null for an account outside
  // every organisation (a super admin, or the installation's own admin).
  const scopeOf = async (req) => {
    if (req.user.role === 'super_admin') return null
    return (await findUserRecord(req.user.uid))?.organizationId || null
  }

  router.get('/audit', allow(P.AUDIT_VIEW), async (req, res) => {
    if (!['admin', 'super_admin'].includes(req.user.role)) throw forbidden()
    const { page, limit, q } = readPageQuery(req.query)
    let rows = await stores.auditLog.list({ tournamentId: null }, { sort: { at: -1 } })
    // Inside an organisation: only what its own accounts did, what was done to
    // them, and changes to the organisation itself. System rows carry no
    // organisation, so it is worked out from the accounts.
    const org = await scopeOf(req)
    if (org) {
      const members = new Set((await listUsers({ organizationId: org, limit: Number.MAX_SAFE_INTEGER })).rows.map((u) => u.uid))
      rows = rows.filter((a) => members.has(a.actorId)
        || (a.entity === 'user' && members.has(a.entityId))
        || (a.entity === 'organization' && a.entityId === org))
    }
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter((a) => [a.action, a.actorId, a.actorRole, a.entity, a.entityId, a.reason].join(' ').toLowerCase().includes(needle))
    }
    res.json({ audit: rows.slice((page - 1) * limit, page * limit), ...pageMeta({ page, limit, total: rows.length }) })
  })

  // A full backup as one JSON download; recorded in the audit trail. It holds
  // every organisation's data and accounts, so only an account outside every
  // organisation may take it.
  router.get('/backup', allow(P.BACKUP_MANAGE), async (req, res) => {
    if (await scopeOf(req)) throw forbidden()
    const backup = await createBackup(stores)
    await tms.record(req.user, { tournamentId: null, action: 'system.backup', entity: 'system', entityId: 'backup', after: { collections: Object.keys(backup.collections).length } })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="kumite-backup-${backup.createdAt.slice(0, 10)}.json"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(JSON.stringify(backup))
  })

  return router
}
