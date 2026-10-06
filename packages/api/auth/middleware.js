import { verifyToken } from './jwt.js'
import { unauthorized, forbidden } from '../lib/errors.js'
import { can } from '@kumite/shared/permissions.js'

const bearer = (header) => {
  const value = String(header || '')
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

/** HTTP: rejects anything without a valid token, and attaches req.user. */
export function requireAuth(req, _res, next) {
  const claims = verifyToken(bearer(req.headers.authorization))
  if (!claims) return next(unauthorized())
  req.user = claims
  return next()
}

/** HTTP: use after requireAuth. Admin passes every role gate. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next()
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
    if (can(req.user.role, permission)) return next()
    return next(forbidden())
  }
}

/**
 * PRD sections 4 and 49: an account limited to some tournaments reaches only
 * those. Read from the account on every request rather than from the token,
 * so taking someone off a tournament takes effect at once.
 */
export const mayAccessTournament = (account, tournamentId) =>
  !account?.tournamentIds?.length || account.role === 'super_admin' || account.tournamentIds.includes(tournamentId)

export function tournamentAccess(findAccount) {
  return async (req, _res, next, tournamentId) => {
    try {
      if (!req.user) return next(unauthorized())
      if (req.user.role === 'coach') return next(req.user.tournamentId === tournamentId ? undefined : forbidden('tournament_forbidden'))
      const account = await findAccount(req.user.uid)
      if (!account) return next(unauthorized())
      return next(mayAccessTournament(account, tournamentId) ? undefined : forbidden('tournament_forbidden'))
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
  socket.user = claims
  next()
}

export const canControlMat = (user) => user?.role === 'referee' || user?.role === 'admin'
