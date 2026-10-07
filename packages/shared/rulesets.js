// PRD v1 §6, §14, §24: rules live in versioned rulesets, not in code. A
// tournament points at one; a change to a ruleset that tournaments already
// use becomes a new version, so a finished event keeps the rules it ran under.

export const RULESET_KUMITE_KEYS = ['matchDurationSec', 'pointGap', 'points', 'senshu', 'overtime', 'extraTimeSec', 'penaltyCategories', 'penaltyLadder']
export const RULESET_KATA_KEYS = ['kataJudges', 'kataMethod', 'kataMinScore', 'kataMaxScore', 'kataPrecision', 'kataRounds', 'kataQualifiers', 'kataComponents', 'kataTechnicalWeight', 'kataTieBreak']

export const OVERTIME_MODES = ['none', 'senshu', 'extra_time', 'golden_score', 'hantei']
export const KATA_TIE_BREAKS = ['total_then_best', 'technical_first', 'lowest_kept', 'shared']

export const BUILTIN_RULESETS = [
  {
    id: 'builtin-wkf', family: 'builtin-wkf', name: 'WKF (standard)', version: 1, active: true, builtIn: true,
    description: 'Three-minute bouts, 8-point gap, senshu, two penalty categories; five-judge kata, highest and lowest dropped.',
    kumite: { matchDurationSec: 180, pointGap: 8, points: { yuko: 1, wazaAri: 2, ippon: 3 }, senshu: true, overtime: 'senshu', extraTimeSec: 60, penaltyCategories: 2, penaltyLadder: ['C', 'K', 'HC', 'H'] },
    kata: { kataJudges: 5, kataMethod: 'drop_high_low_average', kataMinScore: 5, kataMaxScore: 10, kataPrecision: 1, kataRounds: 2, kataQualifiers: 8, kataComponents: false, kataTechnicalWeight: 0.7, kataTieBreak: 'total_then_best' },
  },
  {
    id: 'builtin-wkf-components', family: 'builtin-wkf-components', name: 'WKF kata — technical / athletic', version: 1, active: true, builtIn: true,
    description: 'Kata scored on technical (70%) and athletic (30%) performance by seven judges.',
    kumite: { matchDurationSec: 180, pointGap: 8, points: { yuko: 1, wazaAri: 2, ippon: 3 }, senshu: true, overtime: 'senshu', extraTimeSec: 60, penaltyCategories: 2, penaltyLadder: ['C', 'K', 'HC', 'H'] },
    kata: { kataJudges: 7, kataMethod: 'drop_high_low_sum', kataMinScore: 5, kataMaxScore: 10, kataPrecision: 1, kataRounds: 3, kataQualifiers: 8, kataComponents: true, kataTechnicalWeight: 0.7, kataTieBreak: 'technical_first' },
  },
  {
    id: 'builtin-youth', family: 'builtin-youth', name: 'Youth / club (2-minute bouts)', version: 1, active: true, builtIn: true,
    description: 'Two-minute bouts, 6-point gap, golden score on a tie; three-judge kata averaged.',
    kumite: { matchDurationSec: 120, pointGap: 6, points: { yuko: 1, wazaAri: 2, ippon: 3 }, senshu: false, overtime: 'golden_score', extraTimeSec: 60, penaltyCategories: 1, penaltyLadder: ['C1', 'C2', 'C3', 'HC', 'H'] },
    kata: { kataJudges: 3, kataMethod: 'average', kataMinScore: 5, kataMaxScore: 10, kataPrecision: 1, kataRounds: 1, kataQualifiers: 4, kataComponents: false, kataTechnicalWeight: 0.7, kataTieBreak: 'total_then_best' },
  },
]

export const DEFAULT_RULESET_ID = 'builtin-wkf'

/** The tournament settings a ruleset sets. */
export function rulesetSettings(ruleset) {
  if (!ruleset) return {}
  return { ...(ruleset.kumite || {}), ...(ruleset.kata || {}), ruleset: `${ruleset.name} v${ruleset.version}` }
}

const int = (v, lo, hi) => Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi

/** Checks a ruleset's rules; returns a list of problems (empty when valid). */
export function rulesetProblems(r) {
  const out = []
  const k = r?.kumite || {}
  const t = r?.kata || {}
  if (!r?.name || String(r.name).trim().length < 2) out.push('name')
  if (!int(k.matchDurationSec, 30, 600)) out.push('kumite.matchDurationSec')
  if (!int(k.pointGap, 0, 20)) out.push('kumite.pointGap')
  for (const key of ['yuko', 'wazaAri', 'ippon']) if (!int(k.points?.[key], 1, 10)) out.push(`kumite.points.${key}`)
  if (!OVERTIME_MODES.includes(k.overtime)) out.push('kumite.overtime')
  if (!int(k.extraTimeSec ?? 60, 0, 300)) out.push('kumite.extraTimeSec')
  if (![1, 2].includes(Number(k.penaltyCategories))) out.push('kumite.penaltyCategories')
  if (!Array.isArray(k.penaltyLadder) || k.penaltyLadder.length < 2 || k.penaltyLadder.length > 6 || k.penaltyLadder.some((l) => !String(l).trim())) out.push('kumite.penaltyLadder')
  if (!int(t.kataJudges, 1, 9)) out.push('kata.kataJudges')
  if (!['drop_high_low_average', 'average', 'drop_high_low_sum', 'sum'].includes(t.kataMethod)) out.push('kata.kataMethod')
  if (!(Number(t.kataMinScore) >= 0) || !(Number(t.kataMaxScore) > Number(t.kataMinScore)) || Number(t.kataMaxScore) > 100) out.push('kata.score range')
  if (![0, 1, 2].includes(Number(t.kataPrecision))) out.push('kata.kataPrecision')
  if (!int(t.kataRounds, 1, 5)) out.push('kata.kataRounds')
  if (!int(t.kataQualifiers, 1, 64)) out.push('kata.kataQualifiers')
  if (t.kataComponents && !(Number(t.kataTechnicalWeight) > 0 && Number(t.kataTechnicalWeight) < 1)) out.push('kata.kataTechnicalWeight')
  if (!KATA_TIE_BREAKS.includes(t.kataTieBreak)) out.push('kata.kataTieBreak')
  return out
}

/** Only the known rule fields, typed. */
export function cleanRuleset({ name, description, kumite = {}, kata = {} }) {
  return {
    name: String(name || '').trim().slice(0, 80),
    description: description ? String(description).slice(0, 400) : null,
    kumite: {
      matchDurationSec: Number(kumite.matchDurationSec), pointGap: Number(kumite.pointGap),
      points: { yuko: Number(kumite.points?.yuko), wazaAri: Number(kumite.points?.wazaAri), ippon: Number(kumite.points?.ippon) },
      senshu: !!kumite.senshu, overtime: kumite.overtime, extraTimeSec: Number(kumite.extraTimeSec ?? 60),
      penaltyCategories: Number(kumite.penaltyCategories), penaltyLadder: (kumite.penaltyLadder || []).map((l) => String(l).trim().slice(0, 6)),
    },
    kata: {
      kataJudges: Number(kata.kataJudges), kataMethod: kata.kataMethod, kataMinScore: Number(kata.kataMinScore), kataMaxScore: Number(kata.kataMaxScore),
      kataPrecision: Number(kata.kataPrecision), kataRounds: Number(kata.kataRounds), kataQualifiers: Number(kata.kataQualifiers),
      kataComponents: !!kata.kataComponents, kataTechnicalWeight: Number(kata.kataTechnicalWeight ?? 0.7), kataTieBreak: kata.kataTieBreak,
    },
  }
}
