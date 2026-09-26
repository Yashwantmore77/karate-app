import { tooManyRequests } from './errors.js'

/**
 * Fixed-window limiter, keyed per caller.
 *
 * Deliberately in-process: a tournament runs one API instance on one venue
 * machine, so a shared counter would add a dependency for no gain. Behind
 * several instances this would need moving to a shared store, which is why the
 * key function is injectable rather than hardcoded to the address.
 */
export function rateLimit({ windowMs, max, keyOf = (req) => req.ip || 'unknown', code }) {
  const hits = new Map()

  // Windows are only evicted on access, so a long-lived process would otherwise
  // hold a row per address seen. Sweeping on each call keeps it bounded.
  const sweep = (now) => {
    for (const [key, record] of hits) {
      if (now - record.start > windowMs) hits.delete(key)
    }
  }

  return (req, _res, next) => {
    const now = Date.now()
    if (hits.size > 1000) sweep(now)

    const key = keyOf(req)
    const record = hits.get(key)

    if (!record || now - record.start > windowMs) {
      hits.set(key, { start: now, count: 1 })
      return next()
    }

    record.count += 1
    if (record.count > max) return next(tooManyRequests(code))
    return next()
  }
}
