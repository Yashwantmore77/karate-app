import { Router } from 'express'
import { authenticate } from '../auth/users.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { recordLogin, listLogins } from '../auth/loginLog.js'
import { rateLimit } from '../lib/rateLimit.js'
import { unauthorized } from '../lib/errors.js'

const LOGIN_WINDOW_MS = 60_000

// Two ceilings, because no single one does both jobs.
//
// The per-account limit is what stops one password being guessed. Keying it on
// the address alone, as it was, spends a single shared budget on everyone
// behind a venue's one NAT — a room of officials signing in at the same desk
// could lock each other out before the first match.
//
// The per-address limit still has to exist: keyed only on the account, a caller
// could walk one common password across every address they can think of and
// never meet a limit. It sits high enough that a whole room signing in at once
// never reaches it.
const LOGIN_MAX_PER_ACCOUNT = 10
const LOGIN_MAX_PER_ADDRESS = 60

const attemptedEmail = (req) => String(req.body?.email || '').trim().toLowerCase() || 'unknown'

export function authRoutes() {
  const router = Router()

  const perAccount = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX_PER_ACCOUNT,
    code: 'too_many_attempts',
    keyOf: (req) => `${req.ip || 'unknown'}|${attemptedEmail(req)}`,
  })

  const perAddress = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX_PER_ADDRESS,
    code: 'too_many_attempts',
  })

  router.post('/login', perAddress, perAccount, async (req, res) => {
    // `coords` is optional and self-reported: the browser sends it only where it
    // has been granted location permission, and the log marks it as a claim.
    const { email, password, coords } = req.body || {}
    const user = await authenticate(email, password)

    if (!user) {
      recordLogin({ req, email, outcome: 'invalid_credentials', coords })
      // One undifferentiated failure: never say which half was wrong.
      throw unauthorized('invalid_credentials')
    }

    res.json({ token: signToken(user), user })
    // After the response: the record is for us, and the person signing in
    // should not wait on a database write they get nothing from.
    recordLogin({ req, email, user, outcome: 'success', coords })
  })

  // The token is self-describing, so this needs no store read — it reports the
  // claims the caller actually presented.
  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

  // Reading the trail is an administrator's business, and only theirs: it holds
  // every other account's addresses and whereabouts.
  router.get('/logins', requireAuth, requireRole('admin'), async (req, res) => {
    const { limit, email, outcome } = req.query
    res.json({ logins: await listLogins({ limit, email, outcome }) })
  })

  // Attempts stopped by a limiter never reach the handler, and those are
  // exactly the ones worth seeing — a burst of them is what an attack looks
  // like from here. The error carries on to the real handler untouched.
  router.use((err, req, _res, next) => {
    if (err?.code === 'too_many_attempts') {
      recordLogin({ req, email: req.body?.email, outcome: 'rate_limited' })
    }
    next(err)
  })

  return router
}
