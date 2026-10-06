import { serverUrl } from './session'
import * as users from './users'
import { mockRoster } from '../firebase-mock-expanded'

/**
 * Referees and judges who can be put on a match (PRD section 37): the server's
 * accounts when there is one, the offline roster otherwise.
 */
export async function listOfficials() {
  const rows = serverUrl() ? await users.list().catch(() => []) : mockRoster()
  return rows
    .filter((u) => u.role === 'referee' || u.role === 'judge')
    .map((u) => ({ uid: u.uid, role: u.role, label: u.name || (u.role === 'judge' && u.seat ? `Judge ${u.seat}` : u.email) }))
}
