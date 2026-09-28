import { badRequest } from './errors.js'

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100
const MAX_SEARCH_LENGTH = 100

const readPositiveInt = (raw, field, fallback) => {
  if (raw === undefined || raw === '') return fallback
  // Query strings are text, so this is the one place a number arrives as one.
  if (!/^\d+$/.test(String(raw))) throw badRequest(`invalid_${field}`)
  const value = Number(raw)
  if (value < 1) throw badRequest(`invalid_${field}`)
  return value
}

/**
 * Reads page, limit and q off a query string.
 *
 * `limit` is clamped rather than rejected: a caller asking for more than the
 * maximum wants as much as it can get, and failing the request teaches it
 * nothing it could not have guessed. An unparseable value is still an error,
 * because that is a bug in the caller rather than an ambitious request.
 */
export function readPageQuery(query = {}) {
  const page = readPositiveInt(query.page, 'page', 1)
  const limit = Math.min(readPositiveInt(query.limit, 'limit', DEFAULT_LIMIT), MAX_LIMIT)
  const raw = typeof query.q === 'string' ? query.q.trim() : ''
  return { page, limit, q: raw.slice(0, MAX_SEARCH_LENGTH) }
}

/** The envelope every paginated list returns alongside its rows. */
export const pageMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
})
