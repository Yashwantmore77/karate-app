// PRD point 19 / sections 32-33: kata judged by a panel. Each judge gives every
// performer a score; the final score is worked out by the tournament's chosen
// method, so a federation's own calculation is configuration, not code.

export const KATA_MIN = 5.0
export const KATA_MAX = 10.0

export const KATA_METHOD_LABEL = {
  drop_high_low_average: 'Drop highest and lowest, average the rest',
  average: 'Average of all judges',
  drop_high_low_sum: 'Drop highest and lowest, add the rest',
  sum: 'Total of all judges',
}

const round2 = (n) => Math.round(n * 100) / 100

/** A judge's score: 5.0 to 10.0 in steps of 0.1. Returns null when invalid. */
export function normalizeKataScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < KATA_MIN || n > KATA_MAX) return null
  const tenths = Math.round(n * 10)
  if (Math.abs(n * 10 - tenths) > 1e-6) return null
  return tenths / 10
}

/**
 * The final score from the judges' scores, or null until every judge has
 * scored. Dropping needs at least three judges, or nothing would be left.
 */
export function kataFinal(scores, judges, method = 'drop_high_low_average') {
  const list = scores.filter((s) => Number.isFinite(s))
  if (list.length < judges) return null
  const sorted = [...list].sort((a, b) => a - b)
  const drop = method.startsWith('drop_high_low') && sorted.length >= 3
  const kept = drop ? sorted.slice(1, -1) : sorted
  const total = kept.reduce((a, b) => a + b, 0)
  return round2(method.endsWith('sum') ? total : total / kept.length)
}

/**
 * Ranks performers by final score. Ties go to the higher total of all
 * scores, then the higher single best score; still level shares the place.
 */
export function rankKata(rows) {
  const scored = rows.filter((r) => r.final != null)
  const key = (r) => [r.final, r.scores.reduce((a, b) => a + b, 0), Math.max(...r.scores)]
  const cmp = (a, b) => {
    const [x, y] = [key(a), key(b)]
    for (let i = 0; i < x.length; i += 1) if (y[i] !== x[i]) return y[i] - x[i]
    return 0
  }
  scored.sort(cmp)
  let rank = 0
  const ranked = scored.map((r, i) => {
    if (i === 0 || cmp(scored[i - 1], r) !== 0) rank = i + 1
    return { ...r, rank }
  })
  return [...ranked, ...rows.filter((r) => r.final == null).map((r) => ({ ...r, rank: null }))]
}
