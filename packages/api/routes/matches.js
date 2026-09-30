import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { badRequest } from '../lib/errors.js'
import { findUser } from '../auth/users.js'

// Used when a tournament predates the setting, so an older record still gets a
// sensible panel size instead of no limit at all.
const DEFAULT_JUDGE_COUNT = 4

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
  // Who is officiating. Both stay optional: a bout can be listed before anyone
  // has been put on it, and an unassigned match is still a real match.
  refereeId: { type: 'string', max: 60, nullable: true },
  judgeIds: {
    type: 'array',
    items: { type: 'string', max: 60 },
    maxItems: 8,
    unique: true,
    nullable: true,
  },
  // The outcome as the console settled it — scores, penalties, how it ended.
  // Opaque here: the rules engine owns its shape, and restating it in this
  // schema would mean two definitions to keep in step.
  result: { type: 'object', nullable: true },
}

export function matchRoutes(stores) {
  const nested = Router()
  const flat = Router()
  const body = bodyReader(MATCH_SCHEMA)
  const { tournaments, categories, competitors, matches } = stores

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

  /**
   * Checks the people on a match make sense together.
   *
   * Applied to the match as it will be *after* the write, not to the patch
   * alone: sending only a new redId still has to be checked against the blueId
   * already stored, or you could walk a bout into someone fighting themselves
   * one field at a time.
   */
  const assertPeopleMakeSense = async (patch, categoryId, existing = {}) => {
    const next = { ...existing, ...patch }

    if (next.redId && next.blueId && next.redId === next.blueId) {
      throw badRequest('same_competitor')
    }

    if (next.refereeId) {
      const referee = await findUser(next.refereeId)
      // An admin may take a mat; anyone else with the whistle is a mistake.
      if (!referee || !['referee', 'admin'].includes(referee.role)) {
        throw badRequest('invalid_refereeId')
      }
    }

    const judgeIds = next.judgeIds || []
    if (judgeIds.length === 0) return

    if (next.refereeId && judgeIds.includes(next.refereeId)) {
      throw badRequest('referee_also_judge')
    }

    for (const id of judgeIds) {
      const judge = await findUser(id)
      if (!judge || judge.role !== 'judge') throw badRequest('invalid_judgeIds')
    }

    // The panel size is the tournament's rule, so the limit is read from there
    // rather than fixed at four.
    const category = await categories.get(categoryId)
    const tournament = category ? await tournaments.get(category.tournamentId) : null
    const limit = tournament?.judgeCount ?? DEFAULT_JUDGE_COUNT
    if (judgeIds.length > limit) throw badRequest('too_many_judges')
  }

  nested.use(requireAuth)
  flat.use(requireAuth)

  nested.get('/:categoryId/matches', async (req, res) => {
    await loadOrFail(categories, req.params.categoryId)
    const { page, limit, q } = readPageQuery(req.query)
    // Searchable by how the bout ended and which mat it is on. Competitor names
    // live on another collection, so searching by fighter belongs to whoever
    // already holds the roster rather than to a join here.
    const { rows, total } = await matches.paginate({ categoryId: req.params.categoryId }, {
      q, searchFields: ['status', 'winner'], page, limit,
    })
    res.json({ matches: rows, ...pageMeta({ page, limit, total }) })
  })

  // A referee schedules the bouts on their own mat: they are the one standing
  // there deciding who is called next, and waiting on an administrator to add
  // each pairing stops the mat. Removing one stays an administrator's job —
  // a match carries its judges' scores, and deleting it destroys them.
  nested.post('/:categoryId/matches', requireRole('referee'), async (req, res) => {
    const fields = body.forCreate(req.body)
    await loadOrFail(categories, req.params.categoryId)
    await assertCompetitorsInCategory(fields, req.params.categoryId)
    await assertPeopleMakeSense(fields, req.params.categoryId)
    const match = await matches.insert({ ...fields, categoryId: req.params.categoryId })
    res.status(201).json({ match })
  })

  /**
   * Matches across the whole event, for the screens that ask "what can I work
   * on" rather than opening one category.
   *
   * Filtering and paging happen here rather than in the browser. Walking every
   * category client-side to then discard most of it means the work grows with
   * the tournament while the screen still shows one page.
   */
  flat.get('/', async (req, res) => {
    const { page, limit, q } = readPageQuery(req.query)
    const { status, categoryId, mine } = req.query

    if (status !== undefined && !MATCH_SCHEMA.status.values.includes(status)) {
      throw badRequest('invalid_status')
    }

    const filter = {}
    if (status) filter.status = status
    if (categoryId) filter.categoryId = categoryId

    const { rows, total } = await matches.paginate(filter, {
      q,
      searchFields: ['status', 'winner'],
      page,
      limit,
      // Only ever the caller's own id: letting a client name someone else would
      // turn this into a way to read another official's assignments.
      official: mine === 'true' ? req.user.uid : null,
    })

    // The names belong to other collections, so they are resolved for the page
    // being returned rather than joined across everything.
    const categoryIds = [...new Set(rows.map((m) => m.categoryId).filter(Boolean))]
    const found = await Promise.all(categoryIds.map((id) => categories.get(id)))
    const categoryById = new Map(found.filter(Boolean).map((c) => [c.id, c]))

    const tournamentIds = [...new Set([...categoryById.values()].map((c) => c.tournamentId))]
    const tournamentsFound = await Promise.all(tournamentIds.map((id) => tournaments.get(id)))
    const tournamentById = new Map(tournamentsFound.filter(Boolean).map((t) => [t.id, t]))

    const enriched = rows.map((match) => {
      const category = categoryById.get(match.categoryId)
      const tournament = category ? tournamentById.get(category.tournamentId) : null
      return {
        ...match,
        category: category?.name ?? null,
        tournament: tournament?.name ?? null,
        tournamentId: category?.tournamentId ?? null,
        tournamentDate: tournament?.date ?? null,
      }
    })

    res.json({ matches: enriched, ...pageMeta({ page, limit, total }) })
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
    await assertPeopleMakeSense(patch, existing.categoryId, existing)
    res.json({ match: await matches.update(req.params.id, patch) })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(matches, req.params.id)
    await matches.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
