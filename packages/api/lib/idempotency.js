// PRD v1 §15, §25: "idempotent scoring/payment callbacks". A write sent with
// an Idempotency-Key header is carried out once; a retry with the same key
// (same caller, same route) gets the first answer back instead of a second
// write. Kept in process for ten minutes, which covers a venue's flaky Wi-Fi.

const TTL_MS = 10 * 60_000
const MAX = 5000

export function idempotency() {
  const seen = new Map()
  return (req, res, next) => {
    const key = req.headers['idempotency-key']
    if (!key || !['POST', 'PUT', 'PATCH'].includes(req.method)) return next()
    const caller = String(req.headers.authorization || '').slice(-24) || req.ip
    const id = `${caller}|${req.method}|${req.originalUrl}|${String(key).slice(0, 100)}`
    const now = Date.now()
    const hit = seen.get(id)
    if (hit && now - hit.at < TTL_MS) {
      if (hit.pending) return res.status(409).json({ error: 'request_in_progress' })
      res.setHeader('Idempotent-Replay', 'true')
      return res.status(hit.status).json(hit.body)
    }
    seen.set(id, { at: now, pending: true })
    if (seen.size > MAX) for (const [k, v] of seen) { if (now - v.at > TTL_MS) seen.delete(k); if (seen.size <= MAX) break }
    const json = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode < 500) seen.set(id, { at: now, status: res.statusCode, body })
      else seen.delete(id)
      return json(body)
    }
    res.on('close', () => { if (seen.get(id)?.pending) seen.delete(id) })
    return next()
  }
}
