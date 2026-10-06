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

// The API is versioned. Defined once here so a future /v2 is one edit, not a
// hunt through every fetch in the app.
export const API_BASE = '/api/v1'

/** Absolute URL for an API path, or null when no server is configured. */
export const apiUrl = (path) => {
  const base = serverUrl()
  return base ? `${base}${API_BASE}${path}` : null
}

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
 * When a token stops being valid, read from its own `exp` claim. Not a trust
 * decision (the server checks the signature); only so the app can sign out on
 * time. Null for anything unreadable.
 */
export function tokenExpiresAt(value) {
  try {
    const part = String(value || '').split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return Number.isFinite(json.exp) ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Exchanges credentials for a token. Returns null when no server is
 * configured, so the local-only mode carries on untouched.
 *
 * `coords` rides along when the browser has granted location permission, for
 * the server's sign-in record. It is always optional, and never affects
 * whether the sign-in succeeds.
 */
export async function loginToServer(email, password, coords = null, code = null) {
  const url = apiUrl('/auth/login')
  if (!url) return null

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, ...(coords ? { coords } : {}), ...(code ? { code } : {}) }),
  })
  if (!res.ok) {
    // The code tells a second-factor prompt apart from a wrong password.
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error('login failed'), { status: res.status, code: body?.error })
  }

  const { token: issued, user } = await res.json()
  store(issued)
  return user
}
