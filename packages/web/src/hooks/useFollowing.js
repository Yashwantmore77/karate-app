import { useCallback, useEffect, useState } from 'react'

// The athletes and clubs followed on the public page (KAN-428): kept on the
// phone, per tournament, since nobody signs in to follow.

const NONE = { players: [], teams: [] }
const keyOf = (tournamentId) => `kt:v1:follow:${tournamentId}`

function read(tournamentId) {
  if (!tournamentId) return NONE
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(tournamentId)) || '{}')
    return { players: Array.isArray(saved.players) ? saved.players : [], teams: Array.isArray(saved.teams) ? saved.teams : [] }
  } catch {
    return NONE
  }
}

/** The players and teams followed on this phone, and `toggle('players' | 'teams', id)`. */
export function useFollowing(tournamentId) {
  const [follow, setFollow] = useState(() => read(tournamentId))
  useEffect(() => { setFollow(read(tournamentId)) }, [tournamentId])
  const toggle = useCallback((kind, id) => {
    setFollow((f) => {
      const next = { ...f, [kind]: f[kind].includes(id) ? f[kind].filter((x) => x !== id) : [...f[kind], id] }
      try { localStorage.setItem(keyOf(tournamentId), JSON.stringify(next)) } catch { /* private mode: for this visit only */ }
      return next
    })
  }, [tournamentId])
  return { ...follow, toggle }
}
