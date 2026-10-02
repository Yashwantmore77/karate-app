/**
 * Translating between the clock a person reads and the instant the API stores.
 *
 * A `datetime-local` input deals in naive wall-clock text with no timezone, and
 * the API refuses a time that does not name one — deliberately, so a server
 * running in UTC cannot silently reinterpret an event held somewhere else. The
 * conversion has to happen somewhere, and here is that somewhere.
 */

const pad = (n) => String(n).padStart(2, '0')

/**
 * What the user typed, as an instant.
 *
 * The browser's own timezone supplies what the input leaves out, which is the
 * right guess: whoever is filling in a timetable is at the tournament.
 */
export const localInputToIso = (value) => {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** An instant, as the local wall-clock text the input expects. */
export const isoToLocalInput = (iso) => {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return [
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  ].join('T')
}

/** A slot as a person reads it: the day, then the time. */
export const formatSlot = (iso) => {
  if (!iso) return 'Unscheduled'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Unscheduled'
  return at.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** Just the time of day, for a row that already shows the date elsewhere. */
export const formatSlotTime = (iso) => {
  if (!iso) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const ROLE_WORDS = {
  referee: 'is refereeing',
  judge: 'is judging',
  competitor: 'is fighting in',
}

/**
 * Turns the server's clash payload into lines a person can act on.
 *
 * `nameFor` resolves a uid to something readable; it is passed in because only
 * the calling screen knows which rosters it has loaded. An unresolved uid still
 * produces a usable line rather than nothing.
 */
export function describeClashes(clashes, nameFor) {
  if (!Array.isArray(clashes)) return []
  return clashes.map((clash) => {
    const who = nameFor?.(clash.uid) || clash.uid
    const doing = ROLE_WORDS[clash.otherRole] || 'is already on'
    const when = formatSlot(clash.scheduledAt)
    const where = clash.mat ? ` on mat ${clash.mat}` : ''
    return `${who} ${doing} another bout at ${when}${where}.`
  })
}
