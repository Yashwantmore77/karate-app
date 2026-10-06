import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { badRequest, conflict } from '../lib/errors.js'
import { createAuditLog, AUDIT_ACTIONS } from '../lib/audit.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'
import { slotMinutesFor, endOfSlot, clashingPeople } from '../lib/schedule.js'
import { roundRobinPairs, pairKey } from '../lib/draw.js'
import { validate } from '../lib/validate.js'
import { findUser } from '../auth/users.js'

// Used when a tournament predates the setting, so an older record still gets a
// sensible panel size instead of no limit at all.
const DEFAULT_JUDGE_COUNT = 4

// The largest field a round robin is drawn for. Thirty-two entrants is 496
// bouts; a category bigger than that wants pools or a bracket, not everyone
// against everyone, and drawing it anyway would bury the mat.
export const MAX_ROUND_ROBIN = 32

const MATCH_SCHEMA = {
  redId: { type: 'string', max: 60, nullable: true },
  blueId: { type: 'string', max: 60, nullable: true },
  status: { type: 'enum', values: ['scheduled', 'open', 'live', 'completed', 'cancelled'], default: 'open' },
  // Both vocabularies are accepted because both exist in this system: kata
  // scores red against blue, kumite runs ao against aka.
  winner: { type: 'enum', values: ['red', 'blue', 'tie', 'ao', 'aka', 'draw'], nullable: true },
  // Kata averages sit in 0-10, but the kumite console stores points here too,
  // and a kumite score passes 10 (an 8-point gap win can end 11-3).
  avgRed: { type: 'number', min: 0, max: 99, nullable: true },
  avgBlue: { type: 'number', min: 0, max: 99, nullable: true },
  mat: { type: 'integer', min: 1, max: 99, nullable: true },
  // When the bout is called. Optional, because a schedule is built after the
  // draw and a bout with no time yet is still a real bout.
  //
  // Its matching end is not here: `endsAt` is derived from the tournament’s
  // slot length and owned by the server, like createdAt. A client that could
  // set it could grant itself a zero-length bout and clash with nothing.
  scheduledAt: { type: 'timestamp', nullable: true },
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
  // Rule 6: required when a finished result is changed. Recorded in the
  // audit log, never stored on the match.
  correctionReason: { type: 'string', max: 300, nullable: true },
}

const RESULT_FIELDS = ['winner', 'avgRed', 'avgBlue', 'status', 'redId', 'blueId']
const isFinished = (match) => match.status === 'completed'

export function matchRoutes(stores, tms = null) {
  const nested = Router()
  const flat = Router()
  const body = bodyReader(MATCH_SCHEMA)
  const { tournaments, categories, competitors, matches } = stores
  const audit = stores.auditLog ? createAuditLog(stores.auditLog) : null

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

  // A write only has to be checked for clashes if it changes when the bout is
  // or who is on it. Without this, recording a winner on a bout that was always
  // double-booked would fail at the one moment the referee cannot do anything
  // about it.
  const SCHEDULE_FIELDS = ['scheduledAt', 'mat', 'redId', 'blueId', 'refereeId', 'judgeIds', 'status']

  /**
   * Refuses a write that would need someone, or a mat, that is already busy.
   *
   * Competitors are checked alongside officials, because the rule is about a
   * person being in one place: a fighter cannot be called to two mats any more
   * than a referee can.
   */
  const assertNobodyDoubleBooked = async (subject, matchId) => {
    const others = await matches.overlapping({
      startsAt: subject.scheduledAt,
      endsAt: subject.endsAt,
      excludeId: matchId,
      // A finished bout releases the people on it. The rule exists to stop
      // someone being needed in two places at once, and nobody is needed at a
      // bout that is already over.
      excludeStatus: ['completed'],
    })

    const clashes = []
    for (const other of others) {
      // A mat is held the same way a person is: one bout on it at a time.
      if (subject.mat && other.mat === subject.mat) {
        clashes.push({
          uid: null,
          role: 'mat',
          otherRole: 'mat',
          matchId: other.id,
          scheduledAt: other.scheduledAt,
          mat: other.mat,
        })
      }
      for (const person of clashingPeople(subject, other)) {
        clashes.push({
          ...person,
          matchId: other.id,
          scheduledAt: other.scheduledAt,
          mat: other.mat ?? null,
        })
      }
    }

    // 409 rather than 400: the request is well formed, and what makes it fail is
    // the state of the rest of the schedule. The payload names who clashes and
    // where, so the caller can show it instead of guessing.
    if (clashes.length > 0) throw conflict('schedule_conflict', { clashes })
  }

  /**
   * Works out the window a write puts a match in, and returns the server-owned
   * fields to store with it.
   *
   * `endsAt` is derived here rather than accepted from the client so it can
   * never disagree with `scheduledAt`, and is stored rather than recomputed on
   * read so a clash is one range query instead of a slot lookup per candidate.
   */
  const resolveSchedule = async (patch, categoryId, existing, matchId) => {
    const next = { ...existing, ...patch }

    if (!next.scheduledAt) {
      // Clearing the time gives up the window with it; leaving it alone on an
      // unscheduled bout writes nothing.
      return 'scheduledAt' in patch ? { endsAt: null } : {}
    }

    const category = await categories.get(categoryId)
    const tournament = category ? await tournaments.get(category.tournamentId) : null
    const endsAt = endOfSlot(next.scheduledAt, slotMinutesFor(tournament))

    if (SCHEDULE_FIELDS.some((field) => field in patch)) {
      await assertNobodyDoubleBooked({ ...next, endsAt }, matchId)
    }
    return { endsAt }
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
    const schedule = await resolveSchedule(fields, req.params.categoryId, {}, null)
    const match = await matches.insert({
      ...fields,
      ...schedule,
      categoryId: req.params.categoryId,
    })
    res.status(201).json({ match })
  })

  /**
   * Draws a round robin: a bout for every pair of entrants that lacks one.
   *
   * Safe to press twice. A pair that already has a bout — made by hand or by an
   * earlier draw, in either colour order — is skipped, so drawing again after a
   * late entry creates only that entrant's bouts.
   *
   * The new bouts have no time, mat or panel. Scheduling them is a separate
   * decision, and leaving them unscheduled means a draw can never clash.
   */
  nested.post('/:categoryId/matches/draw', requireRole('referee'), async (req, res) => {
    // Nothing to configure yet. A body is still checked, so a mistyped option
    // is refused rather than quietly ignored.
    validate(req.body ?? {}, {})
    const { categoryId } = req.params
    await loadOrFail(categories, categoryId)

    // In the order they were entered, so the same field always draws the same
    // way rather than in whatever order the store returns.
    const entrants = (await competitors.list({ categoryId }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))

    if (entrants.length < 2) throw badRequest('not_enough_competitors')
    if (entrants.length > MAX_ROUND_ROBIN) {
      throw badRequest('too_many_for_round_robin', { max: MAX_ROUND_ROBIN, count: entrants.length })
    }

    const drawn = new Set(
      (await matches.list({ categoryId }))
        .filter((m) => m.redId && m.blueId)
        .map((m) => pairKey(m.redId, m.blueId))
    )

    const pairs = roundRobinPairs(entrants.map((c) => c.id))
    const fresh = pairs.filter(([red, blue]) => !drawn.has(pairKey(red, blue)))

    // One write for the lot: a bout at a time would be a hundred round trips
    // and a hundred change notices to every connected screen.
    if (fresh.length > 0) {
      await matches.insertMany(fresh.map(([redId, blueId]) => ({
        redId, blueId, status: 'open', categoryId,
      })))
    }

    res.status(201).json({
      created: fresh.length,
      skipped: pairs.length - fresh.length,
      total: pairs.length,
    })
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
    const { correctionReason, ...patch } = body.forPatch(req.body)
    const existing = await loadOrFail(matches, req.params.id)
    await assertCompetitorsInCategory(patch, existing.categoryId)

    // Rule 6: a completed result is never changed silently. Saving the same
    // result again (a console closing twice) is not a change.
    const changed = RESULT_FIELDS.filter((f) => f in patch && JSON.stringify(patch[f]) !== JSON.stringify(existing[f]))
    const correcting = isFinished(existing) && changed.length > 0
    if (correcting && !correctionReason) throw badRequest('correction_reason_required')
    if (Object.keys(patch).length === 0) return res.json({ match: existing })

    // A judges' average is a 0-10 score. Kumite bouts from a PRD draw store
    // points here instead, and points have no such ceiling (11-3 is a result).
    const category = await categories.get(existing.categoryId)
    for (const side of ['avgRed', 'avgBlue']) {
      if (category?.event !== 'kumite' && patch[side] > 10) throw badRequest(`invalid_${side}`)
    }

    await assertPeopleMakeSense(patch, existing.categoryId, existing)
    const schedule = await resolveSchedule(patch, existing.categoryId, existing, req.params.id)
    const match = await matches.update(req.params.id, { ...patch, ...schedule })

    // Rule 6 holds for every match, not only those from a PRD draw.
    if (correcting && audit && category) {
      await audit.record({
        tournamentId: category.tournamentId, actor: req.user, action: AUDIT_ACTIONS.MATCH_RESULT_CHANGED,
        entity: 'match', entityId: match.id, before: existing, after: match, reason: correctionReason,
        requestMeta: { ip: clientIp(req), userAgent: userAgent(req) },
      })
    }
    // A knockout result decides who fights next (section 36).
    if (tms && category?.divisionKey && match.stage === 'knockout') {
      await tms.syncBracket(category.tournamentId, category.divisionKey)
    }
    res.json({ match })
  })

  flat.delete('/:id', requireRole('admin'), async (req, res) => {
    await loadOrFail(matches, req.params.id)
    await matches.remove(req.params.id)
    res.status(204).end()
  })

  return { nested, flat }
}
