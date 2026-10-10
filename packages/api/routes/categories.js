import { Router } from 'express'
import { requireAuth, requireTournamentAdmin, tournamentAccess } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { bodyReader, loadOrFail } from './resource.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { categoryGuards, staffOnly } from '../auth/categoryAccess.js'
import { conflict } from '../lib/errors.js'
import { createAuditLog, AUDIT_ACTIONS } from '../lib/audit.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'

const CATEGORY_SCHEMA = {
  name: { type: 'string', required: true, min: 1, max: 120 },
  ageGroup: { type: 'string', required: true, max: 40 },
  gender: { type: 'enum', values: ['M', 'F', 'Mixed'], required: true },
  // Free text rather than an enum: the admin form takes a typed division, and
  // federations name their grades differently.
  division: { type: 'string', required: true, max: 60 },
  // Set when the category was generated from a PRD division (see tms.js).
  divisionKey: { type: 'string', max: 200, nullable: true },
  event: { type: 'enum', values: ['kata', 'kumite'], nullable: true },
}

/**
 * Categories are addressed two ways on purpose: nested under a tournament for
 * listing and creating (where the parent is the scope), and flat by id for
 * reading, patching and deleting (where the caller already holds the id and
 * should not have to remember its parent).
 */
export function categoryRoutes(stores) {
  const nested = Router()
  const flat = Router()
  const body = bodyReader(CATEGORY_SCHEMA)
  const { tournaments, categories, competitors, matches } = stores
  const guard = categoryGuards(stores)
  const audit = stores.auditLog ? createAuditLog(stores.auditLog) : null
  const record = (req, tournamentId, entry) => audit?.record({ tournamentId, actor: req.user, requestMeta: { ip: clientIp(req), userAgent: userAgent(req) }, ...entry })

  nested.use(requireAuth, staffOnly)
  nested.param('tournamentId', tournamentAccess(findUserRecord))
  // Flat routes name a category by id, so each one checks the category's
  // tournament is one the caller works (PRD point 33).
  flat.use(requireAuth, staffOnly)

  nested.get('/:tournamentId/categories', async (req, res) => {
    await loadOrFail(tournaments, req.params.tournamentId)
    const { page, limit, q } = readPageQuery(req.query)
    const { rows, total } = await categories.paginate({ tournamentId: req.params.tournamentId }, {
      q, searchFields: ['name', 'ageGroup', 'division'], page, limit,
    })
    res.json({ categories: rows, ...pageMeta({ page, limit, total }) })
  })

  nested.post('/:tournamentId/categories', requireTournamentAdmin(), async (req, res) => {
    const fields = body.forCreate(req.body)
    const tournament = await loadOrFail(tournaments, req.params.tournamentId)
    if (tournament.lifecycleStatus === 'ARCHIVED') throw conflict('tournament_archived')
    if (tournament.lifecycleStatus === 'COMPLETED') throw conflict('tournament_completed')
    // A category made by the tournament draw is the draw's to create.
    if (fields.divisionKey) throw conflict('managed_by_draw')
    const category = await categories.insert({ ...fields, tournamentId: req.params.tournamentId })
    res.status(201).json({ category })
  })

  flat.get('/:id', async (req, res) => {
    const { category } = await guard.scope(req.user, req.params.id)
    res.json({ category })
  })

  flat.patch('/:id', requireTournamentAdmin(), async (req, res) => {
    const patch = body.forPatch(req.body)
    const found = await guard.scope(req.user, req.params.id, { write: 'structure' })
    guard.assertNotDrawn(found)
    if (patch.divisionKey) throw conflict('managed_by_draw')
    const category = await categories.update(req.params.id, patch)
    await record(req, found.category.tournamentId, { action: AUDIT_ACTIONS.CATEGORY_CHANGED, entity: 'category', entityId: category.id, before: found.category, after: category })
    res.json({ category })
  })

  flat.delete('/:id', requireTournamentAdmin(), async (req, res) => {
    const found = await guard.scope(req.user, req.params.id, { write: 'structure' })
    guard.assertNotDrawn(found)
    // Bouts with results are history: a category whose bouts were fought is not deleted.
    const fought = (await matches.list({ categoryId: req.params.id })).filter((m) => m.status === 'completed' || m.winner)
    if (fought.length) throw conflict('category_has_results', { matches: fought.length })
    await competitors.removeWhere({ categoryId: req.params.id })
    await matches.removeWhere({ categoryId: req.params.id })
    await categories.remove(req.params.id)
    await record(req, found.category.tournamentId, { action: AUDIT_ACTIONS.CATEGORY_CHANGED, entity: 'category', entityId: req.params.id, before: found.category, reason: 'deleted' })
    res.status(204).end()
  })

  return { nested, flat }
}
