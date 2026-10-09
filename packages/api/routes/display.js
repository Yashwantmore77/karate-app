import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { validate } from '../lib/validate.js'

// The one document a hall screen reads. A singleton rather than a row per
// match: a display has no way to know which match it should be showing, so the
// question it asks is "what is on right now".
const LIVE_ID = 'live'

const DISPLAY_SCHEMA = {
  status: { type: 'enum', values: ['open', 'closed'], required: true },
  matchId: { type: 'string', max: 60, nullable: true },
  fieldNumber: { type: 'string', max: 10, nullable: true },
  aoName: { type: 'string', max: 80, nullable: true },
  akaName: { type: 'string', max: 80, nullable: true },
  aoScore: { type: 'integer', min: 0, max: 999, nullable: true },
  akaScore: { type: 'integer', min: 0, max: 999, nullable: true },
  senshu: { type: 'enum', values: ['ao', 'aka'], nullable: true },
  // The clock anchor, verbatim. A display derives the ticking value from it
  // locally, which is the only way every screen can agree to the second.
  clock: { type: 'object', nullable: true },
  heartbeatAt: { type: 'integer', min: 0, nullable: true },
  // PRD section 38: what the hall reads around the scores.
  category: { type: 'string', max: 120, nullable: true },
  matchNumber: { type: 'string', max: 20, nullable: true },
  round: { type: 'string', max: 60, nullable: true },
  outcome: { type: 'string', max: 80, nullable: true },
  // The bout after this one on the same mat: { matchNumber, akaName, aoName, category }.
  next: { type: 'object', nullable: true },
  // PRD v1 §15: clear AKA/AO identity and club.
  akaClub: { type: 'string', max: 120, nullable: true },
  aoClub: { type: 'string', max: 120, nullable: true },
  // An announcement over the board, set by the scoreboard operator.
  message: { type: 'string', max: 200, nullable: true },
}

// PRD v1 §17: one screen per mat. Each mat has its own document ("mat-2");
// the original "live" document keeps showing whichever mat published last,
// so a single hall screen still works. An announcement can go to the whole
// hall (on "live") or to one mat.
const MAX_MAT = 20
const matOf = (req) => {
  const n = Number(req.query.mat)
  return Number.isInteger(n) && n >= 1 && n <= MAX_MAT ? n : null
}
const docId = (mat) => (mat ? `mat-${mat}` : LIVE_ID)
/** The mat a display document belongs to ("mat-2" → 2), or null for the hall's. */
export const matOfDoc = (id) => {
  const n = Number(/^mat-(\d+)$/.exec(String(id))?.[1])
  return Number.isInteger(n) && n >= 1 && n <= MAX_MAT ? n : null
}
/** What one mat's screen shows: its own row, with its announcement or else the hall's. */
export const matScreen = (row, hall, mat) => ({ ...(row || { status: 'closed' }), mat, message: row?.message || hall?.message || null })

export function displayRoutes(stores) {
  const router = Router()
  const { display } = stores

  const upsert = async (id, patch) => {
    const existing = await display.get(id)
    return existing ? display.update(id, patch) : display.insert({ status: 'closed', ...patch, id })
  }

  /**
   * Public by design: a scoreboard is a screen bolted to a wall in a sports
   * hall, and nobody is going to sign it in. It exposes only what the audience
   * is already watching — names, scores, the clock — and it is read-only.
   */
  router.get('/', async (req, res) => {
    // A stale score on a wall is worse than no score, so nothing may cache it.
    res.setHeader('Cache-Control', 'no-store')
    const mat = matOf(req)
    const hall = await display.get(LIVE_ID)
    if (!mat) return res.json({ display: hall ?? null })
    res.json({ display: matScreen(await display.get(docId(mat)), hall, mat) })
  })

  // Publishing stays with whoever is running the mat, or the scoreboard
  // operator (PRD v1 §4: display control, no scoring authority).
  router.put('/', requireAuth, requireRole('referee', 'scoreboard_operator'), async (req, res) => {
    const payload = validate(req.body, DISPLAY_SCHEMA)
    const mat = matOf(req) || (Number.isInteger(Number(payload.fieldNumber)) ? matOf({ query: { mat: payload.fieldNumber } }) : null)
    // A referee's update never carries the operator's announcement away.
    const { message, ...scores } = payload
    const hall = await display.get(LIVE_ID)
    let saved
    if (mat) {
      const before = await display.get(docId(mat))
      saved = await upsert(docId(mat), { ...scores, ...(message !== undefined ? { message } : {}) })
      // The hall screen follows the latest bout, and closes with it.
      const hallShowsThis = !hall || hall.status !== 'open' || hall.matchId === (scores.matchId ?? before?.matchId) || String(hall.fieldNumber) === String(mat)
      if (scores.status === 'open' || hallShowsThis) await upsert(LIVE_ID, { ...scores, fieldNumber: scores.fieldNumber ?? String(mat) })
    } else {
      saved = await upsert(LIVE_ID, { ...scores, ...(message !== undefined ? { message } : {}) })
    }
    res.json({ display: saved })
  })

  // Just the announcement line, without touching the scores; ?mat=N for one mat.
  router.patch('/message', requireAuth, requireRole('referee', 'scoreboard_operator'), async (req, res) => {
    const { message } = validate(req.body, { message: { type: 'string', max: 200, nullable: true } })
    res.json({ display: await upsert(docId(matOf(req)), { message: message || null }) })
  })

  return router
}
