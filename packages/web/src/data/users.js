import { httpGet, httpPost, httpPatch, httpDelete } from './http'

/** Accounts. Administered here; there is no self-service signup. */

export const ROLES = ['admin', 'tournament_owner', 'referee', 'judge', 'super_admin', 'registration_officer', 'weighin_officer', 'announcer', 'scoreboard_operator', 'viewer']
// Roles an account may hold inside one tournament (PRD v1 §4).
export const TOURNAMENT_ROLES = ['admin', 'registration_officer', 'weighin_officer', 'referee', 'judge', 'announcer', 'scoreboard_operator', 'viewer']

export const list = async () => (await httpGet('/users?limit=100')).users

/** One page of accounts, searchable by address or role. */
export const page = async ({ page: pageNumber = 1, limit = 25, q = '' } = {}) => {
  const params = new URLSearchParams({ page: String(pageNumber), limit: String(limit) })
  if (q) params.set('q', q)
  const payload = await httpGet(`/users?${params}`)
  return { rows: payload.users, total: payload.total, pages: payload.pages, page: payload.page }
}

/** Referees and judges who can be put on a match; with a tournament id, only those who can open it. */
export const officials = async (role, tournamentId) => {
  const query = new URLSearchParams(Object.entries({ role, tournamentId }).filter(([, v]) => v)).toString()
  return (await httpGet(`/officials${query ? `?${query}` : ''}`)).officials
}
export const create = async (fields) => (await httpPost('/users', fields)).user
export const update = async (uid, patch) => (await httpPatch(`/users/${uid}`, patch)).user
export const remove = (uid) => httpDelete(`/users/${uid}`)

/**
 * KAN-429: opens an admin's lens into another account. Returns a one-time
 * `{ ticket }`, not the session itself — the ticket is only good for being
 * opened in a new tab (see data/impersonationLink.js), which is where the
 * real token is issued.
 */
export const impersonate = (uid) => httpPost(`/users/${uid}/impersonate`, {})
