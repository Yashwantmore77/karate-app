import { httpGet } from './http'
import { serverUrl } from './session'

/**
 * The record of who signed in, from where.
 *
 * Server-only, like accounts: with no API configured there is no log to read,
 * because local mode never authenticates against anything. `isAvailable` is how
 * screens ask.
 */
export const isAvailable = () => !!serverUrl()

export const OUTCOMES = ['success', 'invalid_credentials', 'rate_limited']

/** Newest first. The server caps the page size whatever is asked for. */
export const list = async ({ limit, email, outcome } = {}) => {
  const query = new URLSearchParams()
  if (limit) query.set('limit', limit)
  if (email) query.set('email', email)
  if (outcome) query.set('outcome', outcome)

  const suffix = query.toString()
  return (await httpGet(`/auth/logins${suffix ? `?${suffix}` : ''}`)).logins
}

/**
 * One page of the record, newest first.
 *
 * The address and outcome filters are applied by the server, not here: the log
 * is the one collection that grows without bound, so filtering after the fact
 * would mean shipping a whole tournament's attempts to narrow them to one.
 */
export const page = async ({ page: pageNumber = 1, limit = 25, email, outcome } = {}) => {
  const query = new URLSearchParams({ page: String(pageNumber), limit: String(limit) })
  if (email) query.set('email', email)
  if (outcome) query.set('outcome', outcome)

  const payload = await httpGet(`/auth/logins?${query}`)
  return { rows: payload.logins, total: payload.total, pages: payload.pages, page: payload.page }
}
