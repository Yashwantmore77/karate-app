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
  const finished = ['completed', 'COMPLETED', 'WALKOVER', 'DISQUALIFIED'].includes(match.status)
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
  let rank = 0
  return sorted.map((row, i) => {
    if (i === 0 || compare(sorted[i - 1], row) !== 0) rank = i + 1
    return { ...row, rank, qualified: rank <= r.qualifiersPerPool && row.played > 0 }
  })
}

export const poolComplete = (bouts) =>
  bouts.length > 0 && bouts.every((b) => boutOutcome(b) || ['CANCELLED'].includes(b.status))

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
export function qualifierSeeds(poolsStandings, qualifiersPerPool = DEFAULT_RESULT_RULES.qualifiersPerPool) {
  const seeds = []
  for (let place = 1; place <= qualifiersPerPool; place += 1) {
    for (const { pool, standings } of poolsStandings) {
      const row = standings[place - 1]
      if (row && row.played > 0) seeds.push({ id: row.id, pool, place })
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

/** Medals from a finished bracket: final winner, final loser, semi-final losers. */
export function bracketMedals(matches, { bronzeCount = DEFAULT_RESULT_RULES.bronzeCount } = {}) {
  if (!matches.length) return []
  const top = Math.max(...matches.map((m) => m.round))
  const final = matches.find((m) => m.round === top)
  const gold = final && bracketWinner(final)
  if (!gold) return []
  const out = [{ id: gold, rank: 1, medal: MEDALS.GOLD }]
  const silver = bracketLoser(final)
  if (silver) out.push({ id: silver, rank: 2, medal: MEDALS.SILVER })
  matches.filter((m) => m.round === top - 1)
    .map(bracketLoser).filter(Boolean).slice(0, bronzeCount)
    .forEach((id) => out.push({ id, rank: 3, medal: MEDALS.BRONZE }))
  return out
}

/** Medals from a lone pool once every bout is in: places 1-3 by standing. */
export function poolMedals(standings) {
  const medalFor = { 1: MEDALS.GOLD, 2: MEDALS.SILVER, 3: MEDALS.BRONZE }
  return standings
    .filter((row) => row.played > 0 && medalFor[row.rank])
    .map((row) => ({ id: row.id, rank: row.rank, medal: medalFor[row.rank] }))
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
