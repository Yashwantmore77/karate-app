/**
 * Round-robin pairings: everyone meets everyone once.
 *
 * Ordered by the circle method rather than as a plain double loop. A double
 * loop puts the first competitor in the first n-1 bouts in a row; the circle
 * method deals the pairings out in rounds where each competitor appears at most
 * once, so a mat working down the list gives everybody a rest between bouts.
 *
 * Sides are dealt so colours even out: whichever of the two has been red less
 * often so far takes red. Alternating by round alone left one competitor in a
 * field of nine red six times out of eight.
 */
export function roundRobinPairs(ids) {
  // An odd field gets a bye: a placeholder whoever draws it sits the round out.
  const wheel = ids.length % 2 === 0 ? [...ids] : [...ids, null]
  const size = wheel.length
  const pairs = []
  const timesRed = new Map(ids.map((id) => [id, 0]))

  for (let round = 0; round < size - 1; round += 1) {
    for (let i = 0; i < size / 2; i += 1) {
      const a = wheel[i]
      const b = wheel[size - 1 - i]
      if (a === null || b === null) continue
      // Ties fall back to alternating by round, so the first seat still swaps.
      const aFirst = timesRed.get(a) !== timesRed.get(b)
        ? timesRed.get(a) < timesRed.get(b)
        : round % 2 === 0
      const [red, blue] = aFirst ? [a, b] : [b, a]
      timesRed.set(red, timesRed.get(red) + 1)
      pairs.push([red, blue])
    }
    // Hold the first seat still and turn the rest of the wheel one place.
    wheel.splice(1, 0, wheel.pop())
  }

  return pairs
}

/** An unordered key for a pair, so A-v-B and B-v-A count as the same bout. */
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
