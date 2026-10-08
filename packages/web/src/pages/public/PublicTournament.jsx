import { useEffect, useMemo, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Container, Box, Typography, Tabs, Tab, Paper, Grid, Stack, TextField, MenuItem, Alert, Button,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Chip,
} from '@mui/material'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import Bracket from '../../components/tms/Bracket'
import KataRoundTable from '../../components/tms/KataRoundTable'
import { StandingsTable, MedalList, TallyTable } from '../tms/ResultsTab'
import { PageLoader } from '../../components/Loader'

const AKA = '#FF5B5B'
const AO = '#5B7BFF'

const SECTIONS = ['info', 'categories', 'teams', 'players', 'draw', 'live', 'results', 'medals', 'certificates']
const LABEL = { info: 'Tournament', categories: 'Categories', teams: 'Teams', players: 'Players', draw: 'Draw', live: 'Live matches', results: 'Results', medals: 'Medal tally', certificates: 'Certificates' }
const FEE_LABEL = { kata: 'Kata', kumite: 'Kumite', both: 'Kata + Kumite', team: 'Team' }

/** PRD v1 §17: a player finds their certificate by name and downloads it. */
function PublicCertificates({ tournament }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const search = () => q.trim().length >= 2 && tms.public.certificates(tournament.slug || tournament.id, q.trim()).then(setRows).catch(() => setRows([]))
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField size="small" fullWidth label="Your name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <Button variant="contained" onClick={search} disabled={q.trim().length < 2}>Find</Button>
      </Stack>
      {rows && !rows.length && <Typography color="text.secondary">No certificate found for that name.</Typography>}
      {rows?.map((c) => (
        <Stack key={c.certificateId} direction="row" spacing={2} sx={{ alignItems: 'center', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ flex: 1 }}>
            <Typography><b>{c.name}</b>{c.club ? ` · ${c.club}` : ''}</Typography>
            <Typography variant="body2" color="text.secondary">{[c.medal && c.medal.toUpperCase(), c.category, c.award, c.certificateId].filter(Boolean).join(' · ')}</Typography>
          </Box>
          <Button size="small" variant="outlined" href={tms.public.certificatePdfUrl(tournament.slug || tournament.id, c.certificateId)}>Download</Button>
          <Button size="small" component={RouterLink} to={`/verify/${encodeURIComponent(c.certificateId)}`}>Verify</Button>
        </Stack>
      ))}
    </Paper>
  )
}

/**
 * PRD sections 38-41 and 54: the public tournament page. Reads only the public
 * API, which strips everything Rule 8 forbids; updates itself when the server
 * announces a change, so live scores and results arrive without a reload.
 */
export default function PublicTournament() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('info')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [district, setDistrict] = useState('')
  const [by, setBy] = useState('club')

  useEffect(() => {
    let alive = true
    const load = () => tms.public.view(slug).then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => alive && setError(e))
    load()
    // Pushed by the server when anything changes (PRD section 57).
    const stop = watchPublicChanges(load)
    return () => { alive = false; stop() }
  }, [slug])

  const query = q.trim().toLowerCase()
  const matchesQuery = (...parts) => !query || parts.join(' ').toLowerCase().includes(query)
  const teamName = useMemo(() => Object.fromEntries((data?.teams || []).map((t) => [t.id, t.name])), [data])

  if (error) return <Container sx={{ py: 6 }}><Alert severity="error">This tournament is not available.</Alert></Container>
  if (!data) return <PageLoader label="Loading tournament…" />

  const t = data.tournament
  const live = data.matches.filter((m) => ['live', 'open', 'paused'].includes(m.status))
  const upcoming = data.matches.filter((m) => !['live', 'open', 'paused', 'completed', 'cancelled'].includes(m.status))
  const done = data.matches.filter((m) => m.status === 'completed')
  const inCategory = (key) => !category || key === category
  const teamDistrict = Object.fromEntries(data.teams.map((tm) => [tm.id, tm.district]))
  const districtOf = (p) => p.district || teamDistrict[p.teamId] || ''
  const districts = [...new Set([...data.players.map(districtOf), ...data.teams.map((tm) => tm.district)].filter(Boolean))].sort()
  const inDistrict = (value) => !district || value === district

  const MatchRow = ({ m }) => (
    <TableRow>
      <TableCell>{m.matchNumber}</TableCell>
      <TableCell>{m.mat ? `Mat ${m.mat}` : '—'}</TableCell>
      <TableCell>{m.category}<Typography variant="body2" color="text.secondary">{m.stage === 'knockout' ? m.roundName : `Pool ${m.pool} · R${m.round}`}</Typography></TableCell>
      <TableCell sx={{ fontWeight: m.winner === 'red' ? 700 : 400 }}><Box component="span" sx={{ color: AKA }}>■</Box> {m.aka || 'TBD'}</TableCell>
      <TableCell align="center">{m.status === 'completed' ? `${m.akaScore ?? 0} – ${m.aoScore ?? 0}` : 'vs'}</TableCell>
      <TableCell sx={{ fontWeight: m.winner === 'blue' ? 700 : 400 }}><Box component="span" sx={{ color: AO }}>■</Box> {m.ao || 'TBD'}</TableCell>
      <TableCell><StatusBadge status={m.resultType && m.resultType !== 'COMPLETED' ? m.resultType : m.status} /></TableCell>
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
      {/* PRD point 26: find players and teams by district. */}
      {districts.length > 0 && (
        <TextField select size="small" label="District" value={district} onChange={(e) => setDistrict(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All districts</MenuItem>
          {districts.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
      )}
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
          {/* Kata and Kumite take turns on the mats. */}
          {!['kata', 'kumite'].includes(t.type) && ['READY', 'LIVE'].includes(t.lifecycleStatus) && t.runningEvent && <Chip color="secondary" size="small" label={`On the mats: ${t.runningEvent === 'kata' ? 'Kata' : 'Kumite'}`} />}
          <Button size="small" component={RouterLink} to="/tournaments">All tournaments</Button>
          <Button size="small" component={RouterLink} to={`/live?t=${encodeURIComponent(t.slug || t.id)}`}>Live board</Button>
        </Stack>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 3 }}>
          {SECTIONS.filter((s) => s !== 'certificates' || t.publicCertificates).map((s) => <Tab key={s} value={s} label={LABEL[s]} />)}
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
              {[['Rules', t.rules], ['Terms & conditions', t.terms]].filter(([, v]) => v).map(([k, v]) => (
                <Paper key={k} sx={{ p: 2, mt: 2 }}>
                  <Typography variant="h4" gutterBottom>{k}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{v}</Typography>
                </Paper>
              ))}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {/* PRD v1 §17: registration information. */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h4" gutterBottom>Registration</Typography>
                <Chip size="small" color={t.registrationOpen ? 'success' : 'default'} label={t.registrationOpen ? 'Open' : 'Closed'} sx={{ mb: 1 }} />
                {[['Opens', t.registrationStart], ['Closes', t.registrationClose], ['Weigh-in', t.weighInDate]].filter(([, v]) => v).map(([k, v]) => (
                  <Typography key={k} variant="body2"><b>{k}:</b> {String(v).replace('T', ' ')}{k !== 'Weigh-in' && t.timezone ? ` (${t.timezone})` : ''}</Typography>
                ))}
                {t.fees && Object.entries(t.fees).some(([, v]) => Number(v) > 0) && (
                  <Typography variant="body2" sx={{ mt: 1 }}><b>Fees:</b> {Object.entries(t.fees).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${FEE_LABEL[k] || k} ₹${v}`).join(' · ')}</Typography>
                )}
                {(t.contactPerson || t.contactEmail || t.contactMobile) && (
                  <Typography variant="body2" sx={{ mt: 1 }}><b>Contact:</b> {[t.contactPerson, t.contactMobile, t.contactEmail].filter(Boolean).join(' · ')}</Typography>
                )}
                {t.rulesetName && <Typography variant="body2" sx={{ mt: 1 }}><b>Rules:</b> {t.rulesetName}</Typography>}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Coaches register through the link the organisers send.</Typography>
              </Paper>
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
          <>
          {filters}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Team</TableCell><TableCell>Club</TableCell><TableCell>District</TableCell><TableCell>State</TableCell><TableCell>Country</TableCell><TableCell align="right">Players</TableCell></TableRow></TableHead>
              <TableBody>
                {data.teams.filter((tm) => matchesQuery(tm.name, tm.club) && inDistrict(tm.district)).map((tm) => (
                  <TableRow key={tm.id}><TableCell>{tm.name}</TableCell><TableCell>{tm.club || '—'}</TableCell><TableCell>{tm.district || '—'}</TableCell><TableCell>{tm.state || '—'}</TableCell><TableCell>{tm.country || '—'}</TableCell>
                    <TableCell align="right">{data.players.filter((p) => p.teamId === tm.id).length}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          </>
        )}

        {tab === 'players' && (
          <>
            {filters}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Player</TableCell><TableCell>Team</TableCell><TableCell>Club</TableCell><TableCell>District</TableCell><TableCell>State</TableCell><TableCell>Categories</TableCell></TableRow></TableHead>
                <TableBody>
                  {data.players.filter((p) => matchesQuery(p.name, p.id, teamName[p.teamId], p.club, districtOf(p)) && inDistrict(districtOf(p)) && (!category || p.categories.includes(data.categories.find((c) => c.key === category)?.label))).map((p) => (
                    <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell>{teamName[p.teamId] || '—'}</TableCell><TableCell>{p.club || '—'}</TableCell><TableCell>{districtOf(p) || '—'}</TableCell><TableCell>{p.state || '—'}</TableCell><TableCell>{p.categories.join(', ')}</TableCell></TableRow>
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
                {d.masterPool && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>Final pool</Typography>
                    <StandingsTable standings={d.masterPool.standings} />
                  </Box>
                )}
                {[...(d.kata?.rounds || [])].reverse().map((r) => (
                  <Box key={r.name} sx={{ mt: 2 }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>Kata · {r.name}</Typography>
                    <KataRoundTable round={r} />
                  </Box>
                ))}
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

        {tab === 'certificates' && t.publicCertificates && <PublicCertificates tournament={t} />}

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
