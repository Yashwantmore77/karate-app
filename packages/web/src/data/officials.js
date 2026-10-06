import * as users from './users'

/**
 * Referees and judges who can be put on a match (PRD section 37), from the
 * server's officials list — the picker's view of accounts, not the roster.
 */
export async function listOfficials() {
  const rows = await users.officials().catch(() => [])
  return rows
    .filter((u) => u.role === 'referee' || u.role === 'judge')
    .map((u) => ({ uid: u.uid, role: u.role, label: u.name || (u.role === 'judge' && u.seat ? `Judge ${u.seat}` : u.email) }))
}
