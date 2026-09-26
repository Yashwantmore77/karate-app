import { useEffect, useState } from 'react'

// Match records still live in per-browser storage; BE-5 moves them to the
// server. Until then every screen that opens a match needs the same lookup,
// so it lives here once rather than being copied into each page.
const EMPTY = {
  match: null, category: null, tournament: null,
  redComp: null, blueComp: null, loading: true,
}

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

export function useMatchRecord(matchId) {
  const [record, setRecord] = useState(EMPTY)

  useEffect(() => {
    const tournaments = read('tournaments') || []
    const categories = []
    const matches = []

    tournaments.forEach((t) => {
      ;(read(`categories-${t.id}`) || []).forEach((cat) => {
        categories.push(cat)
        ;(read(`matches-${cat.id}`) || []).forEach((m) => {
          matches.push({ ...m, categoryId: cat.id })
        })
      })
    })

    const match = matches.find((m) => m.id === matchId)
    if (!match) {
      setRecord({ ...EMPTY, loading: false })
      return
    }

    const category = categories.find((c) => c.id === match.categoryId) || null
    const tournament = category
      ? tournaments.find((t) => t.id === category.tournamentId) || null
      : null
    const competitors = read(`competitors-${match.categoryId}`) || []

    setRecord({
      match,
      category,
      tournament,
      redComp: competitors.find((c) => c.id === match.redId) || null,
      blueComp: competitors.find((c) => c.id === match.blueId) || null,
      loading: false,
    })
  }, [matchId])

  return record
}
