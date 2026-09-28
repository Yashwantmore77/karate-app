import { httpGet, httpPost, httpPatch, httpDelete } from './http'
import { serverUrl } from './session'

/**
 * Accounts, which only ever exist on the server.
 *
 * There is no local implementation the way there is for the competition data:
 * with no API configured, sign-in runs against the built-in mock roster, and
 * there is nothing to administer. `isAvailable` is how screens ask.
 */
export const isAvailable = () => !!serverUrl()

export const ROLES = ['admin', 'referee', 'judge']

export const list = async () => (await httpGet('/users?limit=100')).users

/** One page of accounts, searchable by address or role. */
export const page = async ({ page: pageNumber = 1, limit = 25, q = '' } = {}) => {
  const params = new URLSearchParams({ page: String(pageNumber), limit: String(limit) })
  if (q) params.set('q', q)
  const payload = await httpGet(`/users?${params}`)
  return { rows: payload.users, total: payload.total, pages: payload.pages, page: payload.page }
}

/** Referees and judges who can be put on a match. */
export const officials = async (role) => {
  const suffix = role ? `?role=${encodeURIComponent(role)}` : ''
  return (await httpGet(`/officials${suffix}`)).officials
}
export const create = async (fields) => (await httpPost('/users', fields)).user
export const update = async (uid, patch) => (await httpPatch(`/users/${uid}`, patch)).user
export const remove = (uid) => httpDelete(`/users/${uid}`)
