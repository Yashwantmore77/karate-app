// The token the API issued at sign-in, kept for the life of the browser tab.

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

/** Absolute URL for an API path, or null when VITE_SERVER_URL is not set. */
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
 * Exchanges credentials for a token, and returns the signed-in user.
 *
 * `coords` rides along when the browser has granted location permission, for
 * the server's sign-in record. It is always optional, and never affects
 * whether the sign-in succeeds.
 */
export async function loginToServer(email, password, coords = null) {
  const url = apiUrl('/auth/login')
  // The app has no other way to sign anyone in, so a missing setting is said
  // plainly instead of the button appearing to do nothing.
  if (!url) throw new Error('VITE_SERVER_URL is not set, so there is no API to sign in against.')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, ...(coords ? { coords } : {}) }),
  })
  if (!res.ok) throw Object.assign(new Error('login failed'), { status: res.status })

  const { token: issued, user } = await res.json()
  store(issued)
  return user
}
