// The server's session. Separate from the client's own sign-in because the app
// still runs with no server at all, and in that mode there is no token to hold.

const KEY = 'kt:v1:token'

let token = null

try {
  token = sessionStorage.getItem(KEY)
} catch {
  // Private mode or blocked storage: the session simply lasts this page load.
}

export const serverUrl = () => import.meta.env?.VITE_SERVER_URL || null

export const getToken = () => token

const store = (value) => {
  token = value
  try {
    if (value) sessionStorage.setItem(KEY, value)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Keeping it in memory is enough to finish the session.
  }
}

export const clearSession = () => store(null)

/**
 * Exchanges credentials for a token. Returns null when no server is
 * configured, so the local-only mode carries on untouched.
 */
export async function loginToServer(email, password) {
  const url = serverUrl()
  if (!url) return null

  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw Object.assign(new Error('login failed'), { status: res.status })

  const { token: issued, user } = await res.json()
  store(issued)
  return user
}
