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
