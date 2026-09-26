import { Router } from 'express'
import { authenticate } from '../auth/users.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth } from '../auth/middleware.js'
import { rateLimit } from '../lib/rateLimit.js'
import { unauthorized } from '../lib/errors.js'

const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 10

export function authRoutes() {
  const router = Router()

  // Throttled per address so the one unauthenticated write on the API cannot be
  // walked through a password list.
  const loginLimit = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX_ATTEMPTS,
    code: 'too_many_attempts',
  })

  router.post('/login', loginLimit, async (req, res) => {
    const { email, password } = req.body || {}
    const user = await authenticate(email, password)
    // One undifferentiated failure: never say which half was wrong.
    if (!user) throw unauthorized('invalid_credentials')
    res.json({ token: signToken(user), user })
  })

  // The token is self-describing, so this needs no store read — it reports the
  // claims the caller actually presented.
  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

  return router
}
