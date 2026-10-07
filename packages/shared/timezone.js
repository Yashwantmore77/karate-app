// PRD v1 §23: every tournament runs on its own explicit time zone. Dates an
// organiser types ("registration closes 31 Dec, 18:00") are local to the
// tournament, not to the server or the browser reading them.

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata'

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Minutes the zone is ahead of UTC at a given instant. */
function offsetMinutes(instant, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second)
  return Math.round((asUtc - instant) / 60000)
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/

/** A local date or date-time is well formed: YYYY-MM-DD or YYYY-MM-DDTHH:mm. */
export const isLocalDateTime = (value) => LOCAL.test(String(value || ''))

/**
 * The instant a local date or date-time names in the tournament's zone. A bare
 * date means the start of that day, or its last minute with `endOfDay` (a
 * "closes on 31 Dec" deadline runs to the end of the 31st).
 */
export function zonedInstant(local, tz = DEFAULT_TIME_ZONE, { endOfDay = false } = {}) {
  if (local == null || local === '') return null
  const text = String(local)
  // Already an instant (ISO with zone): take it as it is.
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text) && !LOCAL.test(text)) {
    const d = new Date(text)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = text.match(LOCAL)
  if (!m) return null
  const zone = isValidTimeZone(tz) ? tz : 'UTC'
  const hasTime = m[4] != null
  const hour = hasTime ? Number(m[4]) : endOfDay ? 23 : 0
  const minute = hasTime ? Number(m[5]) : endOfDay ? 59 : 0
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, minute, endOfDay && !hasTime ? 59 : 0)
  let instant = guess - offsetMinutes(guess, zone) * 60000
  // Once more across a daylight-saving edge.
  instant = guess - offsetMinutes(instant, zone) * 60000
  return new Date(instant)
}

/** Compares two local values in one zone: negative, zero or positive. */
export const compareLocal = (a, b, tz) => zonedInstant(a, tz) - zonedInstant(b, tz)

/** An instant shown in the tournament's zone, e.g. "31 Dec 2026, 18:00". */
export function formatInZone(instant, tz = DEFAULT_TIME_ZONE) {
  if (!instant) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: isValidTimeZone(tz) ? tz : 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant))
}
