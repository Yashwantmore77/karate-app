import { roleIn, actsAsTournamentAdmin } from '@kumite/shared/permissions.js'
import { mayAccessTournament } from './middleware.js'
import { findUserRecord } from './users.js'

/**
 * Who may score a bout (PRD v1 AC-14: "Referee can control an authorized
 * match"). Answers for the tournament the bout belongs to, with the role the
 * account holds there:
 *
 *  - a super admin, or an admin or owner of that tournament, always;
 *  - a referee assigned to the bout, or to a bout nobody has been put on yet
 *    (panels are often set after the schedule, as the match lists assume);
 *  - nobody else, and nobody outside the tournament.
 *
 * Returns { ok, error, tournamentId, role }.
 */
export async function matchAuthority(user, match, { categories, tournaments }) {
  if (!user?.uid || !match) return { ok: false, error: match ? 'forbidden' : 'unknown_match' }
  if (user.role === 'super_admin') return { ok: true, role: 'super_admin', tournamentId: null }
  const category = match.categoryId ? await categories.get(match.categoryId) : null
  const tournamentId = category?.tournamentId || match.tournamentId || null
  const account = await findUserRecord(user.uid)
  if (!account) return { ok: false, error: 'forbidden' }
  if (tournamentId) {
    const tournament = await tournaments.get(tournamentId)
    if (!mayAccessTournament(account, tournamentId, tournament)) return { ok: false, error: 'tournament_forbidden', tournamentId }
  }
  const role = (tournamentId && roleIn(account, tournamentId)) || account.role
  // An owner runs its own tournament, so it holds its bouts like an admin.
  if (actsAsTournamentAdmin(role)) return { ok: true, role, tournamentId }
  if (role === 'referee') {
    return !match.refereeId || match.refereeId === user.uid
      ? { ok: true, role, tournamentId }
      : { ok: false, error: 'not_assigned', role, tournamentId }
  }
  return { ok: false, error: 'forbidden', role, tournamentId }
}
