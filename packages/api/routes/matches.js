import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'
import { badRequest } from '../lib/errors.js'

const MATCH_SCHEMA = {
  redId: { type: 'string', max: 60, nullable: true },
  blueId: { type: 'string', max: 60, nullable: true },
  status: { type: 'enum', values: ['scheduled', 'open', 'live', 'completed'], default: 'open' },
  // Both vocabularies are accepted because both exist in this system: kata
  // scores red against blue, kumite runs ao against aka.
  winner: { type: 'enum', values: ['red', 'blue', 'tie', 'ao', 'aka', 'draw'], nullable: true },
  avgRed: { type: 'number', min: 0, max: 10, nullable: true },
  avgBlue: { type: 'number', min: 0, max: 10, nullable: true },
  mat: { type: 'integer', min: 1, max: 99, nullable: true },
  // The outcome as the console settled it — scores, penalties, how it ended.
  // Opaque here: the rules engine owns its shape, and restating it in this
  // schema would mean two definitions to keep in step.
  result: { type: 'object', nullable: true },
}

export function matchRoutes(stores) {
  const nested = Router()
  const flat = Router()
  const body = bodyReader(MATCH_SCHEMA)
  const { categories, competitors, matches } = stores

  /**
   * A match may only point at competitors entered in its own category.
   * Otherwise a mistyped id quietly produces a bout between people from
   * different divisions, which nothing downstream would flag.
   */
  const assertCompetitorsInCategory = async (fields, categoryId) => {
    for (const side of ['redId', 'blueId']) {
      const id = fields[side]
      if (!id) continue
      const competitor = await competitors.get(id)
      if (!competitor || competitor.categoryId !== categoryId) {
        throw badRequest(`invalid_${side}`)
      }
    }
  }

  nested.use(requireAuth)
  flat.use(requireAuth)

  nested.get('/:categoryId/matches', async (req, res) => {
    await loadOrFail(categories, req.params.categoryId)
    res.json({ matches: await matches.list({ categoryId: req.params.categoryId }) })
  })

  nested.post('/:categoryId/matches', requireRole('admin'), async (req, res) => {
    const fields = body.forCreate(req.body)
    await loadOrFail(categories, req.params.categoryId)
    await assertCompetitorsInCategory(fields, req.params.categoryId)
    const match = await matches.insert({ ...fields, categoryId: req.params.categoryId })
    res.status(201).json({ match })
  })

  flat.get('/:id', async (req, res) => {
    res.json({ match: await loadOrFail(matches, req.params.id) })
  })

  // A referee, not only an admin, records how a bout ended: they are the one
  // standing at the mat when it does.
  flat.patch('/:id', requireRole('referee'), async (req, res) => {
    const patch = body.forPatch(req.body)
    const existing = await loadOrFail(matches, req.params.id)
    await assertCompetitorsInCategory(patch, existing.categoryId)
    res.json({ match: await matches.update(req.params.id, patch) })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(matches, req.params.id)
    await matches.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
