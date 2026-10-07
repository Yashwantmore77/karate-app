// PRD point 19 / sections 32-33, PRD v1 §14: kata judged by a panel. Each
// judge gives every performer a score; the final score is worked out by the
// tournament's chosen method, so a federation's own calculation is
// configuration, not code. Range, precision, technical/athletic components,
// penalties and tie-breaks are configurable too.

export const KATA_MIN = 5.0
export const KATA_MAX = 10.0

export const KATA_METHOD_LABEL = {
  drop_high_low_average: 'Drop highest and lowest, average the rest',
  average: 'Average of all judges',
  drop_high_low_sum: 'Drop highest and lowest, add the rest',
  sum: 'Total of all judges',
}

export const KATA_TIE_BREAK_LABEL = {
  total_then_best: 'Higher total of all scores, then best single score',
  technical_first: 'Higher technical score first',
  lowest_kept: 'Higher lowest score',
  shared: 'No tie-break: the place is shared',
}

const roundTo = (n, places) => Math.round(n * 10 ** places) / 10 ** places
const round2 = (n) => roundTo(n, 2)

/**
 * A judge's score within the configured range, at the configured precision
 * (5.0 to 10.0 in steps of 0.1 by default). Returns null when invalid.
 */
export function normalizeKataScore(value, { min = KATA_MIN, max = KATA_MAX, precision = 1 } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  const steps = Math.round(n * 10 ** precision)
  if (Math.abs(n * 10 ** precision - steps) > 1e-6) return null
  return steps / 10 ** precision
}

/** One judge's score from technical and athletic components (e.g. 70% / 30%). */
export const componentScore = (technical, athletic, technicalWeight = 0.7) =>
  round2(technical * technicalWeight + athletic * (1 - technicalWeight))

/**
 * The final score from the judges' scores, or null until every judge has
 * scored. Dropping needs at least three judges, or nothing would be left.
 */
export function kataFinal(scores, judges, method = 'drop_high_low_average', penalty = 0) {
  const list = scores.filter((s) => Number.isFinite(s))
  if (list.length < judges) return null
  const sorted = [...list].sort((a, b) => a - b)
  const drop = method.startsWith('drop_high_low') && sorted.length >= 3
  const kept = drop ? sorted.slice(1, -1) : sorted
  const total = kept.reduce((a, b) => a + b, 0)
  return round2(Math.max(0, (method.endsWith('sum') ? total : total / kept.length) - (Number(penalty) || 0)))
}

/**
 * Ranks performers by final score. Ties go to the configured tie-break;
 * still level shares the place. Each row says what separated it, if anything.
 */
export function rankKata(rows, tieBreak = 'total_then_best') {
  const scored = rows.filter((r) => r.final != null)
  const sum = (r) => r.scores.reduce((a, b) => a + b, 0)
  const keyOf = {
    total_then_best: (r) => [r.final, sum(r), Math.max(...r.scores)],
    technical_first: (r) => [r.final, r.technicalTotal ?? 0, sum(r)],
    lowest_kept: (r) => [r.final, Math.min(...r.scores), sum(r)],
    shared: (r) => [r.final],
  }[tieBreak] || ((r) => [r.final, sum(r), Math.max(...r.scores)])
  const why = { total_then_best: ['higher total', 'better single score'], technical_first: ['higher technical score', 'higher total'], lowest_kept: ['higher lowest score', 'higher total'], shared: [] }[tieBreak] || []
  const cmp = (a, b) => {
    const [x, y] = [keyOf(a), keyOf(b)]
    for (let i = 0; i < x.length; i += 1) if (y[i] !== x[i]) return y[i] - x[i]
    return 0
  }
  const separatedBy = (a, b) => {
    const [x, y] = [keyOf(a), keyOf(b)]
    for (let i = 1; i < x.length; i += 1) if (y[i] !== x[i]) return why[i - 1] || null
    return 'shared'
  }
  scored.sort(cmp)
  let rank = 0
  const ranked = scored.map((r, i) => {
    if (i === 0 || cmp(scored[i - 1], r) !== 0) rank = i + 1
    const prev = scored[i - 1]
    const next = scored[i + 1]
    let tieReason = null
    if (prev && prev.final === r.final) tieReason = separatedBy(prev, r) === 'shared' ? 'Level: place shared' : `Level; placed below on the other's ${separatedBy(prev, r)}`
    else if (next && next.final === r.final) tieReason = separatedBy(r, next) === 'shared' ? 'Level: place shared' : `Level; ahead on ${separatedBy(r, next)}`
    return { ...r, rank, ...(tieReason ? { tieReason } : {}) }
  })
  return [...ranked, ...rows.filter((r) => r.final == null).map((r) => ({ ...r, rank: null }))]
}
