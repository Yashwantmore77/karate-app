/**
 * When a bout is on, and who that makes busy.
 *
 * A match carries a start instant; its end is derived from the tournament's
 * slot length and stored alongside it. Storing the end rather than deriving it
 * on every read is what keeps the clash query a plain range scan instead of a
 * lookup of each candidate's tournament.
 */

// Fifteen minutes is the usual slot, but an event with many mats runs shorter
// ones and a final runs longer, so it is the tournament's to set.
export const DEFAULT_SLOT_MINUTES = 15
export const SLOT_MIN_MINUTES = 1
export const SLOT_MAX_MINUTES = 240

/** The slot length in force for a tournament, including one saved before the
 * setting existed. */
export const slotMinutesFor = (tournament) =>
  tournament?.slotMinutes ?? DEFAULT_SLOT_MINUTES

/**
 * The instant a bout starting at `startsAt` is expected to release everyone.
 *
 * Returned in the same normalized UTC form the validator produces, because the
 * overlap query compares these as strings.
 */
export const endOfSlot = (startsAt, slotMinutes) =>
  new Date(Date.parse(startsAt) + slotMinutes * 60_000).toISOString()

/**
 * Everyone a match occupies, as uid -> what they are doing there.
 *
 * Competitors count the same as officials. The rule is about a person being
 * needed in two places, and that is no less true of a fighter than a judge.
 */
export function peopleOn(match) {
  const people = new Map()
  if (match.redId) people.set(match.redId, 'competitor')
  if (match.blueId) people.set(match.blueId, 'competitor')
  if (match.refereeId) people.set(match.refereeId, 'referee')
  for (const uid of match.judgeIds || []) people.set(uid, 'judge')
  return people
}

/**
 * Half-open overlap: a bout ending exactly as another begins is not a clash.
 *
 * Back-to-back slots are the normal way a mat runs, so treating the shared
 * boundary as a collision would reject an ordinary schedule.
 */
export const overlaps = (a, b) => a.startsAt < b.endsAt && a.endsAt > b.startsAt

/**
 * Who appears on both of two matches, as the error payload the caller gets.
 */
export function clashingPeople(subject, other) {
  const mine = peopleOn(subject)
  const theirs = peopleOn(other)
  const found = []
  for (const [uid, role] of mine) {
    if (theirs.has(uid)) found.push({ uid, role, otherRole: theirs.get(uid) })
  }
  return found
}
