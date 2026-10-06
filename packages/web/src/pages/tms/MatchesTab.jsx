import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, TextField, MenuItem, Button, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Typography, Box, IconButton, Tooltip, ToggleButtonGroup, ToggleButton, Alert,
} from '@mui/material'
import { Schedule, EditNote, SportsMma } from '@mui/icons-material'
import { boutOutcome } from '@kumite/shared/results.js'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'
import { listOfficials } from '../../data/officials'
import DataTable from '../../components/tms/DataTable'
import StatusBadge from '../../components/tms/StatusBadge'

const AKA = '#FF5B5B'
const AO = '#5B7BFF'

export const MatchSides = ({ m }) => {
  const won = (side) => (m.winner === (side === 'aka' ? 'red' : 'blue') ? 700 : 400)
  return (
    <Box sx={{ minWidth: 220 }}>
      <Typography variant="body2" sx={{ fontWeight: won('aka') }}><Box component="span" sx={{ color: AKA }}>■ AKA</Box> {m.akaName || 'TBD'}{m.avgRed != null && boutOutcome(m) ? ` — ${m.avgRed}` : ''}</Typography>
      <Typography variant="body2" sx={{ fontWeight: won('ao') }}><Box component="span" sx={{ color: AO }}>■ AO</Box> {m.aoName || 'TBD'}{m.avgBlue != null && boutOutcome(m) ? ` — ${m.avgBlue}` : ''}</Typography>
    </Box>
  )
}

/** Sections 25-28 and 37: the match queue per mat, scheduling and Rule 6 corrections. */
export default function MatchesTab({ tournament, version, action }) {
  const navigate = useNavigate()
  const tid = tournament.id
  const settings = settingsOf(tournament)
  const [matches, setMatches] = useState([])
  const [view, setView] = useState('queue')
  const [mat, setMat] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [correct, setCorrect] = useState(null)
  const [officials, setOfficials] = useState([])
  useEffect(() => { listOfficials().then(setOfficials) }, [])
  const officialName = (uid) => officials.find((o) => o.uid === uid)?.label || uid

  const load = () => tms.matches(tid).then(setMatches)
  useEffect(() => { load() }, [tid, version])

  const rows = useMemo(() => matches.filter((m) => {
    if (mat && String(m.mat) !== String(mat)) return false
    const done = !!boutOutcome(m)
    if (view === 'queue') return !done && !['live', 'open'].includes(m.status)
    if (view === 'live') return ['live', 'open'].includes(m.status) && !done
    if (view === 'completed') return done
    return true
  }), [matches, mat, view])

  const counts = {
    queue: matches.filter((m) => !boutOutcome(m) && !['live', 'open'].includes(m.status)).length,
    live: matches.filter((m) => ['live', 'open'].includes(m.status) && !boutOutcome(m)).length,
    completed: matches.filter((m) => boutOutcome(m)).length,
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, v) => v && setView(v)}>
          <ToggleButton value="queue">Queue ({counts.queue})</ToggleButton>
          <ToggleButton value="live">Live ({counts.live})</ToggleButton>
          <ToggleButton value="completed">Completed ({counts.completed})</ToggleButton>
          <ToggleButton value="all">All ({matches.length})</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Mat" value={mat} onChange={(e) => setMat(e.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">All mats</MenuItem>
          {Array.from({ length: settings.mats }, (_, i) => <MenuItem key={i + 1} value={i + 1}>Mat {i + 1}</MenuItem>)}
        </TextField>
      </Stack>
      {!matches.length && <Alert severity="info">No matches yet. Draw pools, lock the draw and generate matches on the Draw tab.</Alert>}
      <DataTable
        rows={rows}
        searchPlaceholder="Search match number, player, category"
        empty="No matches in this view."
        columns={[
          { key: 'matchNumber', label: 'Match', value: (m) => Number(String(m.matchNumber).replace(/\D/g, '')) },
          { key: 'mat', label: 'Mat', render: (m) => m.mat || '—' },
          { key: 'scheduledAt', label: 'Time', render: (m) => (m.scheduledAt ? new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—') },
          { key: 'categoryName', label: 'Category' },
          { key: 'round', label: 'Round', value: (m) => `${m.poolName || ''}${m.round}`, render: (m) => (m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName} · R${m.round}`) },
          { key: 'players', label: 'AKA vs AO', value: (m) => `${m.akaName} ${m.aoName}`, render: (m) => <MatchSides m={m} /> },
          { key: 'officials', label: 'Referee', value: (m) => officialName(m.refereeId), render: (m) => (m.refereeId ? officialName(m.refereeId) : '—') },
          { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.resultType && m.resultType !== 'COMPLETED' ? m.resultType : m.status} /> },
          { key: 'actions', label: '', sortable: false, render: (m) => (
            <Stack direction="row">
              <Tooltip title="Open scoring console"><span><IconButton size="small" aria-label="Open scoring console" disabled={!m.redId || !m.blueId} onClick={() => navigate(`/admin/match/${m.id}`)}><SportsMma fontSize="small" /></IconButton></span></Tooltip>
              <Tooltip title="Schedule"><IconButton size="small" aria-label="Schedule" onClick={() => setSchedule({ id: m.id, number: m.matchNumber, mat: m.mat || 1, scheduledAt: m.scheduledAt ? m.scheduledAt.slice(0, 16) : '', refereeId: m.refereeId || '', judgeIds: m.judgeIds || [] })}><Schedule fontSize="small" /></IconButton></Tooltip>
              <Tooltip title={boutOutcome(m) ? 'Correct result' : 'Enter result'}><span><IconButton size="small" aria-label={boutOutcome(m) ? 'Correct result' : 'Enter result'} disabled={!m.redId || !m.blueId} onClick={() => setCorrect({ m, winner: m.winner || 'red', resultType: m.resultType && m.resultType !== 'CANCELLED' ? m.resultType : 'COMPLETED', avgRed: m.avgRed ?? 0, avgBlue: m.avgBlue ?? 0, reason: '' })}><EditNote fontSize="small" /></IconButton></span></Tooltip>
            </Stack>
          ) },
        ]}
      />

      <Dialog open={!!schedule} onClose={() => setSchedule(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Schedule {schedule?.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Mat" value={schedule?.mat || 1} onChange={(e) => setSchedule({ ...schedule, mat: Number(e.target.value) })}>
              {Array.from({ length: settings.mats }, (_, i) => <MenuItem key={i + 1} value={i + 1}>Mat {i + 1}</MenuItem>)}
            </TextField>
            <TextField select label="Referee" value={schedule?.refereeId || ''} onChange={(e) => setSchedule({ ...schedule, refereeId: e.target.value })}>
              <MenuItem value="">Unassigned</MenuItem>
              {officials.filter((o) => o.role === 'referee').map((o) => <MenuItem key={o.uid} value={o.uid}>{o.label}</MenuItem>)}
            </TextField>
            <TextField select label="Judges" value={schedule?.judgeIds || []} slotProps={{ select: { multiple: true } }}
              onChange={(e) => setSchedule({ ...schedule, judgeIds: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}>
              {officials.filter((o) => o.role === 'judge').map((o) => <MenuItem key={o.uid} value={o.uid}>{o.label}</MenuItem>)}
            </TextField>
            <TextField type="datetime-local" label="Time" slotProps={{ inputLabel: { shrink: true } }} value={schedule?.scheduledAt || ''} onChange={(e) => setSchedule({ ...schedule, scheduledAt: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSchedule(null)}>Cancel</Button>
          <Button variant="contained" onClick={async () => {
            const s = schedule
            setSchedule(null)
            await action.run(() => tms.scheduleMatch(tid, s.id, { mat: s.mat, scheduledAt: s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null, refereeId: s.refereeId || null, judgeIds: s.judgeIds || [] }), 'Match scheduled')
            load()
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!correct} onClose={() => setCorrect(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{correct && boutOutcome(correct.m) ? 'Correct result' : 'Enter result'} — {correct?.m.matchNumber}</DialogTitle>
        <DialogContent>
          {correct && boutOutcome(correct.m) && <Alert severity="warning" sx={{ mb: 2 }}>This match is completed. A correction needs a reason and is recorded in the audit log (Rule 6).</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField select fullWidth label="Result" value={correct?.resultType || 'COMPLETED'} sx={{ mb: 2 }}
                onChange={(e) => setCorrect({ ...correct, resultType: e.target.value, winner: correct.winner === 'tie' && e.target.value !== 'COMPLETED' ? 'red' : correct.winner })}>
                <MenuItem value="COMPLETED">Fought (points / decision)</MenuItem>
                <MenuItem value="WALKOVER">Walkover (opponent withdrew / absent)</MenuItem>
                <MenuItem value="DISQUALIFIED">Disqualification (opponent disqualified)</MenuItem>
                <MenuItem value="CANCELLED">Cancelled (no result)</MenuItem>
              </TextField>
              {correct?.resultType !== 'CANCELLED' && <TextField select fullWidth label="Winner" value={correct?.winner || 'red'} onChange={(e) => setCorrect({ ...correct, winner: e.target.value })}>
                <MenuItem value="red">AKA — {correct?.m.akaName}</MenuItem>
                <MenuItem value="blue">AO — {correct?.m.aoName}</MenuItem>
                {correct?.resultType === 'COMPLETED' && <MenuItem value="tie">Draw</MenuItem>}
              </TextField>}
            </Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="AKA score" value={correct?.avgRed ?? 0} onChange={(e) => setCorrect({ ...correct, avgRed: e.target.value })} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="AO score" value={correct?.avgBlue ?? 0} onChange={(e) => setCorrect({ ...correct, avgBlue: e.target.value })} /></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth label="Reason" required={!!(correct && boutOutcome(correct.m))} value={correct?.reason || ''} onChange={(e) => setCorrect({ ...correct, reason: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrect(null)}>Cancel</Button>
          <Button variant="contained" disabled={!!(correct && boutOutcome(correct.m) && !correct.reason.trim())} onClick={async () => {
            const c = correct
            setCorrect(null)
            await action.run(() => tms.correctResult(tid, c.m.id, { winner: c.resultType === 'CANCELLED' ? null : c.winner, resultType: c.resultType, avgRed: Number(c.avgRed) || 0, avgBlue: Number(c.avgBlue) || 0 }, c.reason || null), 'Result saved')
            load()
          }}>Save result</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
