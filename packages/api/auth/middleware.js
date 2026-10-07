import { verifyToken } from './jwt.js'
import { unauthorized, forbidden } from '../lib/errors.js'
import { can, roleIn } from '@kumite/shared/permissions.js'
import { sessionActive } from './sessions.js'

const bearer = (header) => {
  const value = String(header || '')
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

/** HTTP: rejects anything without a valid token, and attaches req.user. */
export function requireAuth(req, _res, next) {
  const claims = verifyToken(bearer(req.headers.authorization))
  if (!claims) return next(unauthorized())
  // A session ended elsewhere ends this token too (PRD v1 §26 sessions).
  sessionActive(claims.sid).then((active) => {
    if (!active) return next(unauthorized('session_revoked'))
    req.user = claims
    return next()
  }, next)
}

/** HTTP: use after requireAuth. Admin passes every role gate. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (['admin', 'super_admin'].includes(req.user.role) || roles.includes(req.user.role)) return next()
    return next(forbidden())
  }
}

/**
 * HTTP: use after requireAuth. Checks the shared permission table (PRD section
 * 3), so a role's reach is decided in one place for the API and the web alike.
 */
export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (req.user.role === 'coach') return next(forbidden())
    // Inside a tournament the account's role there decides (PRD v1 §4).
    if (can(req.tournamentRole || req.user.role, permission)) return next()
    return next(forbidden())
  }
}

/**
 * PRD sections 4 and 49: an account limited to some tournaments reaches only
 * those. Read from the account on every request rather than from the token,
 * so taking someone off a tournament takes effect at once.
 *
 * PRD point 33 (SaaS): an account in an organisation reaches only that
 * organisation's tournaments. A super admin reaches everything.
 */
export const mayAccessTournament = (account, tournamentId, tournament = null) => {
  if (account?.role === 'super_admin') return true
  // A role given for this tournament is access to it.
  if (account?.tournamentRoles?.[tournamentId]) return true
  if (account?.organizationId && tournament && tournament.organizationId !== account.organizationId) return false
  return !account?.tournamentIds?.length || account.tournamentIds.includes(tournamentId)
}

// Set by the app at start-up, so the guards can read a tournament's
// organisation without every router passing its stores in.
let lookupTournament = async () => null
export const setTournamentLookup = (fn) => { lookupTournament = fn }
export const tournamentFor = (id) => lookupTournament(id)

export function tournamentAccess(findAccount) {
  return async (req, _res, next, tournamentId) => {
    try {
      if (!req.user) return next(unauthorized())
      if (req.user.role === 'coach') return next(req.user.tournamentId === tournamentId ? undefined : forbidden('tournament_forbidden'))
      const account = await findAccount(req.user.uid)
      if (!account) return next(unauthorized())
      const tournament = account.organizationId ? await lookupTournament(tournamentId) : null
      if (!mayAccessTournament(account, tournamentId, tournament)) return next(forbidden('tournament_forbidden'))
      req.tournamentRole = roleIn(account, tournamentId)
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

/** HTTP: a coach session, scoped to the tournament its link belongs to. */
export function requireCoach(req, _res, next) {
  if (!req.user) return next(unauthorized())
  if (req.user.role !== 'coach' || !req.user.tournamentId) return next(forbidden())
  return next()
}

/**
 * Socket handshake guard. A connection carries its identity from the start, so
 * no event handler has to wonder who is on the other end.
 */
export function socketAuth(socket, next) {
  const token = socket.handshake?.auth?.token
    || bearer(socket.handshake?.headers?.authorization)
  const claims = verifyToken(token)
  if (!claims) return next(Object.assign(new Error('unauthorized'), { data: { code: 'unauthorized' } }))
  sessionActive(claims.sid).then((active) => {
    if (!active) return next(Object.assign(new Error('unauthorized'), { data: { code: 'session_revoked' } }))
    socket.user = claims
    return next()
  }, () => next(Object.assign(new Error('unauthorized'), { data: { code: 'unauthorized' } })))
}

export const canControlMat = (user) => user?.role === 'referee' || user?.role === 'admin'
