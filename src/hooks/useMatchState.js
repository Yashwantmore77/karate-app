import { useCallback, useEffect, useRef, useState } from 'react'
import { matchStateRepo } from '../data/repo'

/**
 * Match state read from the repo subscription rather than owned by the screen.
 * The controlling device dispatches a change and renders what comes back, so a
 * second window watching the same match renders the identical projection.
 * Swapping the adapter for a socket changes nothing here.
 */
export function useMatchState(matchId, makeInitial) {
  const [state, setState] = useState(null)
  const current = useRef(null)
  const initial = useRef(makeInitial)
  initial.current = makeInitial

  useEffect(() => {
    let seeded = false
    const off = matchStateRepo.subscribe(matchId, (row) => {
      if (!row) {
        if (!seeded) {
          seeded = true
          // Adopt the seed immediately so the first paint is the real screen
          // and a tap landing before the write completes is not dropped.
          const seed = initial.current()
          current.current = seed
          setState(seed)
          matchStateRepo.put(matchId, seed)
        }
        return
      }
      const { id, createdAt, ...rest } = row
      current.current = rest
      setState(rest)
    })
    return off
  }, [matchId])

  const dispatch = useCallback((fn) => {
    if (!current.current) return
    const next = fn(current.current)
    if (next === current.current) return
    current.current = next
    setState(next)
    matchStateRepo.put(matchId, next)
  }, [matchId])

  return [state, dispatch]
}
