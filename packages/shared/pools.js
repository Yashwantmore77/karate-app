// PRD sections 22-26 and Rules 3-4: how a division is split into pools, and
// the bouts each pool fights. Pure functions: randomness is injected, so a test
// (or an auditor replaying a draw) gets the same answer from the same seed.

export const DEFAULT_POOL_SIZE = 8

export const DRAW_METHODS = { RANDOM: 'random', SEEDED: 'seeded' }

/** Fewest pools that keep every pool at or under the configured size. */
export function poolCount(playerCount, poolSize = DEFAULT_POOL_SIZE) {
  if (!playerCount) return 0
  const size = Math.max(2, poolSize || DEFAULT_POOL_SIZE)
  return Math.ceil(playerCount / size)
}

/**
 * How pools are sized when players do not divide evenly (PRD point 12):
 * `max` never exceeds the configured size (17 at 8 → 6, 6, 5); `overflow`
 * keeps the number of pools down and lets them run over (17 at 8 → 9, 8).
 */
export const POOL_MODES = ['max', 'overflow', 'equal']

/** Whether a split is uneven (pools of different sizes). */
export const isUneven = (sizes) => new Set(sizes).size > 1

/**
 * Rule 4: as even as possible. 20 players at size 8 is three pools of 7, 7, 6,
 * never 8, 8, 4.
 */
export function poolSizes(playerCount, poolSize = DEFAULT_POOL_SIZE, mode = 'max') {
  // PRD v1 §6 "allow uneven pools: no": the fewest pools that split exactly,
  // when there is such a split; otherwise as even as possible.
  if (mode === 'equal' && playerCount) {
    const size = Math.max(2, poolSize || DEFAULT_POOL_SIZE)
    for (let k = Math.ceil(playerCount / size); k <= Math.floor(playerCount / 2); k += 1) {
      if (playerCount % k === 0) return Array.from({ length: k }, () => playerCount / k)
    }
    return poolSizes(playerCount, poolSize, 'max')
  }
  const pools = mode === 'overflow' && playerCount
    ? Math.max(1, Math.floor(playerCount / Math.max(2, poolSize || DEFAULT_POOL_SIZE)))
    : poolCount(playerCount, poolSize)
  if (!pools) return []
  const base = Math.floor(playerCount / pools)
  const extra = playerCount % pools
  return Array.from({ length: pools }, (_, i) => base + (i < extra ? 1 : 0))
}

/** A, B, ... Z, AA, AB, ... */
export function poolName(index) {
  let name = ''
  let n = index
  do {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return name
}

/** A small seedable generator, so a draw can be reproduced from its seed. */
export function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 1
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(items, random = Math.random) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Splits players into pools.
 *
 * Seeded players (a positive `seed`, 1 is strongest) are snaked across the
 * pools first, so seeds 1 and 2 can only meet late. Everyone else is placed at
 * random, preferring the pool with the fewest players from the same team, so
 * clubmates are kept apart wherever the numbers allow.
 */
export function drawPools(players, {
  poolSize = DEFAULT_POOL_SIZE,
  poolMode = 'max',
  method = DRAW_METHODS.RANDOM,
  random = Math.random,
  teamOf = (player) => player.teamId,
  seedOf = (player) => player.seed,
} = {}) {
  const sizes = poolSizes(players.length, poolSize, poolMode)
  const pools = sizes.map((capacity, index) => ({ name: poolName(index), capacity, players: [] }))
  if (!pools.length) return []

  const isSeeded = (p) => method === DRAW_METHODS.SEEDED && Number(seedOf(p)) > 0
  const seeded = players.filter(isSeeded).sort((a, b) => seedOf(a) - seedOf(b))
  // Biggest teams are placed first, while every pool still has room to keep
  // their players apart; order within a team, and between teams, is random.
  const teamSize = new Map()
  for (const p of players) teamSize.set(teamOf(p), (teamSize.get(teamOf(p)) || 0) + 1)
  const rest = shuffle(players.filter((p) => !isSeeded(p)), random)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (teamOf(b.p) ? teamSize.get(teamOf(b.p)) : 0) - (teamOf(a.p) ? teamSize.get(teamOf(a.p)) : 0) || a.i - b.i)
    .map(({ p }) => p)

  // Snake: A B C C B A A B C ...
  seeded.forEach((player, i) => {
    const lap = Math.floor(i / pools.length)
    const offset = i % pools.length
    const order = lap % 2 === 0 ? offset : pools.length - 1 - offset
    const target = pools[order].players.length < pools[order].capacity
      ? pools[order]
      : pools.find((pool) => pool.players.length < pool.capacity)
    target.players.push(player)
  })

  for (const player of rest) {
    const team = teamOf(player)
    const open = pools.filter((pool) => pool.players.length < pool.capacity)
    const clash = (pool) => (team ? pool.players.filter((p) => teamOf(p) === team).length : 0)
    // Fewest clubmates first, then the emptiest pool, so sizes stay even.
    open.sort((a, b) => clash(a) - clash(b)
      || (a.players.length / a.capacity) - (b.players.length / b.capacity))
    open[0].players.push(player)
  }

  return pools.map(({ name, players: members }) => ({ name, players: members }))
}

/**
 * Orients every pairing so each player is AKA about as often as AO: an Euler
 * circuit over the pairings (with a phantom player joined to everyone when the
 * count is even, so every degree is even) gives each player as many bouts in
 * as out. Returns a Set of "aka>ao" keys.
 */
function balancedCorners(ids) {
  const GHOST = '\u0000ghost'
  const nodes = ids.length % 2 ? [...ids] : [...ids, GHOST]
  const adj = new Map(nodes.map((n) => [n, []]))
  let edge = 0
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      adj.get(nodes[i]).push({ to: nodes[j], edge })
      adj.get(nodes[j]).push({ to: nodes[i], edge })
      edge += 1
    }
  }
  const used = new Set()
  const oriented = new Set()
  // Hierholzer, iteratively: every edge is walked once, in the direction taken.
  const stack = [nodes[0]]
  while (stack.length) {
    const at = stack[stack.length - 1]
    const list = adj.get(at)
    while (list.length && used.has(list[list.length - 1].edge)) list.pop()
    if (!list.length) { stack.pop(); continue }
    const { to, edge: e } = list.pop()
    used.add(e)
    if (at !== GHOST && to !== GHOST) oriented.add(`${at}>${to}`)
    stack.push(to)
  }
  return oriented
}

/**
 * Every pairing in a pool, by round (circle method), so nobody fights two bouts
 * in a row when the pool is big enough to avoid it. Corners are balanced so
 * each player spends about as many bouts in AKA as in AO; the assignment is
 * part of the record (section 26), never inferred from display order.
 */
export function roundRobin(ids) {
  const list = [...ids]
  if (list.length < 2) return []
  const corners = balancedCorners(ids)
  if (list.length % 2) list.push(null)
  const n = list.length
  const bouts = []

  for (let round = 0; round < n - 1; round += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = list[i]
      const b = list[n - 1 - i]
      if (a == null || b == null) continue
      const [aka, ao] = corners.has(`${a}>${b}`) ? [a, b] : [b, a]
      bouts.push({ round: round + 1, aka, ao })
    }
    // Keep the first fixed, rotate the rest.
    list.splice(1, 0, list.pop())
  }
  return bouts
}
