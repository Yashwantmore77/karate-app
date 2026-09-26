// A spread (max - min) above this threshold flags meaningful judge disagreement.
export const DISAGREEMENT_THRESHOLD = 1.5

export const getScoreSpread = (scores) => {
  if (!scores || scores.length < 2) return 0
  return Math.max(...scores) - Math.min(...scores)
}

export const hasDisagreement = (scores, threshold = DISAGREEMENT_THRESHOLD) =>
  getScoreSpread(scores) > threshold
