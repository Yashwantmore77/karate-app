// Every mat's queue, as the hall screens and the public page show it.

const number = (m) => Number(String(m.matchNumber).replace(/\D/g, '')) || 0
export const ON_MAT = ['live', 'open', 'paused']

// Which bout a mat is on when more than one is marked as on it: the one its
// scoreboard shows, else the one being fought, then paused, then just opened.
const RANK = { live: 1, paused: 2, open: 3 }

/**
 * The bouts still to come of the event on the mats now (Kata and Kumite take
 * turns), mat by mat in match-number order: the one on the mat now, if any,
 * and the ones waiting after it. Public bout rows: { mat, status, event, aka, ao };
 * `scored(bout)` says whether a scoreboard is showing that bout.
 */
export function matQueues(matches, runningEvent = null, scored = () => false) {
  const rank = (m) => (scored(m) ? 0 : RANK[m.status])
  const waiting = matches.filter((m) => !['completed', 'cancelled'].includes(m.status) && m.aka && m.ao)
  const pending = waiting.filter((m) => !runningEvent || !m.event || m.event === runningEvent).sort((a, b) => number(a) - number(b))
  const mats = [...new Set(pending.map((m) => m.mat || 1))].sort((a, b) => a - b)
  return mats.map((mat) => {
    const queue = pending.filter((m) => (m.mat || 1) === mat)
    const now = queue.filter((m) => ON_MAT.includes(m.status)).sort((a, b) => rank(a) - rank(b))[0] || null
    return { mat, now, next: queue.filter((m) => m !== now) }
  })
}
