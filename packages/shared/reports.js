// PRD section 45: the eleven reports, as rows (header first). Shared so the
// browser's CSV/Excel export and the server's PDF are the same report.

export const REPORT_KEYS = ['registration', 'player', 'team', 'category', 'weigh-in', 'pool', 'match', 'result', 'final-result', 'medal', 'medal-tally', 'payment', 'attendance', 'club', 'audit']

export const REPORT_TITLE = {
  registration: 'Registration', player: 'Player', team: 'Team', category: 'Category', 'weigh-in': 'Weigh-in', pool: 'Pool',
  match: 'Match', result: 'Result', medal: 'Medal', payment: 'Payment', attendance: 'Attendance', club: 'Club',
  'final-result': 'Final result', 'medal-tally': 'Medal tally', audit: 'Audit',
}

// PRD v1 §19 "Player List — filters: gender, age group, category, club, district, state".
export const REPORT_FILTERS = ['gender', 'ageGroupId', 'divisionKey', 'club', 'district', 'state', 'event']

/** Narrows the players a report reads to the chosen filters. */
export function filterReportData(data, filters = {}) {
  const f = Object.fromEntries(Object.entries(filters || {}).filter(([k, v]) => REPORT_FILTERS.includes(k) && v))
  if (!Object.keys(f).length) return data
  const fold = (v) => String(v || '').trim().toLowerCase()
  const players = data.players.filter((p) => (!f.gender || p.gender === f.gender)
    && (!f.event || (p.events || []).includes(f.event))
    && (!f.ageGroupId || Object.values(p.entries || {}).some((e) => e.ageGroupId === f.ageGroupId))
    && (!f.divisionKey || Object.values(p.entries || {}).some((e) => e.divisionKey === f.divisionKey))
    && ['club', 'district', 'state'].every((k) => !f[k] || fold(p[k]) === fold(f[k])))
  const ids = new Set(players.map((p) => p.id))
  return {
    ...data,
    players,
    medals: data.medals.filter((m) => ids.has(m.playerId)),
    matches: f.divisionKey ? data.matches.filter((m) => m.divisionKey === f.divisionKey) : data.matches.filter((m) => !m.akaPlayerId || ids.has(m.akaPlayerId) || ids.has(m.aoPlayerId)),
    pools: f.divisionKey ? data.pools.filter((p) => p.divisionKey === f.divisionKey) : data.pools,
    divisions: f.divisionKey ? data.divisions.filter((d) => d.key === f.divisionKey) : data.divisions,
    results: f.divisionKey ? data.results.filter((d) => d.key === f.divisionKey) : data.results,
  }
}

/** Everything the reports read, from the tournament service. */
export async function loadReportData(tms, tournamentId, { audit = false } = {}) {
  const [players, teams, groups, weights, divisions, pools, matches, results, medals, auditRows] = await Promise.all([
    tms.listPlayers(tournamentId), tms.teams.list(tournamentId), tms.ageGroups.list(tournamentId), tms.weightCategories.list(tournamentId),
    tms.divisions(tournamentId), tms.listPools(tournamentId), tms.listMatches(tournamentId), tms.results(tournamentId), tms.listMedals(tournamentId),
    audit && tms.auditTrail ? tms.auditTrail(tournamentId) : [],
  ])
  return { players, teams, groups, weights, divisions, pools, matches, results, medals, audit: auditRows }
}

const tallyRows = (medals, by) => {
  const rows = new Map()
  for (const m of medals) {
    const key = m[by] || 'Unassigned'
    const row = rows.get(key) || { name: key, gold: 0, silver: 0, bronze: 0, total: 0 }
    if (m.medal in row) row[m.medal] += 1
    row.total += 1
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.name.localeCompare(b.name))
}

const list = (v) => (Array.isArray(v) ? v.join(', ') : v)

export function buildReport(key, allData, filters = {}) {
  const data = filterReportData(allData, filters)
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
    // PRD v1 §19 Pool: assignments and match results.
    case 'pool': {
      const standing = new Map()
      for (const d of data.results || []) for (const pool of d.pools || []) for (const r of pool.standings) standing.set(`${pool.poolId}|${r.id}`, r)
      return [['Category', 'Pool', 'Player', 'Team', 'Played', 'Won', 'Lost', 'Points', 'Rank', 'Qualified', 'Tie-break'],
        ...data.pools.flatMap((pool) => pool.playerIds.map((id) => {
          const r = standing.get(`${pool.id}|${id}`) || {}
          return [pool.label, pool.name, name(id), team(p.find((x) => x.id === id)?.teamId), r.played ?? '', r.wins ?? '', r.losses ?? '', r.points ?? '', r.rank ?? '', r.qualified ? 'Yes' : '', r.tieBreak || '']
        }))]
    }
    case 'match': return [['Match', 'Mat', 'Time', 'Category', 'Stage', 'AKA', 'AO', 'Status', 'Result', 'Finish reason', 'Winner', 'AKA score', 'AO score'],
      ...data.matches.map((m) => [m.matchNumber, m.mat, m.scheduledAt, m.categoryName, m.stage === 'knockout' || m.stage === 'master' ? m.roundName : `Pool ${m.poolName} R${m.round}`, m.akaName, m.aoName, m.status, m.resultType || '', m.result?.finishReason || '', m.winner === 'red' ? 'AKA' : m.winner === 'blue' ? 'AO' : m.winner, m.avgRed, m.avgBlue])]
    case 'result': return [['Category', 'Pool', 'Rank', 'Player', 'Club', 'Played', 'Won', 'Lost', 'Points', 'Qualified'],
      ...data.results.flatMap((d) => d.pools.flatMap((pool) => pool.standings.map((r) => [d.label, pool.pool, r.rank, r.name, r.club, r.played, r.wins, r.losses, r.points, r.qualified ? 'Yes' : ''])))]
    case 'medal': return [['Category', 'Event', 'Rank', 'Medal', 'Player', 'Team', 'Club', 'State'], ...data.medals.map((m) => [m.category, m.event, m.rank, m.medal, m.name, m.team, m.club, m.state])]
    // PRD v1 §19 Final result: rank, medal, result reason (and the bout that decided it).
    case 'final-result': return [['Category', 'Event', 'Status', 'Rank', 'Medal', 'Player', 'Club', 'Result reason', 'Decided in'],
      ...data.results.flatMap((d) => (d.medals || []).map((m) => [d.label, d.event, d.resultStatus || '', m.rank, m.medal, m.name, m.club || '', m.reason || (d.medalsOverridden ? `Set by hand: ${d.overrideReason}` : ''), data.matches.find((x) => x.id === m.sourceMatchId)?.matchNumber || '']))]
    // PRD v1 §19 Medal tally by club, district, state and country, from finalized results.
    case 'medal-tally': return [['Grouping', 'Name', 'Gold', 'Silver', 'Bronze', 'Total'],
      ...['club', 'district', 'state', 'country'].flatMap((by) => tallyRows(data.medals, by).map((r) => [by, r.name, r.gold, r.silver, r.bronze, r.total]))]
    // PRD v1 §19 Audit: who changed what and when.
    case 'audit': return [['When', 'User', 'Role', 'Action', 'Entity', 'Changes', 'Reason', 'IP'],
      ...(data.audit || []).map((a) => [a.at, a.actorId || '', a.actorRole || '', a.action, `${a.entity}${a.entityId ? ` ${a.entityId}` : ''}`,
        Object.entries(a.changes || {}).filter(([k]) => !['updatedAt', 'createdAt'].includes(k)).map(([k, c]) => `${k}: ${JSON.stringify(c.from ?? null)} → ${JSON.stringify(c.to ?? null)}`).join('; ').slice(0, 500), a.reason || '', a.ip || ''])]
    case 'payment': return [['Name', 'Team', 'Events', 'Amount', 'Status', 'Method', 'Transaction ID', 'Date', 'Receipt'],
      ...p.map((x) => [x.name, team(x.teamId), list(x.events), x.payment?.amount, x.payment?.status || 'PENDING', x.payment?.method, x.payment?.transactionId, x.payment?.date, x.payment?.receipt])]
    // PRD v1 §19 Attendance: called / checked-in.
    case 'attendance': {
      const sideOf = (m, id) => (m.akaPlayerId === id ? 'aka' : m.aoPlayerId === id ? 'ao' : null)
      return [['Name', 'Team', 'Approved', 'Weighed in', 'In draw', 'Bouts called', 'Checked in', 'Absent', 'Matches fought'],
        ...p.map((x) => {
          const mine = data.matches.filter((m) => sideOf(m, x.id))
          return [x.name, team(x.teamId), !['DRAFT', 'SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(x.registrationStatus) ? 'Yes' : 'No',
            x.weighIn?.status === 'PASSED' ? 'Yes' : x.events?.includes('kumite') ? 'No' : 'n/a', data.pools.some((pool) => pool.playerIds.includes(x.id)) ? 'Yes' : 'No',
            mine.filter((m) => m.calledAt).length, mine.filter((m) => m.attendance?.[sideOf(m, x.id)] === 'present').length, mine.filter((m) => m.attendance?.[sideOf(m, x.id)] === 'absent').length,
            mine.filter((m) => m.status === 'completed').length]
        })]
    }
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
