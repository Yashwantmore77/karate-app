import { boutOutcome } from '@kumite/shared/results.js'

// Following athletes and clubs on the public page (KAN-428).

const number = (m) => Number(String(m.matchNumber).replace(/\D/g, '')) || 0

/**
 * Where an athlete stands, from the public bout rows and the mats' queues
 * (`matQueues`): `now` the bout they are on a mat for; else `next`, their
 * soonest bout in a mat's queue with how many bouts that mat fights before
 * it; else `later`, a bout of the event that is not on the mats yet. And
 * `latest`, their last result, seen from their side.
 */
export function athleteStatus(id, matches, queues) {
  const mine = matches.filter((m) => m.akaId === id || m.aoId === id).sort((a, b) => number(a) - number(b))
  const ids = new Set(mine.map((m) => m.id))
  const side = (m) => (m.akaId === id ? 'aka' : 'ao')
  const against = (m) => (side(m) === 'aka' ? m.ao : m.aka)

  let now = null
  let next = null
  for (const q of queues) {
    if (q.now && ids.has(q.now.id)) now = { bout: q.now, mat: q.mat, side: side(q.now), against: against(q.now) }
    const i = q.next.findIndex((m) => ids.has(m.id))
    const ahead = i + (q.now ? 1 : 0)
    if (i >= 0 && (!next || ahead < next.ahead)) next = { bout: q.next[i], mat: q.mat, ahead, against: against(q.next[i]) }
  }
  const waiting = !now && !next && mine.find((m) => !['completed', 'cancelled'].includes(m.status) && m.aka && m.ao)
  const later = waiting ? { bout: waiting, mat: waiting.mat || 1, against: against(waiting) } : null

  const last = mine.filter((m) => m.status === 'completed').at(-1)
  const outcome = last && boutOutcome(last)
  const latest = last ? {
    bout: last,
    against: against(last),
    result: outcome.winner === 'draw' ? 'Draw' : outcome.winner === side(last) ? 'Won' : 'Lost',
    score: side(last) === 'aka' ? `${outcome.akaScore}–${outcome.aoScore}` : `${outcome.aoScore}–${outcome.akaScore}`,
  } : null
  return { now, next, later, latest, bouts: mine.length }
}
