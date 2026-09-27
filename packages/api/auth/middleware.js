import { verifyToken } from './jwt.js'
import { unauthorized, forbidden } from '../lib/errors.js'

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
