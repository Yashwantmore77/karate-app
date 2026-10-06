import { ApiError } from '../lib/errors.js'
import { DomainError } from '@kumite/shared/errors.js'

/** A body larger than the limit arrives here as a parser error, not a crash. */
const isBodyTooLarge = (err) => err?.type === 'entity.too.large'
const isMalformedJson = (err) => err instanceof SyntaxError && 'body' in err

/**
 * The single place a failure becomes a response.
 *
 * An ApiError carries the status the route chose. Everything else is a bug, and
 * reports as a bare 500: the message and stack stay in the server log, because
 * a stack trace in a response body is free reconnaissance.
 */
export function errorHandler(logger = console) {
  return (err, req, res, _next) => {
    if (res.headersSent) return

    // A business rule from the shared tournament service: as deliberate as an
    // ApiError, and answered the same way.
    if (err instanceof ApiError || err instanceof DomainError) {
      const body = { error: err.code }
      if (err.details) body.details = err.details
      return res.status(err.status).json(body)
    }

    if (isBodyTooLarge(err)) return res.status(413).json({ error: 'payload_too_large' })
    if (isMalformedJson(err)) return res.status(400).json({ error: 'invalid_json' })

    logger.error(`[api] unhandled error on ${req.method} ${req.originalUrl}`, err)
    return res.status(500).json({ error: 'internal_error' })
  }
}

/** Anything the router never matched, answered in the same shape as the rest. */
export const notFoundHandler = (_req, res) => res.status(404).json({ error: 'route_not_found' })
