/**
 * The browser's own idea of where it is, for the sign-in record.
 *
 * Never throws and never blocks a sign-in: every failure — no support, no
 * permission, no fix in time — resolves to null, and the login carries on
 * without coordinates. A location is a nice-to-have on an audit record; being
 * able to sign in is not.
 */

// Long enough for a cold GPS fix on a phone, short enough that nobody stares at
// a spinner because they ignored the permission prompt.
const FIX_TIMEOUT_MS = 4000

// A fix from the last few minutes is as good as a fresh one for this purpose,
// and costs no radio time.
const ACCEPTABLE_AGE_MS = 300_000

/**
 * True unless the browser can say for certain that asking is pointless.
 *
 * Without this, an account that denied location once would wait out the whole
 * timeout on every sign-in for a prompt that will never appear. The Permissions
 * API is missing on some browsers, in which case we simply ask.
 */
async function worthAsking() {
  if (!navigator.permissions?.query) return true
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state !== 'denied'
  } catch {
    return true
  }
}

/** Resolves to { latitude, longitude, accuracy }, or null when unavailable. */
export async function currentCoords() {
  if (!navigator.geolocation) return null
  if (!(await worthAsking())) return null

  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    // A belt-and-braces timer alongside the API's own `timeout`: a prompt left
    // sitting unanswered does not always start the browser's clock.
    const timer = setTimeout(() => finish(null), FIX_TIMEOUT_MS)

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(timer)
        finish({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        })
      },
      () => {
        clearTimeout(timer)
        finish(null)
      },
      { timeout: FIX_TIMEOUT_MS, maximumAge: ACCEPTABLE_AGE_MS, enableHighAccuracy: false }
    )
  })
}
