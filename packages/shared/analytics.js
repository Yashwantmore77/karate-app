import { normalizeName } from './registration.js'
import { boutOutcome } from './results.js'

// Phase 2 "advanced analytics": athletes and clubs across tournaments. An
// athlete is the same person in two events when their name (case, spacing and
// accents ignored) and date of birth match. The date of birth only links the
// records here: each athlete is given an id that means nothing outside one
// result, so it cannot be reversed to a birthday (Rule 8 applies to staff
// screens too).

const identity = (p) => `${normalizeName(p.name)}|${p.dob || ''}`
const clubKey = (name) => normalizeName(name || '') || '—'
const MEDALS = ['gold', 'silver', 'bronze']

/**
 * Builds the analytics from each tournament's data:
 * [{ tournament, players, teams, matches, medals }], matches as the service
 * lists them (with akaPlayerId / aoPlayerId), medals as published.
 */
export function buildAnalytics(events) {
  const ids = new Map()
  const athleteKey = (p) => {
    const k = identity(p)
    if (!ids.has(k)) ids.set(k, `a${ids.size + 1}`)
    return ids.get(k)
  }
  const athletes = new Map()
  const clubs = new Map()
  const tournaments = []
  const sorted = [...events].sort((a, b) => String(a.tournament.startDate || a.tournament.date || '').localeCompare(String(b.tournament.startDate || b.tournament.date || '')))

  const clubOf = (name) => {
    const key = clubKey(name)
    if (!clubs.has(key)) clubs.set(key, { key, name: name || 'No club', tournaments: new Set(), entries: 0, gold: 0, silver: 0, bronze: 0, won: 0, lost: 0, history: [] })
    return clubs.get(key)
  }

  for (const { tournament, players, teams, matches, medals } of sorted) {
    const date = tournament.startDate || tournament.date || null
    const teamsById = new Map(teams.map((t) => [t.id, t]))
    const clubName = (p) => p.club || teamsById.get(p.teamId)?.club || teamsById.get(p.teamId)?.name || null
    const byPlayer = new Map(players.map((p) => [p.id, p]))
    const perClub = new Map()
    const entry = (club) => {
      if (!perClub.has(club.key)) perClub.set(club.key, { tournamentId: tournament.id, tournament: tournament.name, date, entries: 0, gold: 0, silver: 0, bronze: 0, won: 0, lost: 0 })
      return perClub.get(club.key)
    }

    for (const p of players) {
      if (['DRAFT', 'REJECTED'].includes(p.registrationStatus)) continue
      const key = athleteKey(p)
      if (!athletes.has(key)) athletes.set(key, { key, name: p.name, gender: p.gender || null, club: clubName(p), tournaments: new Set(), gold: 0, silver: 0, bronze: 0, won: 0, lost: 0, history: [] })
      const a = athletes.get(key)
      a.name = p.name
      a.club = clubName(p) || a.club
      a.tournaments.add(tournament.id)
      a.history.push({ tournamentId: tournament.id, tournament: tournament.name, date, club: clubName(p), medals: [], won: 0, lost: 0 })
      const club = clubOf(clubName(p))
      club.tournaments.add(tournament.id)
      club.entries += 1
      entry(club).entries += 1
    }

    const lastOf = (playerId) => {
      const p = byPlayer.get(playerId)
      return p ? athletes.get(athleteKey(p))?.history.at(-1) : null
    }
    for (const m of matches) {
      const outcome = boutOutcome(m)
      if (!outcome || !m.winner || m.winner === 'tie' || !m.akaPlayerId || !m.aoPlayerId) continue
      const [winner, loser] = m.winner === 'red' ? [m.akaPlayerId, m.aoPlayerId] : [m.aoPlayerId, m.akaPlayerId]
      for (const [id, won] of [[winner, true], [loser, false]]) {
        const p = byPlayer.get(id)
        if (!p) continue
        const a = athletes.get(athleteKey(p))
        const h = lastOf(id)
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
          lastOf(md.playerId)?.medals.push({ medal: md.medal, category: md.category })
        }
      }
    }
    for (const [key, row] of perClub) clubs.get(key).history.push(row)
    tournaments.push({
      id: tournament.id, name: tournament.name, date, status: tournament.lifecycleStatus || null,
      players: players.filter((p) => !['DRAFT', 'REJECTED'].includes(p.registrationStatus)).length,
      teams: teams.length, bouts: matches.filter((m) => boutOutcome(m)).length, medals: medalCount,
    })
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
