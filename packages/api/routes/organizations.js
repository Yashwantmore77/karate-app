import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { findUserRecord, listUsers } from '../auth/users.js'
import { validate } from '../lib/validate.js'
import { forbidden, notFound, conflict } from '../lib/errors.js'

// PRD point 33: many organisations on one installation (SaaS). Each runs its
// own tournaments with its own accounts; only a super admin sees them all and
// sets them up.

const ORGANIZATION_SCHEMA = {
  name: { type: 'string', required: true, min: 2, max: 120 },
  slug: { type: 'string', required: true, max: 60, pattern: /^[a-z0-9-]+$/ },
  contactEmail: { type: 'string', max: 200, nullable: true },
  contactMobile: { type: 'string', max: 30, nullable: true },
  country: { type: 'string', max: 80, nullable: true },
  logoUrl: { type: 'string', max: 500, nullable: true },
  active: { type: 'boolean', default: true },
}

const superAdminOnly = (req, _res, next) => next(req.user?.role === 'super_admin' ? undefined : forbidden())

export function organizationRoutes(stores, { audit = async () => {} } = {}) {
  const router = Router()
  const orgs = stores.organizations
  router.use(requireAuth)

  const withCounts = async (org) => {
    const tournaments = (await stores.tournaments.list({ organizationId: org.id })).length
    const accounts = (await listUsers({ organizationId: org.id, limit: 1000 })).total
    return { ...org, tournaments, accounts }
  }

  // The caller's own organisation, for the header of an organisation's admin.
  router.get('/mine', async (req, res) => {
    const account = await findUserRecord(req.user.uid)
    const org = account?.organizationId ? await orgs.get(account.organizationId) : null
    res.json({ organization: org })
  })

  router.get('/', superAdminOnly, async (_req, res) => {
    const rows = (await orgs.list({})).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    res.json({ organizations: await Promise.all(rows.map(withCounts)) })
  })

  router.post('/', superAdminOnly, async (req, res) => {
    const doc = validate(req.body, ORGANIZATION_SCHEMA)
    if ((await orgs.list({ slug: doc.slug })).length) throw conflict('slug_taken')
    const organization = await orgs.insert(doc)
    // PRD v1 §22: organisation changes are audited like account changes.
    await audit(req.user, { action: 'organization.changed', entity: 'organization', entityId: organization.id, after: doc, reason: 'created' })
    res.status(201).json({ organization })
  })

  router.patch('/:id', superAdminOnly, async (req, res) => {
    const before = await orgs.get(req.params.id)
    if (!before) throw notFound()
    const patch = validate(req.body, ORGANIZATION_SCHEMA, { partial: true })
    if (patch.slug && patch.slug !== before.slug && (await orgs.list({ slug: patch.slug })).length) throw conflict('slug_taken')
    const organization = await orgs.update(req.params.id, patch)
    const before_ = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k] ?? null]))
    await audit(req.user, { action: 'organization.changed', entity: 'organization', entityId: before.id, before: before_, after: patch })
    res.json({ organization })
  })

  router.delete('/:id', superAdminOnly, async (req, res) => {
    const org = await orgs.get(req.params.id)
    if (!org) throw notFound()
    // An organisation with tournaments or accounts is deactivated, not removed.
    const { tournaments, accounts } = await withCounts(org)
    if (tournaments || accounts) throw conflict('organization_in_use')
    await orgs.remove(org.id)
    await audit(req.user, { action: 'organization.changed', entity: 'organization', entityId: org.id, before: { name: org.name, slug: org.slug }, reason: 'deleted' })
    res.status(204).end()
  })

  return router
}
