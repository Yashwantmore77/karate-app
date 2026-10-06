import { useEffect, useState } from 'react'
import { Stack, Paper, Typography, Button, Grid, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Alert, TextField, MenuItem, Box } from '@mui/material'
import { tms } from '../../data/tms'
import StatusBadge from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import Bracket from '../../components/tms/Bracket'

export const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' }

export function StandingsTable({ standings }) {
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Rank</TableCell><TableCell>Player</TableCell><TableCell>Club</TableCell><TableCell align="right">Played</TableCell>
            <TableCell align="right">Won</TableCell><TableCell align="right">Lost</TableCell><TableCell align="right">Score</TableCell>
            <TableCell align="right">Points</TableCell><TableCell>Qualified</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {standings.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.rank}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.club || r.team || '—'}</TableCell>
              <TableCell align="right">{r.played}</TableCell>
              <TableCell align="right">{r.wins}</TableCell>
              <TableCell align="right">{r.losses}</TableCell>
              <TableCell align="right">{r.scoreFor}:{r.scoreAgainst}</TableCell>
              <TableCell align="right">{r.points}</TableCell>
              <TableCell>{r.qualified ? '✓ Yes' : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export function MedalList({ medals }) {
  if (!medals?.length) return <Typography color="text.secondary">Medals appear once the category is decided.</Typography>
  return (
    <Stack spacing={0.5}>
      {medals.map((m, i) => (
        <Typography key={`${m.id}-${i}`}>{MEDAL_ICON[m.medal]} <b>{m.medal.toUpperCase()}</b> — {m.name}{m.club ? ` (${m.club})` : ''}</Typography>
      ))}
    </Stack>
  )
}

export function TallyTable({ rows }) {
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead><TableRow><TableCell>#</TableCell><TableCell>Name</TableCell><TableCell align="right">🥇 Gold</TableCell><TableCell align="right">🥈 Silver</TableCell><TableCell align="right">🥉 Bronze</TableCell><TableCell align="right">Total</TableCell></TableRow></TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.name}><TableCell>{i + 1}</TableCell><TableCell>{r.name}</TableCell><TableCell align="right">{r.gold}</TableCell><TableCell align="right">{r.silver}</TableCell><TableCell align="right">{r.bronze}</TableCell><TableCell align="right"><b>{r.total}</b></TableCell></TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary">No medals published yet.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

/** Sections 34-36 and 42-43. */
export default function ResultsTab({ tournament, reload, version, action }) {
  const tid = tournament.id
  const [results, setResults] = useState([])
  const [tally, setTally] = useState([])
  const [by, setBy] = useState('club')
  const [confirm, setConfirm] = useState(null)

  const load = () => Promise.all([tms.results(tid), tms.tally(tid, by)]).then(([r, t]) => { setResults(r); setTally(t) })
  useEffect(() => { load() }, [tid, version, by])

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h3">Publish results</Typography>
            <Typography variant="body2" color="text.secondary">Publishing freezes the medal list, shows results on the public page and notifies teams.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <StatusBadge status={tournament.resultsPublished ? 'COMPLETED' : 'DRAFT'} label={tournament.resultsPublished ? 'Published' : 'Not published'} />
            <Button size="large" variant="contained" onClick={() => setConfirm({
              title: tournament.resultsPublished ? 'Re-publish results?' : 'Publish results?', message: 'The medal list is recalculated from the current match results.',
              run: () => action.run(() => tms.publishResults(tid, true), (r) => `Published: ${r.medals} medals`).then(reload),
            })}>{tournament.resultsPublished ? 'Re-publish' : 'Publish results'}</Button>
            {tournament.resultsPublished && <Button onClick={() => action.run(() => tms.publishResults(tid, false), 'Results hidden').then(reload)}>Unpublish</Button>}
          </Stack>
        </Stack>
      </Paper>

      {!results.length && <Alert severity="info">No categories with matches yet.</Alert>}
      {results.map((d) => (
        <Paper key={d.key} sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', mb: 1 }} spacing={1}>
            <Typography variant="h3">{d.label}</Typography>
            {d.canGenerateBracket && (
              <Button variant="contained" onClick={() => setConfirm({
                title: 'Generate the final stage?', message: `Top ${tournament.settings?.qualifiersPerPool ?? 2} from each pool go into a knockout bracket.`,
                run: () => action.run(() => tms.generateBracket(tid, d.key), 'Bracket generated').then(load),
              })}>Generate final stage</Button>
            )}
          </Stack>
          <Grid container spacing={2}>
            {d.pools.map((p) => (
              <Grid key={p.poolId} size={{ xs: 12, lg: d.pools.length > 1 ? 6 : 12 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>Pool {p.pool} {p.complete ? '· complete' : `· ${p.bouts} matches`}</Typography>
                <StandingsTable standings={p.standings} />
              </Grid>
            ))}
            {d.bracket && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>Final stage</Typography>
                <Bracket rounds={d.bracket.rounds} />
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <Typography variant="h4" sx={{ mb: 1 }}>Medals</Typography>
              <MedalList medals={d.medals} />
            </Grid>
          </Grid>
        </Paper>
      ))}

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h3">Medal tally</Typography>
          <TextField select size="small" value={by} onChange={(e) => setBy(e.target.value)}>
            {['club', 'district', 'state', 'country'].map((k) => <MenuItem key={k} value={k}>By {k}</MenuItem>)}
          </TextField>
        </Stack>
        <TallyTable rows={tally} />
      </Paper>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c.run() }} />
    </Stack>
  )
}
