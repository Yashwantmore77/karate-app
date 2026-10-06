import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  auth, db, onAuthStateChanged, doc, getDoc, signInWithEmailAndPassword, signOut,
} from '../firebase'
import { serverUrl, apiUrl, getToken, loginToServer, clearSession, tokenExpiresAt } from '../data/session'
import { setUnauthorizedHandler } from '../data/http'
import { disconnect, onSocketAuthFailure } from '../data/channel/socket'

const SessionContext = createContext(null)

/**
 * One identity surface, two implementations — chosen the same way the match
 * channel already picks local vs socket transport. VITE_SERVER_URL present
 * means the real API drives identity end to end (POST /auth/login, GET
 * /auth/me); absent means the existing local-only mock keeps working exactly
 * as it did before there was a server to talk to.
 */
export function SessionProvider({ children }) {
  return serverUrl()
    ? <ApiSession>{children}</ApiSession>
    : <LocalSession>{children}</LocalSession>
}

// Both branches expose the same shape pages already rely on: `user.uid` and
// `profile.role` / `profile.seat`. The API's seeded accounts were mirrored
// from the mock's roles when BE-4 was built, so mapping one onto the other
// loses nothing any current screen reads.
function ApiSession({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const adopt = (apiUser) => {
    if (!apiUser) {
      // The match socket was opened with this person's token; the next
      // sign-in must get a fresh one.
      disconnect()
      setUser(null)
      setProfile(null)
      return
    }
    setUser({ uid: apiUser.uid, email: apiUser.email })
    setProfile({ role: apiUser.role, seat: apiUser.seat })
  }

  // A refresh should not bounce a signed-in referee back to the login
  // screen: if a token survived in sessionStorage, ask the server whose it
  // is rather than discarding it unread.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(apiUrl('/auth/me'), {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('session expired')
        const { user: apiUser } = await res.json()
        if (!cancelled) adopt(apiUser)
      } catch {
        clearSession()
        if (!cancelled) adopt(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // A token the server rejects, over HTTP or the socket, ends the session here
  // instead of leaving screens that silently show nothing.
  useEffect(() => {
    const expire = () => { clearSession(); adopt(null) }
    setUnauthorizedHandler(expire)
    onSocketAuthFailure(expire)
    return () => { setUnauthorizedHandler(null); onSocketAuthFailure(null) }
  }, [])

  // And one that runs out (12 h, a tournament day) signs out on time rather
  // than at the next failed save.
  useEffect(() => {
    if (!user) return undefined
    const at = tokenExpiresAt(getToken())
    if (!at) return undefined
    const id = setTimeout(() => { clearSession(); adopt(null) }, Math.max(0, at - Date.now()))
    return () => clearTimeout(id)
  }, [user])

  // Every "Sign out" button in the app already calls signOut(auth) — the
  // mock's pub/sub. Rather than rewiring a dozen call sites to a second
  // logout path, this rides the same signal: the mock always fires its
  // listeners once, synchronously, with whatever it already holds (skipped
  // below), and only fires again on a real sign-in or sign-out. A later
  // null is therefore always a genuine sign-out, in either mode.
  useEffect(() => {
    let first = true
    return onAuthStateChanged(auth, (mockUser) => {
      if (first) { first = false; return }
      if (mockUser === null) {
        clearSession()
        adopt(null)
      }
    })
  }, [])

  // `coords` is whatever the sign-in screen managed to obtain from the browser,
  // and is often null — denied, unsupported, or simply not resolved in time.
  const login = useCallback(async (email, password, coords = null, code = null) => {
    const apiUser = await loginToServer(email, password, coords, code)
    adopt(apiUser)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    adopt(null)
  }, [])

  return (
    <SessionContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

// Unchanged from the App.jsx logic this replaces: mock Firebase auth plus a
// Firestore-shaped roles lookup, still exactly how local/offline mode ran
// before there was a server to prefer instead.
function LocalSession({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const snap = await getDoc(doc(db, 'roles', u.uid))
        setProfile(snap.exists() ? snap.data() : null)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  const login = useCallback(
    (email, password) => signInWithEmailAndPassword(auth, email, password),
    []
  )
  const logout = useCallback(() => signOut(auth), [])

  return (
    <SessionContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
