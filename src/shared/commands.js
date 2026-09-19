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
  outcome: null,
})

/**
 * Attaches the rules' verdict to a state. The referee still confirms it, but
 * nobody has to notice an 8-point gap or a hansoku by eye, and every device is
 * told the same thing at the same moment.
 */
export function withOutcome(state, rules = DEFAULT_RULES, at = Date.now()) {
  const expired = remainingNow(state.clock, at) === 0 && !state.koActive
  const outcome = evaluateOutcome(state.match, rules, { expired })
  if (!outcome.ended) return state.outcome ? { ...state, outcome: null } : state
  const same = state.outcome
    && state.outcome.winner === outcome.winner
    && state.outcome.method === outcome.method
  return same ? state : { ...state, outcome }
}

export const COMMANDS = [
  'CLOCK_START', 'CLOCK_STOP', 'CLOCK_ADJUST', 'CLOCK_SET', 'CLOCK_RESET', 'KO_TIMER',
  'SCORE', 'DEDUCT', 'SENSHU', 'PENALTY', 'FIELD_NUMBER', 'SCOREBOARD',
]

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
