import { mayAccessTournament } from './middleware.js'
import { reachesOnlyAssigned } from '@kumite/shared/permissions.js'
import { findUserRecord } from './users.js'
import { forbidden, conflict, notFound } from '../lib/errors.js'
import { TOURNAMENT_STATUS as T } from '@kumite/shared/lifecycle.js'

/**
 * Guards for the scoring app's own routes (categories, competitors, matches),
 * which address records by id rather than through a tournament. Each one is
 * resolved to its tournament so the same rules hold as on the tournament
 * screens:
 *
 *  - an account reaches only the tournaments it may work (PRD point 33);
 *  - coaches use their own portal, never these routes;
 *  - an archived tournament is read-only, and a completed one takes no new
 *    categories, entrants or bouts;
 *  - a category drawn by the tournament system is managed by its draw, so it
 *    is not edited, emptied or deleted from here.
 */
export function categoryGuards({ categories, tournaments }) {
  const statusOf = (tournament) => tournament?.lifecycleStatus || T.DRAFT

  /** The tournament ids this account may see, or null for "all of them". */
  async function reach(user) {
    if (user.role === 'super_admin') return null
    const account = await findUserRecord(user.uid)
    if (!account) throw forbidden()
    // An owner's reach is its assignment, so it is always listed out: "no
    // organisation and no tournaments" must not fall through to "all of them".
    if (!reachesOnlyAssigned(account.role) && !account.organizationId && !account.tournamentIds?.length) return null
    const ids = []
    for (const t of await tournaments.list()) if (mayAccessTournament(account, t.id, t)) ids.push(t.id)
    return ids
  }

  /** Category ids inside the account's reach, or null for all. */
  async function categoryReach(user) {
    const ids = await reach(user)
    if (!ids) return null
    const allowed = new Set(ids)
    return (await categories.list()).filter((c) => allowed.has(c.tournamentId)).map((c) => c.id)
  }

  /**
   * Loads a category and its tournament after checking the caller may work it.
   * `write`: 'structure' (add / remove categories, entrants, bouts), 'edit'
   * (change a bout), or false (read).
   */
  async function scope(user, categoryId, { write = false } = {}) {
    if (!user || user.role === 'coach') throw forbidden()
    const category = categoryId ? await categories.get(categoryId) : null
    if (!category) throw notFound()
    const tournament = category.tournamentId ? await tournaments.get(category.tournamentId) : null
    if (tournament && user.role !== 'super_admin') {
      const account = await findUserRecord(user.uid)
      if (!account || !mayAccessTournament(account, tournament.id, tournament)) throw forbidden('tournament_forbidden')
    }
    if (write && tournament) {
      const status = statusOf(tournament)
      if (status === T.ARCHIVED) throw conflict('tournament_archived')
      if (write === 'structure' && status === T.COMPLETED) throw conflict('tournament_completed')
    }
    return { category, tournament, drawn: !!category.divisionKey }
  }

  /** Refuses a structural change to a category the tournament draw owns. */
  const assertNotDrawn = ({ drawn }) => { if (drawn) throw conflict('managed_by_draw') }

  return { reach, categoryReach, scope, assertNotDrawn }
}

/** Express: these routes are for staff; a coach session has its own portal. */
export function staffOnly(req, _res, next) {
  return next(req.user?.role === 'coach' ? forbidden() : undefined)
}
