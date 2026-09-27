import { tournaments, categories, matches } from './index'
import { isExpired } from '../../utils/dateUtils'

// Queries that span the whole competition tree. Built on the public interface,
// so one implementation serves both the local and the API backend.

/**
 * Every match in the system, each carrying the names of the category and
 * tournament it belongs to — what a "what can I work on" screen lists.
 *
 * The reads fan out in parallel rather than in sequence: against the API this is
 * a request per category, and doing them one after another would make the page
 * wait for the sum of them instead of the slowest.
 */
export async function collectMatches({ skipExpired = false } = {}) {
  const all = await tournaments.list()
  const relevant = skipExpired ? all.filter((t) => !isExpired(t.date)) : all

  const perTournament = await Promise.all(
    relevant.map(async (tournament) => {
      const cats = await categories.list(tournament.id)
      const perCategory = await Promise.all(
        cats.map(async (category) => {
          const rows = await matches.list(category.id)
          return rows.map((match) => ({
            ...match,
            categoryId: category.id,
            tournament: tournament.name,
            category: category.name,
          }))
        })
      )
      return perCategory.flat()
    })
  )
  return perTournament.flat()
}

/**
 * A match with the category and tournament above it.
 *
 * Screens opened straight from a match link know the match id and nothing else,
 * but still have to show whose bout it is and whether the tournament has run
 * its course.
 */
export async function findMatchContext(matchId) {
  const match = await matches.find(matchId)
  if (!match) return { match: null, category: null, tournament: null }

  const category = await categories.find(match.categoryId)
  const tournament = category ? await tournaments.get(category.tournamentId) : null
  return { match, category, tournament }
}
