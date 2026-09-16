import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, db } from './firebase'

// One listener, created once. Everything on screen reacts to this.
// The "current match" is simply the most recently created one.
export function useCurrentMatch() {
  const [match, setMatch] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(1))
    return onSnapshot(q, (snap) => {
      const d = snap.docs[0]
      setMatch(d ? { id: d.id, ...d.data() } : null)
      setReady(true)
    })
  }, [])

  return { match, ready }
}
