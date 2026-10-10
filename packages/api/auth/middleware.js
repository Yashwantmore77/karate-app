import { verifyToken } from './jwt.js'
import { unauthorized, forbidden } from '../lib/errors.js'
import { can, roleIn, reachesOnlyAssigned, actsAsTournamentAdmin } from '@kumite/shared/permissions.js'
import { sessionActive } from './sessions.js'

const bearer = (header) => {
  const value = String(header || '')
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

/**
 * Who is calling, for counting requests: the signed-in session when the
 * request carries a valid token, else the address it came from. A whole venue
 * shares one address (the hall Wi-Fi), so counting officials by address lets
 * a few busy screens lock every one of them out.
 */
export function callerKey(req) {
  const claims = verifyToken(bearer(req.headers.authorization))
  return claims ? `session:${claims.sid || claims.uid}` : `address:${req.ip || 'unknown'}`
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

/**
 * HTTP: use after requireAuth. Admin passes every role gate.
 *
 * This is the gate for the surfaces that belong to the installation rather
 * than to one tournament: accounts, sign-ins, creating and deleting
 * tournaments, organisations, rulesets and backups. A tournament owner is not
 * an administrator of the system and never passes it. For work inside a
 * tournament use requireTournamentAdmin below.
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (['admin', 'super_admin'].includes(req.user.role) || roles.includes(req.user.role)) return next()
    return next(forbidden())
  }
}

/**
 * HTTP: use after requireAuth on a route that is already scoped to one
 * tournament. Admins, super admins and tournament owners pass; name any other
 * role that may also do this action (a referee generating a draw, say).
 *
 * This answers only "may this role do this?". Whether the tournament is the
 * caller's is answered where the record is loaded — tournamentAccess for a
 * nested route, the category and match guards for a flat one — so a route
 * must still resolve its tournament, as every route here already does.
 */
export function requireTournamentAdmin(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (actsAsTournamentAdmin(req.user.role) || roles.includes(req.user.role)) return next()
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
  // The organisation boundary comes first: nothing granted on an account,
  // a role for one tournament included, reaches another organisation's events.
  if (account?.organizationId && tournament && tournament.organizationId !== account.organizationId) return false
  // A role given for this tournament is access to it.
  if (account?.tournamentRoles?.[tournamentId]) return true
  // A tournament owner reaches exactly what it was given. An empty list means
  // none: the account exists before anyone assigns it an event, and until
  // then it must see nothing.
  if (reachesOnlyAssigned(account?.role)) return !!account?.tournamentIds?.includes(tournamentId)
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
