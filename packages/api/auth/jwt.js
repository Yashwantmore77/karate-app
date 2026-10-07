import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

const ALGORITHM = 'HS256'
export const TOKEN_TTL = '12h' // a tournament day

// A secret must come from the environment in anything but local development.
// Falling back to a random one per boot is deliberate: it keeps tokens
// unforgeable and makes a missing secret obvious (tokens stop surviving a
// restart) instead of shipping a known default.
const secret = process.env.JWT_SECRET || randomBytes(32).toString('hex')

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — using a per-boot random secret')
}

export const signToken = (user, sid = null) =>
  jwt.sign(
    { uid: user.uid, email: user.email, role: user.role, seat: user.seat, ...(sid ? { sid } : {}) },
    secret,
    { algorithm: ALGORITHM, expiresIn: TOKEN_TTL, subject: user.uid }
  )

/**
 * A coach's session, opened through a tournament's registration link rather
 * than an account. It names the one tournament (and, once registered, the one
 * team) it may touch; the service enforces both.
 */
export const signCoachToken = ({ linkId, tournamentId, teamId = null, sid = null, email = null }) =>
  jwt.sign(
    { uid: `coach:${linkId}`, role: 'coach', tournamentId, teamId, linkId, ...(sid ? { sid } : {}), ...(email ? { email } : {}) },
    secret,
    { algorithm: ALGORITHM, expiresIn: TOKEN_TTL, subject: `coach:${linkId}` }
  )

/** Returns the claims, or null for anything that does not verify. */
export function verifyToken(token) {
  if (!token) return null
  try {
    // Pinning the algorithm stops a token from choosing its own, which is how
    // "alg: none" and HMAC/RSA confusion attacks get in.
    return jwt.verify(token, secret, { algorithms: [ALGORITHM] })
  } catch {
    return null
  }
}
