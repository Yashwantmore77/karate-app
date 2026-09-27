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
    res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization')
    res.setHeader('Access-Control-Max-Age', '600')

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    // Nothing here is meant to be framed, and a JSON API has no reason to be.
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')

    if (req.method === 'OPTIONS') return res.sendStatus(204)
    return next()
  }
}
