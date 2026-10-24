// The token the API issued at sign-in, kept for the life of the browser tab.

const KEY = 'kt:v1:token'
// An admin's own token, stashed here while impersonating (KAN-429) so
// "Return to my account" needs no new sign-in. Separate key: the two must
// never collide, and a page reload mid-lens should still be able to return.
const ADMIN_KEY = 'kt:v1:admin-token'

let token = null
let adminToken = null

try {
  token = sessionStorage.getItem(KEY)
  adminToken = sessionStorage.getItem(ADMIN_KEY)
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
/** Swaps in an already-issued token (KAN-429 impersonation) without a login round trip. */
export const setToken = store

export const getAdminToken = () => adminToken
/** The admin's own token, set aside while a lens (KAN-429) is open. */
export const stashAdminToken = (value) => {
  adminToken = value
  try {
    if (value) sessionStorage.setItem(ADMIN_KEY, value)
    else sessionStorage.removeItem(ADMIN_KEY)
  } catch {
    // As above: lasts this page load, which is enough to return from.
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
 * Exchanges credentials for a token, and returns the signed-in user.
 *
 * `coords` rides along when the browser has granted location permission, for
 * the server's sign-in record. It is always optional, and never affects
 * whether the sign-in succeeds.
 */
export async function loginToServer(email, password, coords = null, code = null) {
  const url = apiUrl('/auth/login')
  // The app has no other way to sign anyone in, so a missing setting is said
  // plainly instead of the button appearing to do nothing.
  if (!url) throw Object.assign(new Error('VITE_SERVER_URL is not set, so there is no API to sign in against.'), { code: 'no_server_url' })

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

/**
 * The administrator credentials the server is willing to show on the sign-in
 * screen, or null — which is the normal answer, and the answer from any older
 * server that has no such route. A failure here is never worth a message: the
 * screen simply does not offer the shortcut.
 */
export async function testCredentials() {
  const url = apiUrl('/auth/test-credentials')
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json())?.credentials || null
  } catch {
    return null
  }
}
