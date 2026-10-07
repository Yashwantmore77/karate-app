// The lifecycles from the PRD, as data. A transition that is not listed here
// cannot happen, which is what stops a tournament jumping from DRAFT straight
// to LIVE with no draw behind it.

export const TOURNAMENT_STATUS = {
  DRAFT: 'DRAFT',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  VERIFICATION: 'VERIFICATION',
  WEIGH_IN: 'WEIGH_IN',
  // PRD v1 §5: eligible entries frozen, before the draw.
  ENTRIES_LOCKED: 'ENTRIES_LOCKED',
  DRAW_GENERATED: 'DRAW_GENERATED',
  READY: 'READY',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
}

const T = TOURNAMENT_STATUS

// Forward along the lifecycle, plus the backward steps an admin realistically
// needs: reopening registration, and sending a draw back for changes.
// PRD v1 §5 runs Draft → Registration Open → Registration Closed → Weigh-in →
// Entries Locked → Draw / Pool → Live → Completed → Archived. Verification and
// Ready are optional stops kept from the first PRD.
const TOURNAMENT_TRANSITIONS = {
  [T.DRAFT]: [T.REGISTRATION_OPEN],
  [T.REGISTRATION_OPEN]: [T.REGISTRATION_CLOSED, T.DRAFT],
  [T.REGISTRATION_CLOSED]: [T.VERIFICATION, T.WEIGH_IN, T.ENTRIES_LOCKED, T.REGISTRATION_OPEN],
  [T.VERIFICATION]: [T.WEIGH_IN, T.ENTRIES_LOCKED, T.DRAW_GENERATED, T.REGISTRATION_CLOSED],
  [T.WEIGH_IN]: [T.ENTRIES_LOCKED, T.DRAW_GENERATED, T.VERIFICATION, T.REGISTRATION_CLOSED],
  [T.ENTRIES_LOCKED]: [T.DRAW_GENERATED, T.WEIGH_IN],
  [T.DRAW_GENERATED]: [T.READY, T.LIVE, T.ENTRIES_LOCKED, T.VERIFICATION],
  [T.READY]: [T.LIVE, T.DRAW_GENERATED],
  [T.LIVE]: [T.COMPLETED],
  // Reopening a completed tournament is privileged and needs a reason.
  [T.COMPLETED]: [T.ARCHIVED, T.LIVE],
  // Archived is read-only history.
  [T.ARCHIVED]: [],
}

/** A step back along the lifecycle (needs a reason). */
export const isBackward = (from, to) => Object.values(T).indexOf(to) < Object.values(T).indexOf(from)

export const REGISTRATION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  WEIGH_IN_PENDING: 'WEIGH_IN_PENDING',
  WEIGH_IN_VERIFIED: 'WEIGH_IN_VERIFIED',
  CATEGORY_CONFIRMED: 'CATEGORY_CONFIRMED',
  // PRD v1 §11: normal editing blocked once entries are locked.
  LOCKED: 'LOCKED',
  DRAW_ASSIGNED: 'DRAW_ASSIGNED',
  COMPLETED: 'COMPLETED',
  // PRD v1 §28: withdrawn after the draw; history kept, bouts walked over.
  WITHDRAWN: 'WITHDRAWN',
}

const R = REGISTRATION_STATUS

const REGISTRATION_TRANSITIONS = {
  [R.DRAFT]: [R.SUBMITTED],
  [R.SUBMITTED]: [R.PENDING_VERIFICATION, R.DRAFT],
  [R.PENDING_VERIFICATION]: [R.APPROVED, R.REJECTED],
  // A rejection is not final: the PRD expects a correction and resubmission.
  [R.REJECTED]: [R.DRAFT, R.PENDING_VERIFICATION],
  [R.APPROVED]: [R.PAYMENT_PENDING, R.WEIGH_IN_PENDING, R.CATEGORY_CONFIRMED, R.REJECTED],
  [R.PAYMENT_PENDING]: [R.PAYMENT_VERIFIED],
  [R.PAYMENT_VERIFIED]: [R.WEIGH_IN_PENDING, R.CATEGORY_CONFIRMED],
  [R.WEIGH_IN_PENDING]: [R.WEIGH_IN_VERIFIED],
  [R.WEIGH_IN_VERIFIED]: [R.CATEGORY_CONFIRMED, R.LOCKED],
  [R.CATEGORY_CONFIRMED]: [R.LOCKED, R.DRAW_ASSIGNED],
  [R.LOCKED]: [R.DRAW_ASSIGNED, R.WITHDRAWN],
  [R.DRAW_ASSIGNED]: [R.COMPLETED, R.WITHDRAWN],
  [R.COMPLETED]: [],
  [R.WITHDRAWN]: [],
}

// PRD v1 §13: Scheduled → Called → Ready → Live → Paused → Live → Completed,
// in the scoring app's own (lowercase) vocabulary. `open` is the scoring app's
// "console open, not started". Exceptional endings are result types.
export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  CALLED: 'called',
  READY: 'ready',
  OPEN: 'open',
  LIVE: 'live',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

const M = MATCH_STATUS
const NOT_STARTED = [M.SCHEDULED, M.CALLED, M.READY, M.OPEN]

const MATCH_TRANSITIONS = {
  [M.SCHEDULED]: [M.CALLED, M.READY, M.OPEN, M.LIVE, M.COMPLETED, M.CANCELLED],
  [M.CALLED]: [M.READY, M.OPEN, M.LIVE, M.SCHEDULED, M.COMPLETED, M.CANCELLED],
  [M.READY]: [M.OPEN, M.LIVE, M.CALLED, M.SCHEDULED, M.COMPLETED, M.CANCELLED],
  [M.OPEN]: [M.LIVE, M.PAUSED, M.READY, M.SCHEDULED, M.COMPLETED, M.CANCELLED],
  [M.LIVE]: [M.PAUSED, M.COMPLETED, M.CANCELLED],
  [M.PAUSED]: [M.LIVE, M.COMPLETED, M.CANCELLED],
  // Reopening a completed match is allowed but, per Rule 6, never silent.
  [M.COMPLETED]: [M.LIVE],
  [M.CANCELLED]: [M.SCHEDULED],
}

export const notStarted = (status) => NOT_STARTED.includes(status || M.SCHEDULED)

// Exceptional completions (PRD v1 §13, §16), each needing a finish reason.
export const RESULT_TYPES = ['COMPLETED', 'WALKOVER', 'DISQUALIFIED', 'NO_SHOW', 'KIKEN', 'MANUAL_OVERRIDE', 'CANCELLED']
export const EXCEPTIONAL_RESULTS = RESULT_TYPES.filter((t) => t !== 'COMPLETED')

const machine = (transitions) => ({
  next: (from) => transitions[from] || [],
  can: (from, to) => (transitions[from] || []).includes(to),
})

export const tournamentLifecycle = machine(TOURNAMENT_TRANSITIONS)
export const registrationLifecycle = machine(REGISTRATION_TRANSITIONS)
export const matchLifecycle = machine(MATCH_TRANSITIONS)

export class InvalidTransition extends Error {
  constructor(from, to) {
    super(`cannot move from ${from} to ${to}`)
    this.code = 'invalid_transition'
    this.from = from
    this.to = to
  }
}

export function assertTransition(lifecycle, from, to) {
  if (!lifecycle.can(from, to)) throw new InvalidTransition(from, to)
  return to
}
