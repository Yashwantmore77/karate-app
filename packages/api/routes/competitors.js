import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { categoryGuards, staffOnly } from '../auth/categoryAccess.js'
import { conflict } from '../lib/errors.js'

const COMPETITOR_SCHEMA = {
  name: { type: 'string', required: true, min: 2, max: 120 },
  // A bib is a label, not a number: they are printed with leading zeroes and
  // occasionally a letter, and arithmetic is never done on one.
  bib: { type: 'string', required: true, max: 20 },
  age: { type: 'integer', required: true, min: 1, max: 120 },
  // Links back to the registered player when generated from a PRD pool.
  playerId: { type: 'string', max: 80, nullable: true },
  teamId: { type: 'string', max: 80, nullable: true },
  poolId: { type: 'string', max: 80, nullable: true },
}

export function competitorRoutes(stores) {
  const nested = Router()
  const flat = Router()
  const body = bodyReader(COMPETITOR_SCHEMA)
  const { competitors } = stores
  const guard = categoryGuards(stores)

  // Every route resolves the competitor's category to its tournament, so an
  // account reaches only the tournaments it works (PRD point 33).
  nested.use(requireAuth, staffOnly)
  flat.use(requireAuth, staffOnly)

  /** The competitor and its category scope; `write` as in categoryGuards.scope. */
  const competitorScope = async (req, write = false) => {
    const competitor = await loadOrFail(competitors, req.params.id)
    const found = await guard.scope(req.user, competitor.categoryId, { write })
    return { competitor, ...found }
  }

  nested.get('/:categoryId/competitors', async (req, res) => {
    await guard.scope(req.user, req.params.categoryId)
    const { page, limit, q } = readPageQuery(req.query)
    const { rows, total } = await competitors.paginate({ categoryId: req.params.categoryId }, {
      q, searchFields: ['name', 'bib'], page, limit,
    })
    res.json({ competitors: rows, ...pageMeta({ page, limit, total }) })
  })

  nested.post('/:categoryId/competitors', requireRole('admin'), async (req, res) => {
    const fields = body.forCreate(req.body)
    // Entrants of a drawn category come from registration and the draw.
    guard.assertNotDrawn(await guard.scope(req.user, req.params.categoryId, { write: 'structure' }))
    const competitor = await competitors.insert({ ...fields, categoryId: req.params.categoryId })
    res.status(201).json({ competitor })
  })

  flat.get('/:id', async (req, res) => {
    res.json({ competitor: (await competitorScope(req)).competitor })
  })

  flat.patch('/:id', requireRole('admin'), async (req, res) => {
    const patch = body.forPatch(req.body)
    const found = await competitorScope(req, 'structure')
    guard.assertNotDrawn(found)
    res.json({ competitor: await competitors.update(req.params.id, patch) })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    guard.assertNotDrawn(await competitorScope(req, 'structure'))
    // Someone who has fought keeps their record: their bouts would point at nobody.
    const fought = (await stores.matches.list({ categoryId: (await competitors.get(req.params.id)).categoryId }))
      .filter((m) => [m.redId, m.blueId].includes(req.params.id) && (m.status === 'completed' || m.winner))
    if (fought.length) throw conflict('competitor_has_results', { matches: fought.length })
    await competitors.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
