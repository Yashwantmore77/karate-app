import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
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

  router.get('/audit', allow(P.AUDIT_VIEW), async (req, res) => {
    if (!['admin', 'super_admin'].includes(req.user.role)) throw forbidden()
    const { page, limit, q } = readPageQuery(req.query)
    let rows = await stores.auditLog.list({ tournamentId: null }, { sort: { at: -1 } })
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter((a) => [a.action, a.actorId, a.actorRole, a.entity, a.entityId, a.reason].join(' ').toLowerCase().includes(needle))
    }
    res.json({ audit: rows.slice((page - 1) * limit, page * limit), ...pageMeta({ page, limit, total: rows.length }) })
  })

  // A full backup as one JSON download; recorded in the audit trail.
  router.get('/backup', allow(P.BACKUP_MANAGE), async (req, res) => {
    const backup = await createBackup(stores)
    await tms.record(req.user, { tournamentId: null, action: 'system.backup', entity: 'system', entityId: 'backup', after: { collections: Object.keys(backup.collections).length } })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="kumite-backup-${backup.createdAt.slice(0, 10)}.json"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(JSON.stringify(backup))
  })

  return router
}
