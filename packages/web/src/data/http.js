import { apiUrl, getToken, clearSession } from './session'

/**
 * A failure the API reported, carrying the code it used.
 *
 * The code, not the message, is what callers branch on: the server's vocabulary
 * (`invalid_name`, `email_taken`) is stable, while a message is for a human.
 */
export class HttpError extends Error {
  constructor(status, code, details) {
    super(code || `http_${status}`)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Called when the server rejects our token, so the app can send the user back
 * to the login screen instead of silently showing empty lists. Assigned by the
 * session layer, which is the only thing that knows how to do that.
 */
let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function request(path, { method = 'GET', body, signal, token: explicitToken, anonymous = false } = {}) {
  const url = apiUrl(path)
  if (!url) throw new Error(`no server configured for ${path}`)

  // A coach session and the public pages carry their own credentials (or
  // none), and must never borrow a signed-in official's token.
  const token = anonymous ? null : (explicitToken ?? getToken())
  const res = await fetch(url, {
    method,
    signal,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (res.status === 401 && (explicitToken || anonymous)) throw new HttpError(401, 'unauthorized')

  if (res.status === 401) {
    // The token is gone or expired. Drop it here rather than letting every
    // subsequent call rediscover the same thing.
    clearSession()
    onUnauthorized?.()
    throw new HttpError(401, 'unauthorized')
  }

  if (res.status === 204) return null

  // An error page from a proxy rather than the API will not be JSON, and
  // parsing it would throw over the top of the real failure.
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new HttpError(res.status, payload?.error, payload?.details)
  return payload
}

export const httpGet = (path, options) => request(path, options)
export const httpPost = (path, body) => request(path, { method: 'POST', body })
export const httpPut = (path, body) => request(path, { method: 'PUT', body })
export const httpPatch = (path, body) => request(path, { method: 'PATCH', body })
export const httpDelete = (path) => request(path, { method: 'DELETE' })
