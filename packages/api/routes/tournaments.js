import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'

const TOURNAMENT_SCHEMA = {
  name: { type: 'string', required: true, min: 3, max: 120 },
  location: { type: 'string', required: true, min: 1, max: 160 },
  // A calendar day, not an instant: a tournament is "on the 15th" everywhere,
  // and storing a timestamp would drag a timezone into that.
  date: { type: 'string', required: true, pattern: /^\d{4}-\d{2}-\d{2}$/, max: 10 },
  template: { type: 'enum', values: ['kata', 'kumite'], required: true },
  status: { type: 'enum', values: ['draft', 'active', 'completed'], default: 'draft' },
}

export function tournamentRoutes(stores) {
  const router = Router()
  const body = bodyReader(TOURNAMENT_SCHEMA)
  const { tournaments, categories, competitors, matches } = stores

  // Reading the schedule is open to any signed-in role: a judge needs to see
  // what is on before they can be sent to a mat.
  router.use(requireAuth)

  router.get('/', async (_req, res) => res.json({ tournaments: await tournaments.list() }))

  router.get('/:id', async (req, res) => {
    res.json({ tournament: await loadOrFail(tournaments, req.params.id) })
  })

  router.post('/', requireRole('admin'), async (req, res) => {
    res.status(201).json({ tournament: await tournaments.insert(body.forCreate(req.body)) })
  })

  router.patch('/:id', requireRole('admin'), async (req, res) => {
    const patch = body.forPatch(req.body)
    await loadOrFail(tournaments, req.params.id)
    res.json({ tournament: await tournaments.update(req.params.id, patch) })
  })

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(tournaments, req.params.id)

    // Cascade by hand: the store has no foreign keys, so dropping a tournament
    // without its descendants would leave categories, competitors and matches
    // that no screen can reach and no query will ever clean up.
    const owned = await categories.list({ tournamentId: req.params.id })
    for (const category of owned) {
      await competitors.removeWhere({ categoryId: category.id })
      await matches.removeWhere({ categoryId: category.id })
    }
    await categories.removeWhere({ tournamentId: req.params.id })
    await tournaments.remove(req.params.id)

    res.status(204).end()
  })

  return router
}
