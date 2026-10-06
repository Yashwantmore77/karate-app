import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { bodyReader, loadOrFail } from './resource.js'
import { badRequest } from '../lib/errors.js'
import { createAuditLog, AUDIT_ACTIONS } from '../lib/audit.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'

const MATCH_SCHEMA = {
  redId: { type: 'string', max: 60, nullable: true },
  blueId: { type: 'string', max: 60, nullable: true },
  status: { type: 'enum', values: ['scheduled', 'open', 'live', 'completed'], default: 'open' },
  // Both vocabularies are accepted because both exist in this system: kata
  // scores red against blue, kumite runs ao against aka.
  winner: { type: 'enum', values: ['red', 'blue', 'tie', 'ao', 'aka', 'draw'], nullable: true },
  // Kata averages sit in 0-10, but the kumite console stores points here too,
  // and a kumite score passes 10 (an 8-point gap win can end 11-3).
  avgRed: { type: 'number', min: 0, max: 99, nullable: true },
  avgBlue: { type: 'number', min: 0, max: 99, nullable: true },
  mat: { type: 'integer', min: 1, max: 99, nullable: true },
  // The outcome as the console settled it — scores, penalties, how it ended.
  // Opaque here: the rules engine owns its shape, and restating it in this
  // schema would mean two definitions to keep in step.
  result: { type: 'object', nullable: true },
  // Section 25/37 scheduling, set on bouts generated from a PRD draw.
  scheduledAt: { type: 'string', max: 30, nullable: true },
  refereeId: { type: 'string', max: 80, nullable: true },
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
  const { categories, competitors, matches } = stores
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
    const { correctionReason, ...patch } = body.forPatch(req.body)
    const existing = await loadOrFail(matches, req.params.id)
    await assertCompetitorsInCategory(patch, existing.categoryId)

    // Rule 6: a completed result is never changed silently. Saving the same
    // result again (a console closing twice) is not a change.
    const changed = RESULT_FIELDS.filter((f) => f in patch && patch[f] !== existing[f])
    const correcting = isFinished(existing) && changed.length > 0
    if (correcting && !correctionReason) throw badRequest('correction_reason_required')
    if (Object.keys(patch).length === 0) return res.json({ match: existing })

    // A judges' average is a 0-10 score. Kumite bouts from a PRD draw store
    // points here instead, and points have no such ceiling (11-3 is a result).
    const category = await categories.get(existing.categoryId)
    for (const side of ['avgRed', 'avgBlue']) {
      if (category?.event !== 'kumite' && patch[side] > 10) throw badRequest(`invalid_${side}`)
    }

    const match = await matches.update(req.params.id, patch)
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
