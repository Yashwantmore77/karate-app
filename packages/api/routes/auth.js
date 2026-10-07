import { Router } from 'express'
import { authenticate, findUserRecord, findUserRecordByEmail, setSecurity } from '../auth/users.js'
import { issueReset, redeemReset } from '../auth/resets.js'
import { newSecret, verifyTotp, otpauthUrl } from '../auth/totp.js'
import { sendMail } from '../lib/mailer.js'
import { validate } from '../lib/validate.js'
import { signToken, signCoachToken } from '../auth/jwt.js'
import { createSession, listSessions, revokeSession, revokeOtherSessions } from '../auth/sessions.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { recordLogin, listLogins } from '../auth/loginLog.js'
import { rateLimit } from '../lib/rateLimit.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
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

export function authRoutes({ audit = async () => {} } = {}) {
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
      audit(null, { action: 'auth.login_failed', entity: 'user', entityId: attemptedEmail(req), meta: { ip: clientIp(req), userAgent: userAgent(req) } }).catch(() => {})
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

    const sid = await createSession({ uid: user.uid, ip: clientIp(req), userAgent: userAgent(req) })
    // PRD v1 §7: a team manager's own login opens their team's coach session.
    const token = user.role === 'coach'
      ? signCoachToken({ linkId: `account:${user.uid}`, tournamentId: user.tournamentId, teamId: user.teamId, sid, email: user.email })
      : signToken(user, sid)
    res.json({ token, user })
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
    res.json({ account: { uid: user.uid, email: user.email, role: user.role, twoFactorEnabled: !!user.twoFactorSecret, tournamentIds: user.tournamentIds || [], tournamentRoles: user.tournamentRoles || {} } })
  })

  // The token is self-describing, so this needs no store read — it reports the
  // claims the caller actually presented.
  // Claims plus what the account says now: roles per tournament change
  // without a new sign-in (PRD v1 §4).
  // PRD v1 §22 audit: sign-outs are recorded, and end the session.
  router.post('/logout', requireAuth, async (req, res) => {
    if (req.user.sid) await revokeSession(req.user.sid, req.user.uid)
    await audit(req.user, { action: 'auth.logout', entity: 'user', entityId: req.user.uid, meta: { ip: clientIp(req), userAgent: userAgent(req) } })
    res.status(204).end()
  })

  // PRD v1 §26: the person's own sessions, and ending them.
  router.get('/sessions', requireAuth, async (req, res) => {
    const rows = await listSessions(req.user.uid)
    res.json({ sessions: rows.map((r) => ({ sid: r.sid, ip: r.ip, userAgent: r.userAgent, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, current: r.sid === req.user.sid })) })
  })
  router.delete('/sessions/:sid', requireAuth, async (req, res) => {
    if (!(await revokeSession(req.params.sid, req.user.uid))) throw badRequest('session_not_found')
    await audit(req.user, { action: 'auth.session_revoked', entity: 'user', entityId: req.user.uid, after: { sid: req.params.sid } })
    res.status(204).end()
  })
  router.post('/sessions/revoke-others', requireAuth, async (req, res) => {
    const count = await revokeOtherSessions(req.user.uid, req.user.sid)
    if (count) await audit(req.user, { action: 'auth.session_revoked', entity: 'user', entityId: req.user.uid, after: { others: count } })
    res.json({ revoked: count })
  })

  router.get('/me', requireAuth, async (req, res) => {
    const account = req.user.role === 'coach' ? null : await findUserRecord(req.user.uid)
    res.json({ user: { ...req.user, ...(account ? { tournamentRoles: account.tournamentRoles || {}, organizationId: account.organizationId || null } : {}) } })
  })

  // Reading the trail is an administrator's business, and only theirs: it holds
  // every other account's addresses and whereabouts.
  router.get('/logins', requireAuth, requireRole('admin'), async (req, res) => {
    const { page, limit } = readPageQuery(req.query)
    const { email, outcome } = req.query
    const { rows, total } = await listLogins({ page, limit, email, outcome })
    res.json({ logins: rows, ...pageMeta({ page, limit, total }) })
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
