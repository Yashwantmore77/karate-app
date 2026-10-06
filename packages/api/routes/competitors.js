import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'

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
  const { categories, competitors } = stores

  nested.use(requireAuth)
  flat.use(requireAuth)

  nested.get('/:categoryId/competitors', async (req, res) => {
    await loadOrFail(categories, req.params.categoryId)
    res.json({ competitors: await competitors.list({ categoryId: req.params.categoryId }) })
  })

  nested.post('/:categoryId/competitors', requireRole('admin'), async (req, res) => {
    const fields = body.forCreate(req.body)
    await loadOrFail(categories, req.params.categoryId)
    const competitor = await competitors.insert({ ...fields, categoryId: req.params.categoryId })
    res.status(201).json({ competitor })
  })

  flat.get('/:id', async (req, res) => {
    res.json({ competitor: await loadOrFail(competitors, req.params.id) })
  })

  flat.patch('/:id', requireRole('admin'), async (req, res) => {
    const patch = body.forPatch(req.body)
    await loadOrFail(competitors, req.params.id)
    res.json({ competitor: await competitors.update(req.params.id, patch) })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(competitors, req.params.id)
    await competitors.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
