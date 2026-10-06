// One reducer for every change a match can undergo, imported by the browser
// and by the server. Clients send the command; whoever is authoritative
// applies it. Because it is the same function in both places, the projection
// a judge renders cannot drift from the one the server holds.

import { makeClock, startClock, stopClock, adjustClock, remainingNow } from './clock.js'
import {
  makeMatchState, awardPoint, deductPoint, setSenshu, setPenalty, evaluateOutcome, DEFAULT_RULES
} from './rules.js'

export const DEFAULT_DURATION_MS = 90_000

export const initialMatchState = () => ({
  match: makeMatchState(),
  clock: makeClock(DEFAULT_DURATION_MS),
  durationMs: DEFAULT_DURATION_MS,
  koActive: false,
  koClock: makeClock(DEFAULT_RULES.koTimerMs),
  fieldNumber: '1',
  scoreboardActive: false,
  // A referee's declaration, which the rules cannot derive from the score.
  decision: null,
  outcome: null,
})

/**
 * Attaches the rules' verdict to a state. The referee still confirms it, but
 * nobody has to notice an 8-point gap or a hansoku by eye, and every device is
 * told the same thing at the same moment.
 */
export function withOutcome(state, rules, at = Date.now()) {
  // A match carries the rules it was set up with (RULES); an explicit argument
  // still wins, for tests and callers that evaluate under other rules.
  const active = rules || state.rules || DEFAULT_RULES
  if (state.decision) {
    const declared = { ended: true, winner: state.decision.winner, method: state.decision.method }
    const unchanged = state.outcome
      && state.outcome.winner === declared.winner
      && state.outcome.method === declared.method
    return unchanged ? state : { ...state, outcome: declared }
  }
  const expired = remainingNow(state.clock, at) === 0 && !state.koActive
  const outcome = evaluateOutcome(state.match, active, { expired })
  if (!outcome.ended) return state.outcome ? { ...state, outcome: null } : state
  const same = state.outcome
    && state.outcome.winner === outcome.winner
    && state.outcome.method === outcome.method
  return same ? state : { ...state, outcome }
}

export const COMMANDS = [
  'CLOCK_START', 'CLOCK_STOP', 'CLOCK_ADJUST', 'CLOCK_SET', 'CLOCK_RESET', 'KO_TIMER',
  'SCORE', 'DEDUCT', 'SENSHU', 'PENALTY', 'FIELD_NUMBER', 'SCOREBOARD',
  'KIKEN', 'SHIKKAKU', 'HANTEI', 'CLEAR_DECISION', 'RULES',
]

/**
 * The tournament's own kumite rules (PRD section 29), applied to a match.
 * Accepts only the values a tournament configures; anything else keeps the
 * defaults rather than arriving unchecked from a client.
 */
export function rulesFrom({ durationMs, pointGap, senshu } = {}) {
  const rules = { ...DEFAULT_RULES }
  if (Number.isFinite(durationMs) && durationMs >= 10_000 && durationMs <= 600_000) rules.durationMs = durationMs
  if (Number.isInteger(pointGap) && pointGap >= 0 && pointGap <= 20) rules.pointGap = pointGap
  if (typeof senshu === 'boolean') rules.senshu = senshu
  return rules
}

// Undo is handled by whoever is authoritative, not by the reducer: it steps
// back to a previous state rather than computing a new one.
export const UNDO = 'UNDO'
export const HISTORY_LIMIT = 50
export const pushHistory = (history, state) =>
  [...history.slice(-(HISTORY_LIMIT - 1)), state]

const other = (side) => (side === 'ao' ? 'aka' : 'ao')

export class UnknownCommand extends Error {
  constructor(cmd) {
    super(`unknown command ${cmd}`)
    this.code = 'unknown_command'
  }
}

export function applyCommand(state, cmd, payload = {}, at) {
  switch (cmd) {
    case 'CLOCK_START':
      return { ...state, clock: startClock(state.clock, at) }

    case 'CLOCK_STOP':
      return { ...state, clock: stopClock(state.clock, at) }

    case 'CLOCK_ADJUST':
      return { ...state, clock: adjustClock(state.clock, payload.deltaMs ?? 0, at) }

    case 'CLOCK_SET': {
      const durationMs = Math.max(0, payload.durationMs ?? DEFAULT_DURATION_MS)
      return { ...state, durationMs, clock: makeClock(durationMs) }
    }

    case 'CLOCK_RESET':
      return { ...state, clock: makeClock(state.durationMs) }

    case 'KO_TIMER':
      return state.koActive
        ? { ...state, koActive: false, koClock: stopClock(state.koClock, at) }
        : {
            ...state,
            koActive: true,
            koClock: startClock(makeClock(DEFAULT_RULES.koTimerMs), at),
            clock: stopClock(state.clock, at),
          }

    case 'SCORE':
      return { ...state, match: awardPoint(state.match, payload.side, payload.type) }

    case 'DEDUCT':
      return { ...state, match: deductPoint(state.match, payload.side) }

    case 'SENSHU':
      return { ...state, match: setSenshu(state.match, payload.side) }

    case 'PENALTY':
      return {
        ...state,
        match: setPenalty(state.match, payload.side, payload.category, payload.level),
      }

    case 'FIELD_NUMBER':
      return { ...state, fieldNumber: String(payload.value ?? '') }

    case 'SCOREBOARD':
      return { ...state, scoreboardActive: !!payload.active }

    // Withdrawal and disqualification are called by the referee, not derived
    // from the score, so they beat whatever the scores say.
    case 'KIKEN':
      return { ...state, decision: { method: 'kiken', winner: other(payload.side) } }

    case 'SHIKKAKU':
      return { ...state, decision: { method: 'shikkaku', winner: other(payload.side) } }

    case 'HANTEI':
      return { ...state, decision: { method: 'hantei', winner: payload.side } }

    case 'CLEAR_DECISION':
      return state.decision ? { ...state, decision: null } : state

    // Sets the match up under its tournament's rules. Only before the bout
    // starts: changing the duration or gap mid-match would rewrite the score's
    // meaning under the referee's feet.
    case 'RULES': {
      const started = state.clock.running || state.clock.startedAt != null
        || state.match.scores.ao || state.match.scores.aka || state.clock.remainingMs !== state.durationMs
      if (started) return state
      const rules = rulesFrom(payload)
      const same = state.rules && JSON.stringify(state.rules) === JSON.stringify(rules) && state.durationMs === rules.durationMs
      if (same) return state
      return { ...state, rules, durationMs: rules.durationMs, clock: makeClock(rules.durationMs) }
    }

    default:
      throw new UnknownCommand(cmd)
  }
}

// The server owns expiry so every device agrees on the stopped anchor rather
// than each deciding for itself.
export function applyExpiry(state, at, remainingNow) {
  let next = state
  if (next.koActive && remainingNow(next.koClock, at) === 0) {
    next = { ...next, koActive: false, koClock: stopClock(next.koClock, at) }
  }
  if (next.clock.running && remainingNow(next.clock, at) === 0) {
    next = { ...next, clock: stopClock(next.clock, at) }
  }
  return next
}
