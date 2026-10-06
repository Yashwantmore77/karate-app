import { httpGet, httpPost, httpPatch, httpDelete } from './http'

/** PRD point 33 (SaaS): organisations, set up by a super admin. */
export const list = async () => (await httpGet('/organizations')).organizations
export const mine = async () => (await httpGet('/organizations/mine')).organization
export const create = async (doc) => (await httpPost('/organizations', doc)).organization
export const update = async (id, patch) => (await httpPatch(`/organizations/${id}`, patch)).organization
export const remove = (id) => httpDelete(`/organizations/${id}`)
