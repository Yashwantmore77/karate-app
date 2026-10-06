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
}

export function displayRoutes(stores) {
  const router = Router()
  const { display } = stores

  /**
   * Public by design: a scoreboard is a screen bolted to a wall in a sports
   * hall, and nobody is going to sign it in. It exposes only what the audience
   * is already watching — names, scores, the clock — and it is read-only.
   */
  router.get('/', async (_req, res) => {
    // A stale score on a wall is worse than no score, so nothing may cache it.
    res.setHeader('Cache-Control', 'no-store')
    res.json({ display: (await display.get(LIVE_ID)) ?? null })
  })

  // Publishing stays with whoever is running the mat.
  router.put('/', requireAuth, requireRole('referee'), async (req, res) => {
    const payload = validate(req.body, DISPLAY_SCHEMA)
    const existing = await display.get(LIVE_ID)
    const saved = existing
      ? await display.update(LIVE_ID, payload)
      : await display.insert({ ...payload, id: LIVE_ID })
    res.json({ display: saved })
  })

  return router
}
