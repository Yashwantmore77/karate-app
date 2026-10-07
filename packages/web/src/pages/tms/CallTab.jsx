import { useEffect, useMemo, useState } from 'react'
import { Stack, Paper, Typography, Button, Box, Chip, Alert, Grid, TextField, MenuItem } from '@mui/material'
import { Campaign } from '@mui/icons-material'
import { boutOutcome } from '@kumite/shared/results.js'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import { MatchSides } from './MatchesTab'
import { PageLoader } from '../../components/Loader'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'

const UPCOMING = 4
const number = (m) => Number(String(m.matchNumber).replace(/\D/g, '')) || 0
const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

/**
 * PRD point 20: the announcer's screen. For each mat, the bout on it and the
 * next ones, with a button to call them to the mat; the hall's live board
 * shows what has been called. Results are read out from the finished list.
 */
export default function CallTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const mats = settingsOf(tournament).mats
  // PRD v1 §4: the announcer marks who reported when a bout is called.
  const attendance = settingsOf(tournament).attendanceEnabled !== false && can(role, P.ATTENDANCE_MARK)
  const mark = (m, side, present) => action.run(() => tms.markAttendance(tid, m.id, { side, present }), `${side === 'aka' ? 'AKA' : 'AO'} marked ${present ? 'present' : 'absent'}`).then(load)
  const [matches, setMatches] = useState(null)
  const [moveTo, setMoveTo] = useState({})

  const load = () => tms.matches(tid).then(setMatches).catch(() => {})
  useEffect(() => { load() }, [tid, version])
  useEffect(() => watchPublicChanges(load), [tid])

  const byMat = useMemo(() => {
    const pending = (matches || []).filter((m) => !boutOutcome(m) && m.status !== 'cancelled' && m.redId && m.blueId).sort((a, b) => number(a) - number(b))
    return Array.from({ length: mats }, (_, i) => i + 1).map((mat) => ({
      mat, rows: pending.filter((m) => Number(m.mat || 1) === mat).slice(0, UPCOMING),
    }))
  }, [matches, mats])
  const finished = useMemo(() => (matches || []).filter((m) => boutOutcome(m)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 8), [matches])

  const call = (m) => action.run(() => tms.callMatch(tid, m.id, moveTo[m.id] ? Number(moveTo[m.id]) : null), `${m.matchNumber} called to mat ${moveTo[m.id] || m.mat || 1}`).then(load)

  if (!matches) return <PageLoader label="Loading matches…" />
  if (!matches.length) return <Alert severity="info">No matches yet.</Alert>

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        {byMat.map(({ mat, rows }) => (
          <Grid key={mat} size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h3" gutterBottom>Mat {mat}</Typography>
              {!rows.length && <Typography color="text.secondary">Nothing waiting on this mat.</Typography>}
              <Stack spacing={1}>
                {rows.map((m, i) => (
                  <Box key={m.id} sx={{ p: 1, border: '1px solid', borderColor: i === 0 ? 'primary.main' : 'divider', borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700 }}>{m.matchNumber}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{m.categoryName} · {m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName}`}</Typography>
                      {['live', 'open', 'paused'].includes(m.status) && <Chip size="small" color="error" label={m.status === 'paused' ? 'Paused' : 'On the mat'} />}{['called', 'ready'].includes(m.status) && <Chip size="small" color="warning" label={m.status === 'called' ? 'Called' : 'Ready'} />}
                      {m.calledAt && <Chip size="small" color="warning" label={`Called ${m.calls > 1 ? `×${m.calls} ` : ''}${ago(m.calledAt)}`} />}
                    </Stack>
                    <MatchSides m={m} />
                    {attendance && (
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                        {['aka', 'ao'].map((side) => {
                          const state = m.attendance?.[side]
                          return (
                            <Stack key={side} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: side === 'aka' ? '#FF5B5B' : '#5B7BFF' }}>{side === 'aka' ? 'AKA' : 'AO'}</Typography>
                              <Button size="small" variant={state === 'present' ? 'contained' : 'outlined'} color="success" onClick={() => mark(m, side, true)}>Present</Button>
                              <Button size="small" variant={state === 'absent' ? 'contained' : 'outlined'} color="error" onClick={() => mark(m, side, false)}>Absent</Button>
                            </Stack>
                          )
                        })}
                      </Stack>
                    )}
                    <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                      <TextField select size="small" label="To mat" value={moveTo[m.id] || m.mat || 1} sx={{ width: 100 }}
                        onChange={(e) => setMoveTo({ ...moveTo, [m.id]: e.target.value })}>
                        {Array.from({ length: mats }, (_, k) => <MenuItem key={k + 1} value={k + 1}>{k + 1}</MenuItem>)}
                      </TextField>
                      <Button variant={i === 0 ? 'contained' : 'outlined'} startIcon={<Campaign />} disabled={action.busy} onClick={() => call(m)}>
                        {m.calledAt ? 'Call again' : 'Call'}
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Latest results</Typography>
        {!finished.length && <Typography color="text.secondary">No results yet.</Typography>}
        {finished.map((m) => (
          <Box key={m.id} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2">
              <b>{m.matchNumber}</b> · {m.categoryName} — winner <b>{m.winner === 'red' ? `AKA ${m.akaName}` : m.winner === 'blue' ? `AO ${m.aoName}` : 'draw'}</b>
              {m.avgRed != null ? ` (${m.avgRed}–${m.avgBlue})` : ''}{m.resultType && m.resultType !== 'COMPLETED' ? ` · ${m.resultType.toLowerCase()}` : ''}
            </Typography>
          </Box>
        ))}
      </Paper>
    </Stack>
  )
}
