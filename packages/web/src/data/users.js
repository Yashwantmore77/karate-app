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

export const list = async () => (await httpGet('/users')).users
export const create = async (fields) => (await httpPost('/users', fields)).user
export const update = async (uid, patch) => (await httpPatch(`/users/${uid}`, patch)).user
export const remove = (uid) => httpDelete(`/users/${uid}`)
