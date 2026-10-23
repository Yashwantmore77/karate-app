import { normalizeName } from './registration.js'
import { boutOutcome } from './results.js'
import { countsAsEntry } from './lifecycle.js'

// Phase 2 "advanced analytics": athletes and clubs across tournaments. An
// athlete is the same person in two events when their name (case, spacing and
// accents ignored) and date of birth match. The date of birth only links the
// records here: each athlete is given an id that means nothing outside one
// result, so it cannot be reversed to a birthday (Rule 8 applies to staff
// screens too). Where name and birthday get it wrong (two people alike, or
// one name spelt two ways), an organiser's decisions put it right (KAN-369).

const identity = (p) => `${normalizeName(p.name)}|${p.dob || ''}`
const clubKey = (name) => normalizeName(name || '') || '—'
const MEDALS = ['gold', 'silver', 'bronze']
// A bout won without being fought: the opponent did not come (walkover,
// no-show) or had withdrawn (kiken). It is no win or loss for either athlete;
// the winner's are counted apart, as walkovers. A disqualification ends a bout
// that was fought, so it still counts.
const UNFOUGHT = new Set(['walkover', 'no_show', 'kiken'])
export const unfought = (m) => UNFOUGHT.has(m.result?.method) || ['WALKOVER', 'NO_SHOW', 'KIKEN'].includes(m.status)

/**
 * Builds the analytics from each tournament's data:
 * [{ tournament, players, teams, matches, medals }], matches as the service
 * lists them (with akaPlayerId / aoPlayerId), medals as published.
 *
 * `links` are the organiser's decisions: { id, kind: 'same', playerIds: [a, b] }
 * makes two player records one athlete; { id, kind: 'apart', playerIds: [a] }
 * takes a record out of the athlete its name and birthday give it. A decision
 * about a record outside `events` is left out.
 */
export function buildAnalytics(events, links = []) {
  const records = new Map(events.flatMap(({ tournament, players }) => players.map((p) => [p.id, { player: p, tournament: tournament.name }])))
  const known = links.filter((l) => l.playerIds.every((id) => records.has(id)))
  const apart = new Set(known.filter((l) => l.kind === 'apart').flatMap((l) => l.playerIds))
  // A record starts as its name and birthday (alone, if set apart); "same" joins two.
  const start = (p) => (apart.has(p.id) ? `record|${p.id}` : identity(p))
  const joined = new Map()
  const root = (k) => (joined.has(k) ? root(joined.get(k)) : k)
  for (const l of known.filter((x) => x.kind === 'same')) {
    const [a, b] = l.playerIds.map((id) => root(start(records.get(id).player)))
    if (a !== b) joined.set(b, a)
  }
  const ids = new Map()
  const athleteKey = (p) => {
    const k = root(start(p))
    if (!ids.has(k)) ids.set(k, `a${ids.size + 1}`)
    return ids.get(k)
  }
  // Each record's line in its athlete's history.
  const lineOf = new Map()
  const athletes = new Map()
  const clubs = new Map()
  const tournaments = []
  const sorted = [...events].sort((a, b) => String(a.tournament.startDate || a.tournament.date || '').localeCompare(String(b.tournament.startDate || b.tournament.date || '')))

  const clubOf = (name) => {
    const key = clubKey(name)
    if (!clubs.has(key)) clubs.set(key, { key, name: name || 'No club', tournaments: new Set(), entries: 0, gold: 0, silver: 0, bronze: 0, won: 0, lost: 0, walkovers: 0, history: [] })
    return clubs.get(key)
  }

  for (const { tournament, players, teams, matches, medals } of sorted) {
    const date = tournament.startDate || tournament.date || null
    const teamsById = new Map(teams.map((t) => [t.id, t]))
    const clubName = (p) => p.club || teamsById.get(p.teamId)?.club || teamsById.get(p.teamId)?.name || null
    const byPlayer = new Map(players.map((p) => [p.id, p]))
    const perClub = new Map()
    const entry = (club) => {
      if (!perClub.has(club.key)) perClub.set(club.key, { tournamentId: tournament.id, tournament: tournament.name, date, entries: 0, gold: 0, silver: 0, bronze: 0, won: 0, lost: 0, walkovers: 0 })
      return perClub.get(club.key)
    }

    for (const p of players) {
      if (['DRAFT', 'REJECTED'].includes(p.registrationStatus)) continue
      const key = athleteKey(p)
      if (!athletes.has(key)) athletes.set(key, { key, name: p.name, gender: p.gender || null, club: clubName(p), tournaments: new Set(), gold: 0, silver: 0, bronze: 0, won: 0, lost: 0, walkovers: 0, history: [], decisions: [] })
      const a = athletes.get(key)
      a.name = p.name
      a.club = clubName(p) || a.club
      a.tournaments.add(tournament.id)
      const line = { playerId: p.id, tournamentId: tournament.id, tournament: tournament.name, date, club: clubName(p), medals: [], won: 0, lost: 0, walkovers: 0 }
      a.history.push(line)
      lineOf.set(p.id, line)
      const club = clubOf(clubName(p))
      club.tournaments.add(tournament.id)
      // A withdrawn athlete keeps the record of the bouts they fought, but is not an entry.
      if (!countsAsEntry(p)) continue
      club.entries += 1
      entry(club).entries += 1
    }

    for (const m of matches) {
      const outcome = boutOutcome(m)
      if (!outcome || !m.winner || m.winner === 'tie' || !m.akaPlayerId || !m.aoPlayerId) continue
      const [winner, loser] = m.winner === 'red' ? [m.akaPlayerId, m.aoPlayerId] : [m.aoPlayerId, m.akaPlayerId]
      if (unfought(m)) {
        const p = byPlayer.get(winner)
        if (!p) continue
        const h = lineOf.get(winner)
        const club = clubOf(clubName(p))
        const a = athletes.get(athleteKey(p))
        if (a) a.walkovers += 1
        club.walkovers += 1; entry(club).walkovers += 1; if (h) h.walkovers += 1
        continue
      }
      for (const [id, won] of [[winner, true], [loser, false]]) {
        const p = byPlayer.get(id)
        if (!p) continue
        const a = athletes.get(athleteKey(p))
        const h = lineOf.get(id)
        const club = clubOf(clubName(p))
        const row = entry(club)
        if (won) { a.won += 1; club.won += 1; row.won += 1; if (h) h.won += 1 } else { a.lost += 1; club.lost += 1; row.lost += 1; if (h) h.lost += 1 }
      }
    }

    let medalCount = 0
    for (const md of medals) {
      if (!MEDALS.includes(md.medal)) continue
      medalCount += 1
      const p = byPlayer.get(md.playerId)
      const club = clubOf(md.club || (p && clubName(p)))
      club[md.medal] += 1
      entry(club)[md.medal] += 1
      if (p) {
        const a = athletes.get(athleteKey(p))
        if (a) {
          a[md.medal] += 1
          lineOf.get(md.playerId)?.medals.push({ medal: md.medal, category: md.category })
        }
      }
    }
    for (const [key, row] of perClub) clubs.get(key).history.push(row)
    tournaments.push({
      id: tournament.id, name: tournament.name, date, status: tournament.lifecycleStatus || null,
      players: players.filter(countsAsEntry).length,
      teams: teams.length, bouts: matches.filter((m) => boutOutcome(m) && !unfought(m)).length, medals: medalCount,
    })
  }

  // Each athlete lists the decisions about its records, so they can be undone.
  for (const l of known) {
    const decision = { id: l.id, kind: l.kind, records: l.playerIds.map((id) => ({ playerId: id, name: records.get(id).player.name, tournament: records.get(id).tournament })) }
    const keys = new Set(l.playerIds.filter((id) => lineOf.has(id)).map((id) => athleteKey(records.get(id).player)))
    for (const key of keys) athletes.get(key).decisions.push(decision)
  }

  const rate = (w, l) => (w + l ? Math.round((w / (w + l)) * 1000) / 10 : null)
  const finish = (x) => ({ ...x, tournaments: x.tournaments.size, medals: x.gold + x.silver + x.bronze, bouts: x.won + x.lost, winRate: rate(x.won, x.lost) })
  const byMedals = (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || (b.winRate ?? -1) - (a.winRate ?? -1) || String(a.name).localeCompare(String(b.name))
  return {
    tournaments,
    clubs: [...clubs.values()].map(finish).sort(byMedals),
    athletes: [...athletes.values()].map(finish).sort(byMedals),
  }
}
