import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiUrl, getToken, loginToServer, clearSession, tokenExpiresAt } from '../data/session'
import { setUnauthorizedHandler } from '../data/http'
import { disconnect, onSocketAuthFailure } from '../data/channel/socket'

const SessionContext = createContext(null)

/**
 * Who is signed in, as the API sees it.
 *
 * Pages read `user.uid` and `profile.role` / `profile.seat`, and sign in and out
 * through `login` and `logout`. The token itself stays in data/session.
 */
export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const adopt = useCallback((apiUser) => {
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
  }, [])

  // A refresh should not bounce a signed-in referee back to the login screen:
  // if a token survived in sessionStorage, ask the server whose it is rather
  // than discarding it unread.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = getToken()
      const url = apiUrl('/auth/me')
      if (!token || !url) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
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
  }, [adopt])

  // A token can expire mid-session — it lasts a tournament day, and days run
  // long. Any request the server refuses for that signs the screen out, so it
  // returns to the login page rather than sitting there "signed in" while every
  // list quietly comes back empty.
  // The socket refusing the token means the same.
  useEffect(() => {
    const expire = () => { clearSession(); adopt(null) }
    setUnauthorizedHandler(() => adopt(null))
    onSocketAuthFailure(expire)
    return () => { setUnauthorizedHandler(null); onSocketAuthFailure(null) }
  }, [adopt])

  // And one that runs out signs out on time rather than at the next failed save.
  useEffect(() => {
    if (!user) return undefined
    const at = tokenExpiresAt(getToken())
    if (!at) return undefined
    const id = setTimeout(() => { clearSession(); adopt(null) }, Math.max(0, at - Date.now()))
    return () => clearTimeout(id)
  }, [user, adopt])

  // `coords` is whatever the sign-in screen managed to obtain from the browser,
  // and is often null — denied, unsupported, or simply not resolved in time.
  // `code` is the second factor, sent only once the server has asked for it.
  const login = useCallback(async (email, password, coords = null, code = null) => {
    adopt(await (code ? loginToServer(email, password, coords, code) : loginToServer(email, password, coords)))
  }, [adopt])

  const logout = useCallback(() => {
    clearSession()
    adopt(null)
  }, [adopt])

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
