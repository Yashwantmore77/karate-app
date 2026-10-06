import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Button, Stack } from '@mui/material'
import { Download, Print } from '@mui/icons-material'
import { tms } from '../../data/tms'
import { downloadCsv } from '../../components/tms/download'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Prints a report as a plain table; the browser's "Save as PDF" makes the PDF. */
function printTable(title, rows) {
  const w = window.open('', '_blank')
  if (!w) return
  const [head, ...body] = rows
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:16px}table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}</style></head><body>
    <h2>${esc(title)}</h2><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(Array.isArray(c) ? c.join(', ') : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

/** Section 45: every report as CSV (opens in Excel) or printable PDF. */
export default function ReportsTab({ tournament, version }) {
  const tid = tournament.id
  const [data, setData] = useState(null)

  useEffect(() => {
    Promise.all([
      tms.players.list(tid), tms.teams.list(tid), tms.ageGroups.list(tid), tms.weightCategories.list(tid),
      tms.divisions(tid), tms.pools(tid), tms.matches(tid), tms.results(tid), tms.medals(tid),
    ]).then(([players, teams, groups, weights, divisions, pools, matches, results, medals]) =>
      setData({ players, teams, groups, weights, divisions, pools, matches, results, medals }))
  }, [tid, version])

  if (!data) return null
  const team = (id) => data.teams.find((t) => t.id === id)?.name || ''
  const group = (id) => data.groups.find((g) => g.id === id)?.name || ''
  const weight = (id) => { const w = data.weights.find((x) => x.id === id); return w ? (w.label || w.name) : '' }
  const name = (id) => data.players.find((p) => p.id === id)?.name || ''

  const REPORTS = {
    Registration: () => [['Player ID', 'Name', 'Team', 'Events', 'Status', 'Rejection reason', 'Registered on'],
      ...data.players.map((p) => [p.playerNumber, p.name, team(p.teamId), p.events, p.registrationStatus, p.rejectionReason || '', p.createdAt?.slice(0, 10)])],
    Player: () => [['Player ID', 'Name', 'Gender', 'DOB', 'Age', 'Weight', 'Team', 'Club', 'District', 'State', 'Country', 'Belt', 'Federation ID', 'Events', 'Kata category', 'Kumite category'],
      ...data.players.map((p) => [p.playerNumber, p.name, p.gender, p.dob, p.age, p.weight, team(p.teamId), p.club, p.district, p.state, p.country, p.belt, p.federationId, p.events,
        p.entries?.kata ? group(p.entries.kata.ageGroupId) : '', p.entries?.kumite ? `${group(p.entries.kumite.ageGroupId)} ${weight(p.entries.kumite.weightCategoryId)}` : ''])],
    Team: () => [['Team', 'Club', 'Code', 'Coach', 'Contact', 'Mobile', 'Email', 'District', 'State', 'Country', 'Players'],
      ...data.teams.map((t) => [t.name, t.club, t.code, t.coachName, t.contactPerson, t.mobile, t.email, t.district, t.state, t.country, data.players.filter((p) => p.teamId === t.id).length])],
    Category: () => [['Category', 'Event', 'Players', 'Pools'], ...data.divisions.map((d) => [d.label, d.event, d.count, d.pools])],
    'Weigh-in': () => [['Name', 'Team', 'Registered kg', 'Actual kg', 'Category', 'Status', 'Officer', 'Time', 'Notes'],
      ...data.players.filter((p) => p.events?.includes('kumite')).map((p) => [p.name, team(p.teamId), p.weighIn?.registeredWeight, p.weighIn?.actualWeight, weight(p.entries?.kumite?.weightCategoryId), p.weighIn?.status || 'PENDING', p.weighIn?.officerId, p.weighIn?.at, p.weighIn?.notes])],
    Pool: () => [['Category', 'Pool', 'Player', 'Team'], ...data.pools.flatMap((pool) => pool.playerIds.map((id) => [pool.label, pool.name, name(id), team(data.players.find((p) => p.id === id)?.teamId)]))],
    Match: () => [['Match', 'Mat', 'Time', 'Category', 'Stage', 'AKA', 'AO', 'Status', 'Winner', 'AKA score', 'AO score'],
      ...data.matches.map((m) => [m.matchNumber, m.mat, m.scheduledAt, m.categoryName, m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName} R${m.round}`, m.akaName, m.aoName, m.status, m.winner === 'red' ? 'AKA' : m.winner === 'blue' ? 'AO' : m.winner, m.avgRed, m.avgBlue])],
    Result: () => [['Category', 'Pool', 'Rank', 'Player', 'Club', 'Played', 'Won', 'Lost', 'Points', 'Qualified'],
      ...data.results.flatMap((d) => d.pools.flatMap((p) => p.standings.map((r) => [d.label, p.pool, r.rank, r.name, r.club, r.played, r.wins, r.losses, r.points, r.qualified ? 'Yes' : ''])))],
    Medal: () => [['Category', 'Event', 'Rank', 'Medal', 'Player', 'Team', 'Club', 'State'], ...data.medals.map((m) => [m.category, m.event, m.rank, m.medal, m.name, m.team, m.club, m.state])],
    Payment: () => [['Name', 'Team', 'Events', 'Amount', 'Status', 'Method', 'Transaction ID', 'Date', 'Receipt'],
      ...data.players.map((p) => [p.name, team(p.teamId), p.events, p.payment?.amount, p.payment?.status || 'PENDING', p.payment?.method, p.payment?.transactionId, p.payment?.date, p.payment?.receipt])],
    Attendance: () => [['Name', 'Team', 'Approved', 'Weighed in', 'In draw', 'Matches fought'],
      ...data.players.map((p) => [p.name, team(p.teamId), !['DRAFT', 'SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(p.registrationStatus) ? 'Yes' : 'No',
        p.weighIn?.status === 'PASSED' ? 'Yes' : p.events?.includes('kumite') ? 'No' : 'n/a', data.pools.some((pool) => pool.playerIds.includes(p.id)) ? 'Yes' : 'No',
        data.matches.filter((m) => (m.akaPlayerId === p.id || m.aoPlayerId === p.id) && m.status === 'completed').length])],
  }

  const slug = tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return (
    <Grid container spacing={2}>
      {Object.entries(REPORTS).map(([title, build]) => (
        <Grid key={title} size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h3" gutterBottom>{title} report</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{build().length - 1} rows</Typography>
            <Stack direction="row" spacing={1}>
              <Button startIcon={<Download />} variant="contained" onClick={() => downloadCsv(`${slug}-${title.toLowerCase()}.csv`, build())}>Excel / CSV</Button>
              <Button startIcon={<Print />} variant="outlined" onClick={() => printTable(`${tournament.name} — ${title} report`, build())}>PDF</Button>
            </Stack>
          </Paper>
        </Grid>
      ))}
    </Grid>
  )
}
