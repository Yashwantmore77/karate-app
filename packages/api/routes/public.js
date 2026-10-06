import { Router } from 'express'
import { validate } from '../lib/validate.js'
import { rateLimit } from '../lib/rateLimit.js'
import { signCoachToken } from '../auth/jwt.js'

/**
 * PRD sections 39 and 54, and the registration link of section 14. No sign-in,
 * so everything here is either read-only and stripped of private fields by the
 * service (Rule 8), or the password check that opens a coach session — which is
 * rate limited like the login it effectively is.
 */
export function publicRoutes(tms) {
  const router = Router()

  const linkAttempts = rateLimit({
    windowMs: 60_000,
    max: 10,
    code: 'too_many_attempts',
    keyOf: (req) => `${req.ip || 'unknown'}|${req.params.token}`,
  })

  router.get('/tournaments', async (_req, res) => res.json({ tournaments: await tms.publicList() }))

  router.get('/tournaments/:idOrSlug', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await tms.publicView(req.params.idOrSlug))
  })

  router.get('/register/:token', async (req, res) => res.json(await tms.linkInfo(req.params.token)))

  router.post('/register/:token/session', linkAttempts, async (req, res) => {
    const { password } = validate(req.body || {}, { password: { type: 'string', min: 0, max: 100, trim: false, nullable: true } })
    const session = await tms.openLink(req.params.token, password || '')
    res.json({ token: signCoachToken(session), tournamentId: session.tournamentId })
  })

  return router
}
