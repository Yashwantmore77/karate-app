import { Router } from 'express'
import { authenticate, findUserRecord, findUserRecordByEmail, setSecurity } from '../auth/users.js'
import { issueReset, redeemReset } from '../auth/resets.js'
import { newSecret, verifyTotp, otpauthUrl } from '../auth/totp.js'
import { sendMail } from '../lib/mailer.js'
import { validate } from '../lib/validate.js'
import { signToken } from '../auth/jwt.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { recordLogin, listLogins } from '../auth/loginLog.js'
import { rateLimit } from '../lib/rateLimit.js'
import { badRequest, unauthorized } from '../lib/errors.js'

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
    const { email, password, coords, code } = req.body || {}
    const found = await authenticate(email, password)

    if (!found) {
      recordLogin({ req, email, outcome: 'invalid_credentials', coords })
      // One undifferentiated failure: never say which half was wrong.
      throw unauthorized('invalid_credentials')
    }

    // PRD section 4: optional second factor. Asked for only after the
    // password checks out, so it reveals nothing to someone guessing.
    const { twoFactorSecret, ...user } = found
    if (twoFactorSecret) {
      if (!code) throw unauthorized('two_factor_required')
      if (!verifyTotp(twoFactorSecret, code)) {
        recordLogin({ req, email, outcome: 'invalid_two_factor', coords })
        throw unauthorized('invalid_two_factor')
      }
    }

    res.json({ token: signToken(user), user })
    // After the response: the record is for us, and the person signing in
    // should not wait on a database write they get nothing from.
    recordLogin({ req, email, user, outcome: 'success', coords })
  })

  // --- forgot / reset password (PRD section 4) -------------------------------

  const resetRequests = rateLimit({ windowMs: 15 * 60_000, max: 5, code: 'too_many_attempts', keyOf: (req) => `${req.ip || 'unknown'}|${attemptedEmail(req)}` })

  // Always the same answer, so the form cannot be used to find out which
  // addresses have accounts.
  router.post('/forgot', resetRequests, async (req, res) => {
    const { email } = validate(req.body || {}, { email: { type: 'string', required: true, max: 200, lowercase: true } })
    const user = await findUserRecordByEmail(email)
    if (user) {
      const token = await issueReset(user.uid)
      // Never from the request: a forged Origin would send a valid reset
      // link to someone else's site.
      const configured = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? process.env.CORS_ORIGIN : null
      const base = process.env.APP_URL || configured || 'http://localhost:5173'
      await sendMail({
        to: user.email,
        subject: 'Reset your password',
        text: `Someone asked to reset the password for ${user.email}.\n\nOpen this link within 30 minutes to choose a new one:\n${base}/reset-password?token=${token}\n\nIf it was not you, ignore this email; your password stays as it is.`,
      })
    }
    res.json({ ok: true })
  })

  router.post('/reset', resetRequests, async (req, res) => {
    const { token, password } = validate(req.body || {}, {
      token: { type: 'string', required: true, max: 200 },
      password: { type: 'string', required: true, min: 8, max: 200, trim: false },
    })
    const uid = await redeemReset(token)
    if (!uid) throw badRequest('invalid_or_expired_token')
    await setSecurity(uid, { password })
    res.json({ ok: true })
  })

  // --- two-factor (optional, for administrators) -----------------------------

  router.post('/2fa/setup', requireAuth, async (req, res) => {
    const user = await findUserRecord(req.user.uid)
    if (!user) throw unauthorized()
    const secret = newSecret()
    await setSecurity(user.uid, { pendingTwoFactorSecret: secret })
    res.json({ secret, otpauthUrl: otpauthUrl(secret, user.email) })
  })

  router.post('/2fa/enable', requireAuth, async (req, res) => {
    const { code } = validate(req.body || {}, { code: { type: 'string', required: true, max: 12 } })
    const user = await findUserRecord(req.user.uid)
    if (!user?.pendingTwoFactorSecret || !verifyTotp(user.pendingTwoFactorSecret, code)) throw badRequest('invalid_two_factor')
    await setSecurity(user.uid, { twoFactorSecret: user.pendingTwoFactorSecret, pendingTwoFactorSecret: null })
    res.json({ twoFactorEnabled: true })
  })

  router.post('/2fa/disable', requireAuth, async (req, res) => {
    const { code } = validate(req.body || {}, { code: { type: 'string', required: true, max: 12 } })
    const user = await findUserRecord(req.user.uid)
    if (!user?.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) throw badRequest('invalid_two_factor')
    await setSecurity(user.uid, { twoFactorSecret: null })
    res.json({ twoFactorEnabled: false })
  })

  router.get('/account', requireAuth, async (req, res) => {
    const user = await findUserRecord(req.user.uid)
    if (!user) throw unauthorized()
    res.json({ account: { uid: user.uid, email: user.email, role: user.role, twoFactorEnabled: !!user.twoFactorSecret, tournamentIds: user.tournamentIds || [] } })
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
