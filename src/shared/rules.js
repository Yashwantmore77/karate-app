// Kumite scoring rules. Pure — no React, no storage, no network — so the same
// file runs in the browser and on the server and the two cannot disagree.

export const SIDES = ['ao', 'aka']

export const POINTS = { ippon: 3, wazaAri: 2, yuko: 1 }

export const PENALTY_LADDER = ['C', 'K', 'HC', 'H']

export const PENALTY_CATEGORIES = ['c1', 'c2']

// Federation- and age-group-specific values. Confirm before a real tournament.
export const DEFAULT_RULES = {
  durationMs: 180_000,
  extraTimeMs: 60_000,
  koTimerMs: 180_000,
  pointGap: 8,
  senshu: true,
  tieBreak: 'senshu',
}

const emptyPenalties = () => ({ c1: 0, c2: 0 })

export const makeMatchState = () => ({
  scores: { ao: 0, aka: 0 },
  senshu: null,
  penalties: { ao: emptyPenalties(), aka: emptyPenalties() },
})

const other = (side) => (side === 'ao' ? 'aka' : 'ao')

export const awardPoint = (state, side, type) => {
  const value = POINTS[type]
  if (!value) return state
  return {
    ...state,
    scores: { ...state.scores, [side]: state.scores[side] + value },
    senshu: state.senshu ?? side,
  }
}

export const deductPoint = (state, side) => ({
  ...state,
  scores: { ...state.scores, [side]: Math.max(0, state.scores[side] - 1) },
})

export const setSenshu = (state, side) => ({
  ...state,
  senshu: state.senshu === side ? null : side,
})

// Clicking the level already set steps back down, so a mis-tap is one tap to undo.
export const setPenalty = (state, side, category, level) => {
  const current = state.penalties[side][category]
  const next = current === level ? level - 1 : level
  return {
    ...state,
    penalties: {
      ...state.penalties,
      [side]: { ...state.penalties[side], [category]: Math.max(0, next) },
    },
  }
}

export const hasHansoku = (state, side) =>
  PENALTY_CATEGORIES.some((c) => state.penalties[side][c] >= PENALTY_LADDER.length)

export const leader = (state) => {
  const { ao, aka } = state.scores
  if (ao === aka) return null
  return ao > aka ? 'ao' : 'aka'
}

export const scoreGap = (state) => Math.abs(state.scores.ao - state.scores.aka)

/**
 * The single place a bout's outcome is decided. The UI renders what this
 * returns and asks for confirmation; it never decides for itself.
 *
 * Returns { ended, winner, method }. `winner` is null on a tie that still
 * needs encho or hantei, with method 'tieBreak'.
 */
export const evaluateOutcome = (state, rules = DEFAULT_RULES, { expired = false } = {}) => {
  for (const side of SIDES) {
    if (hasHansoku(state, side)) {
      return { ended: true, winner: other(side), method: 'hansoku' }
    }
  }

  if (rules.pointGap > 0 && scoreGap(state) >= rules.pointGap) {
    return { ended: true, winner: leader(state), method: 'gapRule' }
  }

  if (!expired) return { ended: false, winner: null, method: null }

  const ahead = leader(state)
  if (ahead) return { ended: true, winner: ahead, method: 'points' }

  if (rules.senshu && state.senshu) {
    return { ended: true, winner: state.senshu, method: 'senshu' }
  }

  return { ended: true, winner: null, method: 'tieBreak' }
}
