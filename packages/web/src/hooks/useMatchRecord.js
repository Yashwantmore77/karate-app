import { useEffect, useState } from 'react'
import {
  tournaments as tournamentStore,
  categories as categoryStore,
  competitors as competitorStore,
  matches as matchStore,
} from '../data/domain'

const EMPTY = {
  match: null, category: null, tournament: null,
  redComp: null, blueComp: null, loading: true,
}

/**
 * A match and everything a screen needs to show it: whose bout it is, which
 * category and tournament it belongs to.
 *
 * Screens opened from a match link know only the match id. This used to read
 * the answer out of the browser's own storage, which is empty on any device
 * talking to the API — so in production a judge opening a bout always got
 * "Match not found". It reads from the API like everything else now, and the
 * referee's console uses the same lookup, so the two cannot disagree.
 */
export function useMatchRecord(matchId) {
  const [record, setRecord] = useState(EMPTY)

  useEffect(() => {
    let alive = true
    setRecord(EMPTY)

    ;(async () => {
      try {
        const match = await matchStore.find(matchId)
        if (!match) {
          if (alive) setRecord({ ...EMPTY, loading: false })
          return
        }

        const [category, roster] = await Promise.all([
          categoryStore.find(match.categoryId),
          competitorStore.list(match.categoryId),
        ])
        const tournament = category ? await tournamentStore.get(category.tournamentId) : null
        if (!alive) return

        setRecord({
          match,
          category,
          tournament,
          redComp: roster.find((c) => c.id === match.redId) || null,
          blueComp: roster.find((c) => c.id === match.blueId) || null,
          loading: false,
        })
      } catch {
        // A failed read shows as not found rather than a spinner forever.
        if (alive) setRecord({ ...EMPTY, loading: false })
      }
    })()

    return () => { alive = false }
  }, [matchId])

  return record
}
