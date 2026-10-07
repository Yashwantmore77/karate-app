import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, Grid, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Alert, TextField, MenuItem, Box,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Chip,
} from '@mui/material'
import { Delete, Add } from '@mui/icons-material'
import { settingsOf } from '@kumite/shared/tms.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { humanize } from '../../components/tms/StatusBadge'
import { tms } from '../../data/tms'
import StatusBadge from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import Bracket from '../../components/tms/Bracket'
import KataRoundTable from '../../components/tms/KataRoundTable'
import { PageLoader, useLoading } from '../../components/Loader'

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
              <TableCell>
                {r.qualified ? '✓ Yes' : '—'}
                {/* PRD v1 §16: why two players level on points are in this order. */}
                {r.tieBreak && <Typography variant="caption" color="text.secondary" component="div">{r.tieBreak}</Typography>}
              </TableCell>
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
        <Typography key={`${m.id}-${i}`}>
          {MEDAL_ICON[m.medal]} <b>{m.medal.toUpperCase()}</b> — {m.name}{m.club ? ` (${m.club})` : ''}
          {m.reason && <Typography component="span" variant="body2" color="text.secondary"> · {m.reason}</Typography>}
        </Typography>
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
export default function ResultsTab({ tournament, reload, version, action, role }) {
  const tid = tournament.id
  const [results, setResults] = useState([])
  const [tally, setTally] = useState([])
  const [by, setBy] = useState('club')
  const [confirm, setConfirm] = useState(null)
  const [override, setOverride] = useState(null) // { d, medals: [{ playerId, medal }], reason }
  const [divisions, setDivisions] = useState([])
  const [players, setPlayers] = useState([])
  const [qualifiers, setQualifiers] = useState(null) // { d, pool, ids, reason }
  const settings = settingsOf(tournament)

  const { loading, wrap } = useLoading()
  const load = () => wrap(Promise.all([tms.results(tid), tms.tally(tid, by)]).then(([r, t]) => { setResults(r); setTally(t) }))
  useEffect(() => { load() }, [tid, version, by])
  useEffect(() => { Promise.all([tms.divisions(tid), tms.players.list(tid)]).then(([d, p]) => { setDivisions(d); setPlayers(p) }).catch(() => {}) }, [tid, version])
  const entrants = (key) => {
    const ids = divisions.find((d) => d.key === key)?.playerIds || []
    return players.filter((p) => ids.includes(p.id))
  }
  const openOverride = (d) => setOverride({ d, reason: '', medals: d.medals.map((m) => ({ playerId: m.id, medal: m.medal })) })
  const saveOverride = (clear = false) => {
    const o = override
    setOverride(null)
    action.run(() => tms.overrideMedals(tid, o.d.key, clear ? null : o.medals.filter((m) => m.playerId), o.reason.trim()), clear ? 'Medals back to the calculated result' : 'Medals set by hand').then(load)
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h3">Publish results</Typography>
            <Typography variant="body2" color="text.secondary">
              Each category goes Provisional → Verified → Published → Locked (PRD v1 §16). Publishing verifies what is still provisional, shows it on the public page and notifies teams; completing the tournament locks it.
              {settings.resultPublishing === 'auto' && ' Results here are published automatically as each category is verified.'}
            </Typography>
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

      {loading && <PageLoader label="Loading results…" />}
      {!loading && !results.length && <Alert severity="info">No categories with matches yet.</Alert>}
      {results.map((d) => (
        <Paper key={d.key} sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', mb: 1 }} spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h3">{d.label}</Typography>
              {d.resultStatus && <StatusBadge status={d.resultStatus === 'LOCKED' || d.resultStatus === 'PUBLISHED' ? 'COMPLETED' : d.resultStatus === 'VERIFIED' ? 'APPROVED' : 'DRAFT'} label={humanize(d.resultStatus)} />}
            </Stack>
            {/* PRD v1 §16: freeze a finished category while the event goes on. */}
            {d.resultStatus === 'PUBLISHED' && can(role, P.RESULT_PUBLISH) && (
              <Button variant="outlined" size="small" onClick={() => setConfirm({
                title: `Lock ${d.label}?`, message: 'Nothing in this category can change until it is unlocked, which needs the result-override privilege and a reason.',
                run: () => action.run(() => tms.lockResults(tid, d.key, true), 'Category locked').then(load),
              })}>Lock result</Button>
            )}
            {d.resultStatus === 'LOCKED' && can(role, P.RESULT_OVERRIDE) && (
              <Button variant="outlined" color="warning" size="small" onClick={() => setConfirm({
                title: `Unlock ${d.label}?`, message: 'The category goes back to Published so it can be corrected. Your reason is recorded.', requireReason: true,
                run: (reason) => action.run(() => tms.lockResults(tid, d.key, false, reason), 'Category unlocked').then(load),
              })}>Unlock</Button>
            )}
            {d.resultStatus === 'PROVISIONAL' && (
              <Button variant="contained" color="success" size="small" onClick={() => setConfirm({
                title: `Verify ${d.label}?`, message: 'Confirms the medals are correct. Corrections after this need the result-override privilege.',
                run: () => action.run(() => tms.verifyResults(tid, d.key), 'Result verified').then(load),
              })}>Verify result</Button>
            )}
            {/* PRD point 21: medals set by hand, with a reason, in the audit log. */}
            <Button variant="outlined" size="small" onClick={() => openOverride(d)}>Override medals</Button>
            {d.canGenerateBracket && (
              <Button variant="contained" onClick={() => setConfirm({
                title: 'Generate the final stage?',
                message: `${settings.qualificationMode === 'manual' ? 'The chosen qualifiers' : settings.qualificationMode === 'points' ? `Players with ${settings.qualificationPoints}+ points` : `Top ${settings.qualifiersPerPool} from each pool`} go into ${settings.finalStage === 'master_pool' ? 'a final round-robin pool' : `a knockout bracket${settings.thirdPlaceMatch ? ' with a third-place match' : ''}`}.`,
                run: () => action.run(() => tms.generateBracket(tid, d.key), 'Bracket generated').then(load),
              })}>Generate final stage</Button>
            )}
          </Stack>
          {d.singleEntry && (
            <Alert severity={d.needsDecision ? 'warning' : 'info'} sx={{ mb: 2 }}
              action={d.needsDecision && (
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={() => setConfirm({
                    title: 'Award gold to the only entrant?', requireReason: true,
                    run: (reason) => action.run(() => tms.decideSingleEntry(tid, d.key, 'award', reason), 'Gold awarded').then(load),
                  })}>Award gold</Button>
                  <Button color="inherit" size="small" onClick={() => setConfirm({
                    title: 'No competition in this category?', requireReason: true,
                    run: (reason) => action.run(() => tms.decideSingleEntry(tid, d.key, 'no_competition', reason), 'Marked no competition').then(load),
                  })}>No competition</Button>
                </Stack>
              )}>
              Only one player entered (PRD v1 §28). {d.needsDecision ? 'Decide what happens.' : `Policy: ${humanize(d.singleEntryPolicy || '')}.`}
            </Alert>
          )}
          <Grid container spacing={2}>
            {d.pools.map((p) => (
              <Grid key={p.poolId} size={{ xs: 12, lg: d.pools.length > 1 ? 6 : 12 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                  <Typography variant="h4">Pool {p.pool} {p.complete ? '· complete' : `· ${p.bouts} matches`}</Typography>
                  {settings.qualificationMode === 'manual' && d.pools.length > 1 && !d.hasBracket && (
                    <Button size="small" onClick={() => setQualifiers({ d, pool: p, ids: p.standings.filter((r) => r.qualified).map((r) => r.id), reason: '' })}>Choose qualifiers</Button>
                  )}
                </Stack>
                <StandingsTable standings={p.standings} />
              </Grid>
            ))}
            {d.masterPool && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>Final pool {d.masterPool.complete ? '· complete' : ''}</Typography>
                <StandingsTable standings={d.masterPool.standings} />
              </Grid>
            )}
            {d.kata?.rounds?.length > 0 && (
              <Grid size={{ xs: 12 }}>
                {[...d.kata.rounds].reverse().map((r) => (
                  <Box key={r.id} sx={{ mb: 2 }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>Kata · {r.name} {r.status === 'completed' ? '' : '(in progress)'}</Typography>
                    <KataRoundTable round={r} />
                  </Box>
                ))}
              </Grid>
            )}
            {d.bracket && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="h4" sx={{ mb: 1 }}>Final stage</Typography>
                <Bracket rounds={d.bracket.rounds} />
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <Typography variant="h4" sx={{ mb: 1 }}>Medals {d.medalsOverridden && <Chip size="small" color="warning" label={`Set by hand: ${d.overrideReason}`} sx={{ ml: 1 }} />}</Typography>
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

      <Dialog open={!!override} onClose={() => setOverride(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Medals for {override?.d.label}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Use only for a protest upheld, a withdrawal or a scoring error. The change and its reason go in the audit log.</Alert>
          <Stack spacing={1}>
            {override?.medals.map((m, i) => (
              <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField select size="small" label="Medal" value={m.medal} sx={{ width: 130 }}
                  onChange={(e) => setOverride({ ...override, medals: override.medals.map((x, j) => (j === i ? { ...x, medal: e.target.value } : x)) })}>
                  {['gold', 'silver', 'bronze'].map((v) => <MenuItem key={v} value={v}>{MEDAL_ICON[v]} {v}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Player" value={m.playerId} sx={{ flex: 1 }}
                  onChange={(e) => setOverride({ ...override, medals: override.medals.map((x, j) => (j === i ? { ...x, playerId: e.target.value } : x)) })}>
                  {entrants(override.d.key).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.club ? ` (${p.club})` : ''}</MenuItem>)}
                </TextField>
                <IconButton aria-label="Remove medal" onClick={() => setOverride({ ...override, medals: override.medals.filter((_, j) => j !== i) })}><Delete fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Button startIcon={<Add />} sx={{ alignSelf: 'flex-start' }} disabled={(override?.medals.length || 0) >= 8}
              onClick={() => setOverride({ ...override, medals: [...override.medals, { playerId: '', medal: 'bronze' }] })}>Add medal</Button>
            <TextField required label="Reason" value={override?.reason || ''} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          {override?.d.medalsOverridden && <Button color="warning" disabled={!override.reason.trim()} onClick={() => saveOverride(true)}>Use calculated medals</Button>}
          <Button onClick={() => setOverride(null)}>Cancel</Button>
          <Button variant="contained" disabled={!override?.reason.trim() || override.medals.some((m) => !m.playerId)} onClick={() => saveOverride(false)}>Save medals</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!qualifiers} onClose={() => setQualifiers(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Qualifiers from pool {qualifiers?.pool.pool}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {qualifiers?.pool.standings.map((r) => (
              <Chip key={r.id} label={`${r.rank}. ${r.name}`} color={qualifiers.ids.includes(r.id) ? 'primary' : 'default'}
                onClick={() => setQualifiers({ ...qualifiers, ids: qualifiers.ids.includes(r.id) ? qualifiers.ids.filter((x) => x !== r.id) : [...qualifiers.ids, r.id] })} />
            ))}
            <TextField label="Reason (audit log)" value={qualifiers?.reason || ''} onChange={(e) => setQualifiers({ ...qualifiers, reason: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQualifiers(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            const q = qualifiers
            setQualifiers(null)
            action.run(() => tms.setQualifiers(tid, q.pool.poolId, q.ids, q.reason || null), 'Qualifiers saved').then(load)
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} requireReason={confirm?.requireReason} onClose={() => setConfirm(null)}
        onConfirm={(reason) => { const c = confirm; setConfirm(null); c.run(reason) }} />
    </Stack>
  )
}
