// PRD sections 34-36 and 42-43: pool standings, the knockout stage that the
// pool qualifiers feed, medals and the medal tally. Everything here is
// computed from match records, so nothing can drift from what was fought.

export const DEFAULT_RESULT_RULES = {
  pointsForWin: 3,
  pointsForDraw: 1,
  qualifiersPerPool: 2,
  // In order. A rule that cannot separate two players hands over to the next.
  tieBreakers: ['points', 'wins', 'headToHead', 'scoreDiff', 'scoreFor', 'penalties'],
  bronzeCount: 2,
}

export const TIE_BREAKERS = ['points', 'wins', 'headToHead', 'scoreDiff', 'scoreFor', 'penalties']

/**
 * The bout outcome in AKA/AO terms, whatever vocabulary the record used: the
 * console writes red/blue (red = AKA), the PRD speaks AKA/AO.
 */
export function boutOutcome(match) {
  const finished = ['completed', 'COMPLETED', 'WALKOVER', 'DISQUALIFIED', 'NO_SHOW', 'KIKEN'].includes(match.status)
  if (!finished) return null
  const w = match.winner
  const winner = w === 'red' || w === 'aka' ? 'aka'
    : w === 'blue' || w === 'ao' ? 'ao'
      : 'draw'
  return {
    winner,
    akaScore: Number(match.avgRed ?? match.akaScore ?? 0) || 0,
    aoScore: Number(match.avgBlue ?? match.aoScore ?? 0) || 0,
    akaPenalties: Number(match.akaPenalties ?? 0) || 0,
    aoPenalties: Number(match.aoPenalties ?? 0) || 0,
  }
}

/**
 * Standings for one pool. `bouts` are { aka, ao, ...match } where aka/ao are
 * the ids used in `ids`.
 */
export function poolStandings(ids, bouts, rules = {}) {
  const r = { ...DEFAULT_RESULT_RULES, ...rules }
  const rows = new Map(ids.map((id) => [id, {
    id, played: 0, wins: 0, losses: 0, draws: 0, scoreFor: 0, scoreAgainst: 0, penalties: 0, points: 0,
  }]))
  const beat = new Set()

  for (const bout of bouts) {
    const outcome = boutOutcome(bout)
    const aka = rows.get(bout.aka)
    const ao = rows.get(bout.ao)
    if (!outcome || !aka || !ao) continue
    aka.played += 1
    ao.played += 1
    aka.scoreFor += outcome.akaScore
    aka.scoreAgainst += outcome.aoScore
    ao.scoreFor += outcome.aoScore
    ao.scoreAgainst += outcome.akaScore
    aka.penalties += outcome.akaPenalties
    ao.penalties += outcome.aoPenalties
    if (outcome.winner === 'aka') {
      aka.wins += 1; ao.losses += 1; aka.points += r.pointsForWin
      beat.add(`${bout.aka}>${bout.ao}`)
    } else if (outcome.winner === 'ao') {
      ao.wins += 1; aka.losses += 1; ao.points += r.pointsForWin
      beat.add(`${bout.ao}>${bout.aka}`)
    } else {
      aka.draws += 1; ao.draws += 1; aka.points += r.pointsForDraw; ao.points += r.pointsForDraw
    }
  }

  // Head-to-head separates exactly two tied players. Among three or more it can
  // go round in a circle (a beat b, b beat c, c beat a), so it is skipped and
  // the next rule decides.
  const all = [...rows.values()]
  const tiedBefore = (a, rule) => {
    const earlier = r.tieBreakers.slice(0, r.tieBreakers.indexOf(rule))
    const key = (x) => earlier.map((k) => (k === 'scoreDiff' ? x.scoreFor - x.scoreAgainst : x[k])).join('|')
    return all.filter((x) => key(x) === key(a)).length
  }

  const compare = (a, b) => {
    for (const rule of r.tieBreakers) {
      let d = 0
      if (rule === 'points') d = b.points - a.points
      else if (rule === 'wins') d = b.wins - a.wins
      else if (rule === 'scoreDiff') d = (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst)
      else if (rule === 'scoreFor') d = b.scoreFor - a.scoreFor
      else if (rule === 'penalties') d = a.penalties - b.penalties
      else if (rule === 'headToHead') {
        if (tiedBefore(a, rule) !== 2) continue
        d = beat.has(`${b.id}>${a.id}`) ? 1 : beat.has(`${a.id}>${b.id}`) ? -1 : 0
      }
      if (d) return d
    }
    return 0
  }

  const sorted = [...rows.values()].sort(compare)

  // PRD v1 §28 "Ties: invoke configured tie-break sequence and show reason".
  const TIE_LABEL = { wins: 'more wins', headToHead: 'won the head-to-head', scoreDiff: 'better score difference', scoreFor: 'more points scored', penalties: 'fewer penalties' }
  const decidedBy = (a, b) => {
    for (const rule of r.tieBreakers) {
      if (rule === 'points') { if (a.points !== b.points) return null; continue }
      let d = 0
      if (rule === 'wins') d = b.wins - a.wins
      else if (rule === 'scoreDiff') d = (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst)
      else if (rule === 'scoreFor') d = b.scoreFor - a.scoreFor
      else if (rule === 'penalties') d = a.penalties - b.penalties
      else if (rule === 'headToHead') {
        if (tiedBefore(a, rule) !== 2) continue
        d = beat.has(`${b.id}>${a.id}`) ? 1 : beat.has(`${a.id}>${b.id}`) ? -1 : 0
      }
      if (d) return rule
    }
    return 'shared'
  }

  let rank = 0
  const qualifyMode = r.qualificationMode || 'top_n'
  return sorted.map((row, i) => {
    if (i === 0 || compare(sorted[i - 1], row) !== 0) rank = i + 1
    const tiedWithNext = sorted[i + 1] && sorted[i + 1].points === row.points && row.played > 0
    const tiedWithPrev = i > 0 && sorted[i - 1].points === row.points && row.played > 0
    let tieBreak = null
    if (tiedWithPrev) {
      const rule = decidedBy(sorted[i - 1], row)
      tieBreak = rule === 'shared' ? 'Level on every tie-break: place shared' : rule ? `Level on points; placed below on ${TIE_LABEL[rule] ? `the other's ${TIE_LABEL[rule]}` : rule}` : null
    } else if (tiedWithNext) {
      const rule = decidedBy(row, sorted[i + 1])
      tieBreak = rule === 'shared' ? 'Level on every tie-break: place shared' : rule ? `Level on points; ahead on ${TIE_LABEL[rule] || rule}` : null
    }
    // Places, not ranks, decide qualification: a three-way tie for first must
    // not send three players through when the tournament takes two.
    const qualified = row.played > 0 && (qualifyMode === 'points'
      ? row.points >= (r.qualificationPoints ?? 0)
      : qualifyMode === 'manual' ? (r.manualQualifiers || []).includes(row.id) : i < r.qualifiersPerPool)
    return { ...row, rank, qualified, ...(tieBreak ? { tieBreak } : {}) }
  })
}

export const isCancelled = (bout) => String(bout.status).toLowerCase() === 'cancelled'

export const poolComplete = (bouts) =>
  bouts.length > 0 && bouts.every((b) => boutOutcome(b) || isCancelled(b))

// --- knockout ------------------------------------------------------------------

const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p }

/** Standard bracket order for `size` slots: 1 v size, and 1 and 2 in opposite halves. */
export function seedOrder(size) {
  let order = [1]
  while (order.length < size) {
    const sum = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, sum - seed])
  }
  return order
}

export function roundName(matchesInRound) {
  if (matchesInRound === 1) return 'Final'
  if (matchesInRound === 2) return 'Semi Final'
  if (matchesInRound === 4) return 'Quarter Final'
  return `Round of ${matchesInRound * 2}`
}

/**
 * Cross-pool qualifier order: every pool winner before any runner-up, so pool
 * winners take the top seeds and A1 meets B2, not B1, in a two-pool semi.
 */
export function qualifierSeeds(poolsStandings, qualifiersPerPool = DEFAULT_RESULT_RULES.qualifiersPerPool, { byFlag = false } = {}) {
  const seeds = []
  const deepest = Math.max(0, ...poolsStandings.map((p) => p.standings.length))
  const places = byFlag ? deepest : qualifiersPerPool
  for (let place = 1; place <= places; place += 1) {
    for (const { pool, standings } of poolsStandings) {
      const row = standings[place - 1]
      // With points or manual qualification, the standings' own flag decides.
      if (row && row.played > 0 && (!byFlag || row.qualified)) seeds.push({ id: row.id, pool, place })
    }
  }
  return seeds
}

/**
 * The bracket skeleton for seeded entries. A first-round slot with no opponent
 * is a bye: the seed goes straight through. Later rounds name their feeders
 * instead of players, so the bracket fills itself as results arrive.
 */
export function buildBracket(entries) {
  if (entries.length < 2) return []
  const size = nextPow2(entries.length)
  const order = seedOrder(size)
  const slots = order.map((seed) => entries[seed - 1]?.id ?? null)
  const rounds = Math.log2(size)
  const matches = []

  for (let round = 1; round <= rounds; round += 1) {
    const count = size / 2 ** round
    for (let slot = 0; slot < count; slot += 1) {
      const key = `R${round}-${slot + 1}`
      if (round === 1) {
        matches.push({ key, round, slot: slot + 1, name: roundName(count), aka: slots[slot * 2], ao: slots[slot * 2 + 1] })
      } else {
        matches.push({
          key, round, slot: slot + 1, name: roundName(count), aka: null, ao: null,
          feedAka: `R${round - 1}-${slot * 2 + 1}`, feedAo: `R${round - 1}-${slot * 2 + 2}`,
        })
      }
    }
  }
  return matches
}

/** Who goes through from a bracket match: its winner, or the lone entrant of a bye. */
export function bracketWinner(match) {
  if (match.aka && !match.ao && match.round === 1) return match.aka
  if (match.ao && !match.aka && match.round === 1) return match.ao
  const outcome = boutOutcome(match)
  if (!outcome || outcome.winner === 'draw') return null
  return outcome.winner === 'aka' ? match.aka : match.ao
}

export function bracketLoser(match) {
  const outcome = boutOutcome(match)
  if (!outcome || outcome.winner === 'draw' || !match.aka || !match.ao) return null
  return outcome.winner === 'aka' ? match.ao : match.aka
}

/**
 * Fills later rounds from earlier results. Returns the matches whose corners
 * changed, so a caller writes only those.
 */
export function advanceBracket(matches) {
  const byKey = new Map(matches.map((m) => [m.key, { ...m }]))
  const changed = []
  const ordered = [...byKey.values()].sort((a, b) => a.round - b.round || a.slot - b.slot)
  for (const match of ordered) {
    if (match.round === 1) continue
    const aka = bracketWinner(byKey.get(match.feedAka) || {}) ?? null
    const ao = bracketWinner(byKey.get(match.feedAo) || {}) ?? null
    if (aka !== match.aka || ao !== match.ao) {
      match.aka = aka
      match.ao = ao
      changed.push(match)
    }
  }
  return changed
}

// --- medals ------------------------------------------------------------------

export const MEDALS = { GOLD: 'gold', SILVER: 'silver', BRONZE: 'bronze' }

const HOW = { kiken: 'withdrawal', shikkaku: 'disqualification', hansoku: 'hansoku', walkover: 'walkover' }
const howWon = (m) => {
  const t = m.result?.type
  if (t && t !== 'COMPLETED') return ` (${String(t).toLowerCase().replace('_', '-')})`
  return m.result?.method && HOW[m.result.method] ? ` (${HOW[m.result.method]})` : ''
}

/**
 * Medals from a finished bracket: final winner, final loser, and either the
 * semi-final losers or, with a third-place match, its winner. Each medal keeps
 * the bout that decided it (PRD v1 §16 "preserve source match IDs").
 */
export function bracketMedals(matches, { bronzeCount = DEFAULT_RESULT_RULES.bronzeCount } = {}) {
  if (!matches.length) return []
  const main = matches.filter((m) => !m.thirdPlace)
  const top = Math.max(...main.map((m) => m.round))
  const final = main.find((m) => m.round === top)
  const gold = final && bracketWinner(final)
  if (!gold) return []
  const out = [{ id: gold, rank: 1, medal: MEDALS.GOLD, sourceMatchId: final.id || null, reason: `Won the final${howWon(final)}` }]
  const silver = bracketLoser(final)
  if (silver) out.push({ id: silver, rank: 2, medal: MEDALS.SILVER, sourceMatchId: final.id || null, reason: 'Lost the final' })
  const thirdPlace = matches.find((m) => m.thirdPlace)
  if (thirdPlace) {
    const bronze = bracketWinner(thirdPlace)
    if (bronze) out.push({ id: bronze, rank: 3, medal: MEDALS.BRONZE, sourceMatchId: thirdPlace.id || null, reason: `Won the third-place match${howWon(thirdPlace)}` })
    return out
  }
  main.filter((m) => m.round === top - 1)
    .map((m) => ({ id: bracketLoser(m), m })).filter((x) => x.id).slice(0, bronzeCount)
    .forEach(({ id, m }) => out.push({ id, rank: 3, medal: MEDALS.BRONZE, sourceMatchId: m.id || null, reason: 'Lost a semi-final' }))
  return out
}

/** Medals from a lone pool once every bout is in: places 1-3 by standing. */
export function poolMedals(standings, { label = 'pool' } = {}) {
  const medalFor = { 1: MEDALS.GOLD, 2: MEDALS.SILVER, 3: MEDALS.BRONZE }
  return standings
    .filter((row) => row.played > 0 && medalFor[row.rank])
    .map((row) => ({ id: row.id, rank: row.rank, medal: medalFor[row.rank], reason: `Place ${row.rank} in the ${label}${row.tieBreak ? ` — ${row.tieBreak}` : ''}` }))
}

export const TALLY_BY = ['club', 'district', 'state', 'country']

/** Section 43. `medals` carry the grouping fields of the player they went to. */
export function medalTally(medals, by = 'club') {
  const rows = new Map()
  for (const medal of medals) {
    const key = medal[by] || 'Unassigned'
    if (!rows.has(key)) rows.set(key, { name: key, gold: 0, silver: 0, bronze: 0, total: 0 })
    const row = rows.get(key)
    if (medal.medal in row) row[medal.medal] += 1
    row.total += 1
  }
  return [...rows.values()].sort((a, b) =>
    b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.name.localeCompare(b.name))
}
