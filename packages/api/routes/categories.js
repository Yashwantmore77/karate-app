import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'

const CATEGORY_SCHEMA = {
  name: { type: 'string', required: true, min: 1, max: 120 },
  ageGroup: { type: 'string', required: true, max: 40 },
  gender: { type: 'enum', values: ['M', 'F', 'Mixed'], required: true },
  // Free text rather than an enum: the admin form takes a typed division, and
  // federations name their grades differently.
  division: { type: 'string', required: true, max: 60 },
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

  nested.use(requireAuth)
  flat.use(requireAuth)

  nested.get('/:tournamentId/categories', async (req, res) => {
    await loadOrFail(tournaments, req.params.tournamentId)
    res.json({ categories: await categories.list({ tournamentId: req.params.tournamentId }) })
  })

  nested.post('/:tournamentId/categories', requireRole('admin'), async (req, res) => {
    const fields = body.forCreate(req.body)
    await loadOrFail(tournaments, req.params.tournamentId)
    const category = await categories.insert({ ...fields, tournamentId: req.params.tournamentId })
    res.status(201).json({ category })
  })

  flat.get('/:id', async (req, res) => {
    res.json({ category: await loadOrFail(categories, req.params.id) })
  })

  flat.patch('/:id', requireRole('admin'), async (req, res) => {
    const patch = body.forPatch(req.body)
    await loadOrFail(categories, req.params.id)
    res.json({ category: await categories.update(req.params.id, patch) })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(categories, req.params.id)
    await competitors.removeWhere({ categoryId: req.params.id })
    await matches.removeWhere({ categoryId: req.params.id })
    await categories.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
