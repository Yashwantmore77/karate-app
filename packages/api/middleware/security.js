/**
 * Response hardening and CORS.
 *
 * Written out rather than pulled from helmet/cors: this API serves JSON to one
 * known origin, so the handful of headers that actually apply are clearer than
 * a dependency whose defaults assume it is serving HTML.
 */
export function security({ allowedOrigin }) {
  return (req, res, next) => {
    // The token travels in a header, never a cookie, so credentialed requests
    // are deliberately not allowed — that is what keeps a wildcard origin from
    // being dangerous when one is configured for local development.
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    // Idempotency-Key lets a browser retry a write safely (PRD v1 §25).
    res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,idempotency-key')
    res.setHeader('Access-Control-Max-Age', '600')

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    // Nothing here is meant to be framed, and a JSON API has no reason to be.
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    // Browsers that reached the API over HTTPS keep using it (production only,
    // so a local http server is never pinned).
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    // Responses carry tokens and private data; no shared cache may keep them.
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'OPTIONS') return res.sendStatus(204)
    return next()
  }
}
