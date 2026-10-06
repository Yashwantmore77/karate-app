// PRD section 45: the eleven reports, as rows (header first). Shared so the
// browser's CSV/Excel export and the server's PDF are the same report.

export const REPORT_KEYS = ['registration', 'player', 'team', 'category', 'weigh-in', 'pool', 'match', 'result', 'medal', 'payment', 'attendance', 'club']

export const REPORT_TITLE = {
  registration: 'Registration', player: 'Player', team: 'Team', category: 'Category', 'weigh-in': 'Weigh-in', pool: 'Pool',
  match: 'Match', result: 'Result', medal: 'Medal', payment: 'Payment', attendance: 'Attendance', club: 'Club',
}

/** Everything the reports read, from the tournament service. */
export async function loadReportData(tms, tournamentId) {
  const [players, teams, groups, weights, divisions, pools, matches, results, medals] = await Promise.all([
    tms.listPlayers(tournamentId), tms.teams.list(tournamentId), tms.ageGroups.list(tournamentId), tms.weightCategories.list(tournamentId),
    tms.divisions(tournamentId), tms.listPools(tournamentId), tms.listMatches(tournamentId), tms.results(tournamentId), tms.listMedals(tournamentId),
  ])
  return { players, teams, groups, weights, divisions, pools, matches, results, medals }
}

const list = (v) => (Array.isArray(v) ? v.join(', ') : v)

export function buildReport(key, data) {
  const team = (id) => data.teams.find((t) => t.id === id)?.name || ''
  const group = (id) => data.groups.find((g) => g.id === id)?.name || ''
  const weight = (id) => { const w = data.weights.find((x) => x.id === id); return w ? (w.label || w.name) : '' }
  const name = (id) => data.players.find((p) => p.id === id)?.name || ''
  const p = data.players

  switch (key) {
    case 'registration': return [['Player ID', 'Name', 'Team', 'Events', 'Status', 'Rejection reason', 'Registered on'],
      ...p.map((x) => [x.playerNumber, x.name, team(x.teamId), list(x.events), x.registrationStatus, x.rejectionReason || '', x.createdAt?.slice(0, 10)])]
    case 'player': return [['Player ID', 'Name', 'Gender', 'DOB', 'Age', 'Weight', 'Team', 'Club', 'District', 'State', 'Country', 'Belt', 'Federation ID', 'Events', 'Kata category', 'Kumite category'],
      ...p.map((x) => [x.playerNumber, x.name, x.gender, x.dob, x.age, x.weight, team(x.teamId), x.club, x.district, x.state, x.country, x.belt, x.federationId, list(x.events),
        x.entries?.kata ? group(x.entries.kata.ageGroupId) : '', x.entries?.kumite ? `${group(x.entries.kumite.ageGroupId)} ${weight(x.entries.kumite.weightCategoryId)}` : ''])]
    case 'team': return [['Team', 'Club', 'Code', 'Coach', 'Contact', 'Mobile', 'Email', 'District', 'State', 'Country', 'Players'],
      ...data.teams.map((t) => [t.name, t.club, t.code, t.coachName, t.contactPerson, t.mobile, t.email, t.district, t.state, t.country, p.filter((x) => x.teamId === t.id).length])]
    case 'category': return [['Category', 'Event', 'Players', 'Pools'], ...data.divisions.map((d) => [d.label, d.event, d.count, d.pools])]
    case 'weigh-in': return [['Name', 'Team', 'Registered kg', 'Actual kg', 'Category', 'Status', 'Officer', 'Time', 'Notes'],
      ...p.filter((x) => x.events?.includes('kumite')).map((x) => [x.name, team(x.teamId), x.weighIn?.registeredWeight, x.weighIn?.actualWeight, weight(x.entries?.kumite?.weightCategoryId), x.weighIn?.status || 'PENDING', x.weighIn?.officerId, x.weighIn?.at, x.weighIn?.notes])]
    case 'pool': return [['Category', 'Pool', 'Player', 'Team'], ...data.pools.flatMap((pool) => pool.playerIds.map((id) => [pool.label, pool.name, name(id), team(p.find((x) => x.id === id)?.teamId)]))]
    case 'match': return [['Match', 'Mat', 'Time', 'Category', 'Stage', 'AKA', 'AO', 'Status', 'Result', 'Winner', 'AKA score', 'AO score'],
      ...data.matches.map((m) => [m.matchNumber, m.mat, m.scheduledAt, m.categoryName, m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName} R${m.round}`, m.akaName, m.aoName, m.status, m.resultType || '', m.winner === 'red' ? 'AKA' : m.winner === 'blue' ? 'AO' : m.winner, m.avgRed, m.avgBlue])]
    case 'result': return [['Category', 'Pool', 'Rank', 'Player', 'Club', 'Played', 'Won', 'Lost', 'Points', 'Qualified'],
      ...data.results.flatMap((d) => d.pools.flatMap((pool) => pool.standings.map((r) => [d.label, pool.pool, r.rank, r.name, r.club, r.played, r.wins, r.losses, r.points, r.qualified ? 'Yes' : ''])))]
    case 'medal': return [['Category', 'Event', 'Rank', 'Medal', 'Player', 'Team', 'Club', 'State'], ...data.medals.map((m) => [m.category, m.event, m.rank, m.medal, m.name, m.team, m.club, m.state])]
    case 'payment': return [['Name', 'Team', 'Events', 'Amount', 'Status', 'Method', 'Transaction ID', 'Date', 'Receipt'],
      ...p.map((x) => [x.name, team(x.teamId), list(x.events), x.payment?.amount, x.payment?.status || 'PENDING', x.payment?.method, x.payment?.transactionId, x.payment?.date, x.payment?.receipt])]
    case 'attendance': return [['Name', 'Team', 'Approved', 'Weighed in', 'In draw', 'Matches fought'],
      ...p.map((x) => [x.name, team(x.teamId), !['DRAFT', 'SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(x.registrationStatus) ? 'Yes' : 'No',
        x.weighIn?.status === 'PASSED' ? 'Yes' : x.events?.includes('kumite') ? 'No' : 'n/a', data.pools.some((pool) => pool.playerIds.includes(x.id)) ? 'Yes' : 'No',
        data.matches.filter((m) => (m.akaPlayerId === x.id || m.aoPlayerId === x.id) && m.status === 'completed').length])]
    // PRD point 27: per club, how many entered Kata, Kumite and both, and what they won.
    case 'club': {
      const clubOf = (x) => x.club || data.teams.find((t) => t.id === x.teamId)?.club || team(x.teamId) || '—'
      const rows = new Map()
      for (const x of p) {
        const key = clubOf(x)
        const row = rows.get(key) || { club: key, teams: new Set(), district: x.district || '', state: x.state || '', players: 0, kata: 0, kumite: 0, both: 0, gold: 0, silver: 0, bronze: 0 }
        if (x.teamId) row.teams.add(team(x.teamId))
        row.players += 1
        const ev = x.events || []
        if (ev.includes('kata')) row.kata += 1
        if (ev.includes('kumite')) row.kumite += 1
        if (ev.includes('kata') && ev.includes('kumite')) row.both += 1
        rows.set(key, row)
      }
      for (const m of data.medals) {
        const x = p.find((y) => y.id === (m.playerId || m.id))
        const row = x && rows.get(clubOf(x))
        if (row && row[m.medal] !== undefined) row[m.medal] += 1
      }
      return [['Club', 'Teams', 'District', 'State', 'Players', 'Kata', 'Kumite', 'Both', 'Gold', 'Silver', 'Bronze'],
        ...[...rows.values()].sort((a, b) => b.players - a.players || a.club.localeCompare(b.club))
          .map((r) => [r.club, [...r.teams].filter(Boolean).join(', '), r.district, r.state, r.players, r.kata, r.kumite, r.both, r.gold, r.silver, r.bronze])]
    }
    default: return null
  }
}
