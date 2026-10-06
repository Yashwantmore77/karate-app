import { useEffect, useMemo, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Container, Box, Typography, Tabs, Tab, Paper, Grid, Stack, TextField, MenuItem, Alert, CircularProgress, Button,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Chip,
} from '@mui/material'
import { tms } from '../../data/tms'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import Bracket from '../../components/tms/Bracket'
import { StandingsTable, MedalList, TallyTable } from '../tms/ResultsTab'

const POLL_MS = 5000
const AKA = '#FF5B5B'
const AO = '#5B7BFF'

const SECTIONS = ['info', 'categories', 'teams', 'players', 'draw', 'live', 'results', 'medals']
const LABEL = { info: 'Tournament', categories: 'Categories', teams: 'Teams', players: 'Players', draw: 'Draw', live: 'Live matches', results: 'Results', medals: 'Medal tally' }

/**
 * PRD sections 38-41 and 54: the public tournament page. Reads only the public
 * API, which strips everything Rule 8 forbids; refreshes itself so live scores
 * and results arrive without a reload.
 */
export default function PublicTournament() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('info')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [by, setBy] = useState('club')

  useEffect(() => {
    let alive = true
    const load = () => tms.public.view(slug).then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => alive && setError(e))
    load()
    const timer = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [slug])

  const query = q.trim().toLowerCase()
  const matchesQuery = (...parts) => !query || parts.join(' ').toLowerCase().includes(query)
  const teamName = useMemo(() => Object.fromEntries((data?.teams || []).map((t) => [t.id, t.name])), [data])

  if (error) return <Container sx={{ py: 6 }}><Alert severity="error">This tournament is not available.</Alert></Container>
  if (!data) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>

  const t = data.tournament
  const live = data.matches.filter((m) => ['live', 'open'].includes(m.status))
  const upcoming = data.matches.filter((m) => !['live', 'open', 'completed'].includes(m.status))
  const done = data.matches.filter((m) => m.status === 'completed')
  const inCategory = (key) => !category || key === category

  const MatchRow = ({ m }) => (
    <TableRow>
      <TableCell>{m.matchNumber}</TableCell>
      <TableCell>{m.mat ? `Mat ${m.mat}` : '—'}</TableCell>
      <TableCell>{m.category}<Typography variant="body2" color="text.secondary">{m.stage === 'knockout' ? m.roundName : `Pool ${m.pool} · R${m.round}`}</Typography></TableCell>
      <TableCell sx={{ fontWeight: m.winner === 'red' ? 700 : 400 }}><Box component="span" sx={{ color: AKA }}>■</Box> {m.aka || 'TBD'}</TableCell>
      <TableCell align="center">{m.status === 'completed' ? `${m.akaScore ?? 0} – ${m.aoScore ?? 0}` : 'vs'}</TableCell>
      <TableCell sx={{ fontWeight: m.winner === 'blue' ? 700 : 400 }}><Box component="span" sx={{ color: AO }}>■</Box> {m.ao || 'TBD'}</TableCell>
      <TableCell><StatusBadge status={m.status} /></TableCell>
    </TableRow>
  )

  const MatchTable = ({ rows, empty }) => (
    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead><TableRow><TableCell>Match</TableCell><TableCell>Mat</TableCell><TableCell>Category</TableCell><TableCell>AKA</TableCell><TableCell /><TableCell>AO</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
        <TableBody>
          {rows.map((m) => <MatchRow key={m.id} m={m} />)}
          {!rows.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary">{empty}</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const filters = (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField size="small" label="Search player, team, match" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 240 }} />
      <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 240 }}>
        <MenuItem value="">All categories</MenuItem>
        {data.categories.map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
      </TextField>
    </Stack>
  )

  return (
    <Box sx={{ minHeight: '100vh', pb: 6 }}>
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          {t.logoUrl && <Box component="img" src={t.logoUrl} alt="" sx={{ height: 56, borderRadius: 1 }} />}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h1">{t.name}</Typography>
            <Typography color="text.secondary">{[t.venue || t.location, t.city, t.state, t.startDate || t.date].filter(Boolean).join(' · ')}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <StatusBadge status={t.lifecycleStatus} />
          {live.length > 0 && <Chip color="error" size="small" label={`● ${live.length} live`} />}
          <Button size="small" component={RouterLink} to="/tournaments">All tournaments</Button>
        </Stack>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 3 }}>
          {SECTIONS.map((s) => <Tab key={s} value={s} label={LABEL[s]} />)}
        </Tabs>

        {tab === 'info' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper sx={{ p: 2 }}>
                {t.description && <Typography sx={{ mb: 2, whiteSpace: 'pre-line' }}>{t.description}</Typography>}
                {[['Type', t.type ? humanize(t.type).replace('kata kumite', 'Kata + Kumite') : null], ['Organizer', t.organizer], ['Association', t.association], ['Venue', t.venue || t.location],
                  ['Dates', [t.startDate, t.endDate].filter(Boolean).join(' – ') || t.date]].filter(([, v]) => v).map(([k, v]) => (
                  <Typography key={k}><b>{k}:</b> {v}</Typography>
                ))}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography><b>{data.categories.length}</b> categories</Typography>
                <Typography><b>{data.teams.length}</b> teams</Typography>
                <Typography><b>{data.players.length}</b> players</Typography>
                <Typography><b>{done.length}</b> / {data.matches.length} matches completed</Typography>
              </Paper>
            </Grid>
          </Grid>
        )}

        {tab === 'categories' && (
          <Grid container spacing={2}>
            {data.categories.map((c) => (
              <Grid key={c.key} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper sx={{ p: 2 }}><Typography variant="h4">{c.label}</Typography><Typography color="text.secondary">{c.count} players</Typography></Paper>
              </Grid>
            ))}
            {!data.categories.length && <Grid size={{ xs: 12 }}><Typography color="text.secondary">Categories appear once registrations are approved.</Typography></Grid>}
          </Grid>
        )}

        {tab === 'teams' && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Team</TableCell><TableCell>Club</TableCell><TableCell>State</TableCell><TableCell>Country</TableCell><TableCell align="right">Players</TableCell></TableRow></TableHead>
              <TableBody>
                {data.teams.map((tm) => (
                  <TableRow key={tm.id}><TableCell>{tm.name}</TableCell><TableCell>{tm.club || '—'}</TableCell><TableCell>{tm.state || '—'}</TableCell><TableCell>{tm.country || '—'}</TableCell>
                    <TableCell align="right">{data.players.filter((p) => p.teamId === tm.id).length}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === 'players' && (
          <>
            {filters}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Player</TableCell><TableCell>Team</TableCell><TableCell>Club</TableCell><TableCell>State</TableCell><TableCell>Categories</TableCell></TableRow></TableHead>
                <TableBody>
                  {data.players.filter((p) => matchesQuery(p.name, p.id, teamName[p.teamId], p.club) && (!category || p.categories.includes(data.categories.find((c) => c.key === category)?.label))).map((p) => (
                    <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell>{teamName[p.teamId] || '—'}</TableCell><TableCell>{p.club || '—'}</TableCell><TableCell>{p.state || '—'}</TableCell><TableCell>{p.categories.join(', ')}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {tab === 'draw' && (
          <>
            {!data.pools.length && <Alert severity="info">The draw has not been published yet.</Alert>}
            {filters}
            {data.categories.filter((c) => inCategory(c.key) && data.pools.some((p) => p.divisionKey === c.key)).map((c) => (
              <Paper key={c.key} sx={{ p: 2, mb: 2 }}>
                <Typography variant="h3" gutterBottom>{c.label}</Typography>
                <Grid container spacing={2}>
                  {data.pools.filter((p) => p.divisionKey === c.key).map((pool) => (
                    <Grid key={pool.id} size={{ xs: 12, sm: 6, md: 3 }}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="h4">Pool {pool.name}</Typography>
                        {pool.players.filter((p) => matchesQuery(p.name)).map((p) => <Typography key={p.id} variant="body2">{p.name}</Typography>)}
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            ))}
          </>
        )}

        {tab === 'live' && (
          <Stack spacing={3}>
            {live.length > 0 && (
              <Grid container spacing={2}>
                {live.map((m) => (
                  <Grid key={m.id} size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography color="text.secondary">MAT {m.mat} · {m.matchNumber} · {m.category}</Typography>
                      <Typography variant="h2" sx={{ color: AKA, mt: 1 }}>AKA {m.aka}</Typography>
                      <Typography color="text.secondary">vs</Typography>
                      <Typography variant="h2" sx={{ color: AO }}>AO {m.ao}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
            {filters}
            <Typography variant="h3">Up next</Typography>
            <MatchTable rows={upcoming.filter((m) => inCategory(m.divisionKey) && matchesQuery(m.matchNumber, m.aka, m.ao, m.category)).slice(0, 50)} empty="No upcoming matches." />
            <Typography variant="h3">Completed</Typography>
            <MatchTable rows={done.filter((m) => inCategory(m.divisionKey) && matchesQuery(m.matchNumber, m.aka, m.ao, m.category)).slice(-50).reverse()} empty="No completed matches yet." />
          </Stack>
        )}

        {tab === 'results' && (
          <>
            {!t.resultsPublished && <Alert severity="info">Results will appear here once they are published.</Alert>}
            {data.results.length > 0 && filters}
            {data.results.filter((d) => inCategory(d.key)).map((d) => (
              <Paper key={d.key} sx={{ p: 2, mb: 2 }}>
                <Typography variant="h3" gutterBottom>{d.label}</Typography>
                <MedalList medals={d.medals} />
                {d.bracket && <Box sx={{ mt: 2 }}><Bracket rounds={d.bracket.rounds} /></Box>}
                {d.pools.map((p) => (
                  <Box key={p.pool} sx={{ mt: 2 }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>Pool {p.pool}</Typography>
                    <StandingsTable standings={p.standings} />
                  </Box>
                ))}
              </Paper>
            ))}
          </>
        )}

        {tab === 'medals' && (
          <Paper sx={{ p: 2 }}>
            {!data.tally && <Alert severity="info">The medal tally appears once results are published.</Alert>}
            {data.tally && (
              <>
                <TextField select size="small" value={by} onChange={(e) => setBy(e.target.value)} sx={{ mb: 2 }}>
                  {['club', 'district', 'state', 'country'].map((k) => <MenuItem key={k} value={k}>By {k}</MenuItem>)}
                </TextField>
                <TallyTable rows={data.tally[by]} />
              </>
            )}
          </Paper>
        )}
      </Container>
    </Box>
  )
}
