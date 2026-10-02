import { httpGet } from './http'

/** The record of who signed in, from where. */

export const OUTCOMES = ['success', 'invalid_credentials', 'rate_limited']

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
