// The lifecycles from the PRD, as data. A transition that is not listed here
// cannot happen, which is what stops a tournament jumping from DRAFT straight
// to LIVE with no draw behind it.

export const TOURNAMENT_STATUS = {
  DRAFT: 'DRAFT',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  VERIFICATION: 'VERIFICATION',
  WEIGH_IN: 'WEIGH_IN',
  DRAW_GENERATED: 'DRAW_GENERATED',
  READY: 'READY',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
}

const T = TOURNAMENT_STATUS

// Forward along the lifecycle, plus the backward steps an admin realistically
// needs: reopening registration, and sending a draw back for changes.
const TOURNAMENT_TRANSITIONS = {
  [T.DRAFT]: [T.REGISTRATION_OPEN],
  [T.REGISTRATION_OPEN]: [T.REGISTRATION_CLOSED, T.DRAFT],
  [T.REGISTRATION_CLOSED]: [T.VERIFICATION, T.REGISTRATION_OPEN],
  [T.VERIFICATION]: [T.WEIGH_IN, T.DRAW_GENERATED, T.REGISTRATION_CLOSED],
  [T.WEIGH_IN]: [T.DRAW_GENERATED, T.VERIFICATION],
  [T.DRAW_GENERATED]: [T.READY, T.VERIFICATION],
  [T.READY]: [T.LIVE, T.DRAW_GENERATED],
  [T.LIVE]: [T.COMPLETED],
  [T.COMPLETED]: [T.ARCHIVED, T.LIVE],
  [T.ARCHIVED]: [],
}

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
  DRAW_ASSIGNED: 'DRAW_ASSIGNED',
  COMPLETED: 'COMPLETED',
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
  [R.WEIGH_IN_VERIFIED]: [R.CATEGORY_CONFIRMED],
  [R.CATEGORY_CONFIRMED]: [R.DRAW_ASSIGNED],
  [R.DRAW_ASSIGNED]: [R.COMPLETED],
  [R.COMPLETED]: [],
}

export const MATCH_STATUS = {
  SCHEDULED: 'SCHEDULED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  WALKOVER: 'WALKOVER',
  DISQUALIFIED: 'DISQUALIFIED',
}

const M = MATCH_STATUS

const MATCH_TRANSITIONS = {
  [M.SCHEDULED]: [M.READY, M.CANCELLED, M.WALKOVER],
  [M.READY]: [M.IN_PROGRESS, M.SCHEDULED, M.CANCELLED, M.WALKOVER, M.DISQUALIFIED],
  [M.IN_PROGRESS]: [M.PAUSED, M.COMPLETED, M.DISQUALIFIED, M.WALKOVER],
  [M.PAUSED]: [M.IN_PROGRESS, M.COMPLETED, M.DISQUALIFIED],
  // Reopening a completed match is allowed but, per Rule 6, never silent.
  [M.COMPLETED]: [M.IN_PROGRESS],
  [M.CANCELLED]: [M.SCHEDULED],
  [M.WALKOVER]: [],
  [M.DISQUALIFIED]: [],
}

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
