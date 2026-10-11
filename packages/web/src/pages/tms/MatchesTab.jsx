import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, TextField, MenuItem, Button, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Typography, Box, IconButton,
  ToggleButtonGroup, ToggleButton, Alert, Menu,
} from '@mui/material'
import { Schedule, EditNote, SportsMma, SwapHoriz, History, PlaylistPlay } from '@mui/icons-material'
import { matchLifecycle } from '@kumite/shared/lifecycle.js'
import { humanize } from '../../components/tms/StatusBadge'
import { boutOutcome } from '@kumite/shared/results.js'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms, describeError } from '../../data/tms'
import { listOfficials } from '../../data/officials'
import { matches as matchStore } from '../../data/domain'
import DataTable from '../../components/tms/DataTable'
import StatusBadge from '../../components/tms/StatusBadge'
import { useLoading } from '../../components/Loader'
import InfoTip from '../../components/help/InfoTip'
import { isoToLocalInput, localInputToIso } from '../../utils/scheduleTime'

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

const SIDE = { aka: 'AKA', ao: 'AO' }
// PRD v1 §13: a bout on the mat (live or paused) versus one waiting to be called.
export const ON_MAT = ['live', 'open', 'paused']
// PRD v1 §13 result types, as the scoring table says them.
export const RESULT_TYPE_LABEL = {
  COMPLETED: 'Fought (points / decision)',
  WALKOVER: 'Walkover (opponent withdrew / absent)',
  NO_SHOW: 'No-show (opponent did not report)',
  KIKEN: 'Kiken (opponent forfeited)',
  DISQUALIFIED: 'Disqualification (opponent disqualified)',
  MANUAL_OVERRIDE: 'Manual decision (official override)',
  CANCELLED: 'Cancelled (no result)',
}
const POINT_NAME = { yuko: 'Yuko', wazaAri: 'Waza-ari', ippon: 'Ippon' }

/** One live command as a sentence: "Waza-ari to AKA — AKA 2 → 4". */
export function describeLiveEvent(e) {
  const p = e.payload || {}
  const what = {
    SCORE: `${POINT_NAME[p.type] || p.type} to ${SIDE[p.side] || p.side}`,
    DEDUCT: `−1 from ${SIDE[p.side] || p.side}`,
    PENALTY: `Penalty ${String(p.category || '').toUpperCase()} level ${p.level} for ${SIDE[p.side] || p.side}`,
    SENSHU: `Senshu ${SIDE[p.side] || p.side}`,
    TIMEOUT: `Timeout for ${SIDE[p.side] || p.side}`,
    UNDO: 'Undo',
    CLOCK_START: 'Clock started', CLOCK_STOP: 'Clock stopped', CLOCK_RESET: 'Clock reset', CLOCK_SET: 'Clock set', KO_TIMER: 'KO timer',
    KIKEN: `Kiken (${SIDE[p.side] || p.side})`, SHIKKAKU: `Shikkaku (${SIDE[p.side] || p.side})`, HANTEI: `Hantei to ${SIDE[p.side] || p.side}`,
    CLEAR_DECISION: 'Decision cleared', CLOCK_EXPIRED: 'Time up',
  }[e.cmd] || e.cmd
  const b = e.scoreBefore
  const a = e.scoreAfter
  const changed = b && a && (b.aka !== a.aka || b.ao !== a.ao)
  return changed ? `${what} — AKA ${b.aka} → ${a.aka}, AO ${b.ao} → ${a.ao}` : what
}

// What each status in the "Change status" menu means.
const STATUS_TIP = {
  scheduled: 'Back in the queue: not called yet.',
  called: 'Called to the mat: the players and their coaches are told to come now.',
  ready: 'Both players are at the mat and ready to start.',
  open: 'The scoring console is open; the bout has not started.',
  live: 'The bout is being fought.',
  paused: 'The clock is stopped (an injury, a timeout or a discussion).',
}

/** Sections 25-28 and 37: the match queue per mat, scheduling and Rule 6 corrections. */
export default function MatchesTab({ tournament, version, action, basePath = '/admin' }) {
  const navigate = useNavigate()
  const tid = tournament.id
  const settings = settingsOf(tournament)
  const [matches, setMatches] = useState([])
  const [view, setView] = useState('queue')
  const [mat, setMat] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [scheduleError, setScheduleError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [correct, setCorrect] = useState(null)
  const [officials, setOfficials] = useState([])
  const [log, setLog] = useState(null) // { m, events }
  const [statusMenu, setStatusMenu] = useState(null) // { anchor, m }
  useEffect(() => { listOfficials().then(setOfficials) }, [])
  const officialName = (uid) => officials.find((o) => o.uid === uid)?.label || uid

  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(tms.matches(tid).then(setMatches))
  useEffect(() => { load() }, [tid, version])

  const rows = useMemo(() => matches.filter((m) => {
    if (mat && String(m.mat) !== String(mat)) return false
    const done = !!boutOutcome(m)
    if (view === 'queue') return !done && !ON_MAT.includes(m.status)
    if (view === 'live') return ON_MAT.includes(m.status) && !done
    if (view === 'completed') return done
    return true
  }), [matches, mat, view])

  const counts = {
    queue: matches.filter((m) => !boutOutcome(m) && !ON_MAT.includes(m.status)).length,
    live: matches.filter((m) => ON_MAT.includes(m.status) && !boutOutcome(m)).length,
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
        <InfoTip id="matches.list" />
        <TextField select size="small" label="Mat" value={mat} onChange={(e) => setMat(e.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">All mats</MenuItem>
          {Array.from({ length: settings.mats }, (_, i) => <MenuItem key={i + 1} value={i + 1}>Mat {i + 1}</MenuItem>)}
        </TextField>
      </Stack>
      {!loading && !matches.length && <Alert severity="info">No matches yet. Draw pools, lock the draw and generate matches on the Draw tab.</Alert>}
      <DataTable
        rows={rows}
        loading={loading} refreshing={refreshing}
        exportName={`${tournament.slug || 'tournament'}-matches`} exportTitle={`${tournament.name} — Matches`}
        filters={[{ key: 'categoryName', label: 'Category' }, { key: 'stage', label: 'Stage', value: (m) => (m.stage === 'knockout' ? m.roundName : 'Pool') }]}
        searchPlaceholder="Search match number, player, category"
        empty="No matches in this view."
        columns={[
          { key: 'matchNumber', label: 'Match', value: (m) => Number(String(m.matchNumber).replace(/\D/g, '')) },
          { key: 'mat', label: 'Mat', render: (m) => m.mat || '—' },
          { key: 'scheduledAt', label: 'Time', render: (m) => (m.scheduledAt ? new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—') },
          { key: 'categoryName', label: 'Category' },
          { key: 'round', label: 'Round', value: (m) => `${m.poolName || ''}${m.round}`, render: (m) => (m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName} · R${m.round}`) },
          { key: 'players', label: 'AKA vs AO', value: (m) => `${m.akaName || 'TBD'} vs ${m.aoName || 'TBD'}`, render: (m) => <MatchSides m={m} />,
            exportValue: (m) => `${m.akaName || 'TBD'} vs ${m.aoName || 'TBD'}${boutOutcome(m) ? ` (${m.avgRed ?? ''}–${m.avgBlue ?? ''})` : ''}` },
          { key: 'officials', label: 'Referee', value: (m) => officialName(m.refereeId), render: (m) => (m.refereeId ? officialName(m.refereeId) : '—') },
          { key: 'status', label: 'Status', render: (m) => <StatusBadge status={m.resultType && m.resultType !== 'COMPLETED' ? m.resultType : m.status} /> },
          { key: 'actions', label: '', sortable: false, render: (m) => (
            <Stack direction="row">
              <IconButton size="small" aria-label="Open scoring console" disabled={!m.redId || !m.blueId} onClick={() => navigate(`${basePath}/match/${m.id}`)}><SportsMma fontSize="small" /></IconButton>
              <IconButton size="small" aria-label="Schedule" onClick={() => setSchedule({ id: m.id, categoryId: m.categoryId, number: m.matchNumber, mat: m.mat || 1, scheduledAt: isoToLocalInput(m.scheduledAt), refereeId: m.refereeId || '', judgeIds: m.judgeIds || [] })}><Schedule fontSize="small" /></IconButton>
              {/* PRD point 15: swap AKA and AO before the bout. */}
              <IconButton size="small" aria-label="Swap AKA and AO" disabled={!!boutOutcome(m) || ON_MAT.includes(m.status) || (!m.redId && !m.blueId)}
                onClick={() => action.run(() => tms.swapCorners(tid, m.id), `${m.matchNumber}: corners swapped`).then(load)}><SwapHoriz fontSize="small" /></IconButton>
              {!boutOutcome(m) && matchLifecycle.next(m.status || 'scheduled').length > 0 && (
                <IconButton size="small" aria-label="Change status" onClick={(e) => setStatusMenu({ anchor: e.currentTarget, m })}><PlaylistPlay fontSize="small" /></IconButton>
              )}
              <IconButton size="small" aria-label="Live score log" onClick={async () => setLog({ m, events: await tms.matchEvents(tid, m.id).catch(() => []) })}><History fontSize="small" /></IconButton>
              <IconButton size="small" aria-label={boutOutcome(m) ? 'Correct result' : 'Enter result'} disabled={!m.redId || !m.blueId} onClick={() => setCorrect({ m, winner: m.winner || 'red', resultType: m.resultType && m.resultType !== 'CANCELLED' ? m.resultType : 'COMPLETED', avgRed: m.avgRed ?? 0, avgBlue: m.avgBlue ?? 0, reason: '', finishReason: m.finishReason || '' })}><EditNote fontSize="small" /></IconButton>
            </Stack>
          ) },
        ]}
      />

      <Menu open={!!statusMenu} anchorEl={statusMenu?.anchor} onClose={() => setStatusMenu(null)}>
        {statusMenu && matchLifecycle.next(statusMenu.m.status || 'scheduled').filter((st) => !['completed', 'cancelled'].includes(st)).map((st) => (
          <MenuItem key={st} data-tip={STATUS_TIP[st]} onClick={() => {
            const { m } = statusMenu
            setStatusMenu(null)
            action.run(() => tms.setMatchStatus(tid, m.id, st), `${m.matchNumber}: ${humanize(st)}`).then(load)
          }}>{humanize(st)}</MenuItem>
        ))}
      </Menu>

      <Dialog open={!!log} onClose={() => setLog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Live score log — {log?.m.matchNumber}</DialogTitle>
        <DialogContent>
          {!log?.events.length && <Typography color="text.secondary">Nothing was scored live on this bout.</Typography>}
          {log?.events.map((e) => (
            <Box key={e.id} sx={{ display: 'flex', gap: 2, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ minWidth: 70, color: 'text.secondary' }}>{new Date(e.at).toLocaleTimeString()}</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {e.byEmail || e.role || 'Referee'}: {describeLiveEvent(e)}
              </Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setLog(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={!!schedule} onClose={() => { setSchedule(null); setScheduleError(null) }} maxWidth="xs" fullWidth>
        <DialogTitle>Schedule {schedule?.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* A refused schedule keeps what was typed and says who or what clashes. */}
            {scheduleError && <Alert severity="error">{scheduleError}</Alert>}
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
          <Button onClick={() => { setSchedule(null); setScheduleError(null) }}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={async () => {
            const s = schedule
            setSaving(true)
            setScheduleError(null)
            try {
              // Through the match API, which gives the bout its slot and refuses to
              // book anyone into two bouts at once. The time field is the local clock.
              await matchStore.update(s.categoryId, s.id, { mat: s.mat, scheduledAt: localInputToIso(s.scheduledAt), refereeId: s.refereeId || null, judgeIds: s.judgeIds || [] })
              setSchedule(null)
              action.notify({ severity: 'success', text: 'Match scheduled' })
              load()
            } catch (err) {
              setScheduleError(describeError(err))
            } finally {
              setSaving(false)
            }
          }}>{saving ? 'Saving…' : 'Save'}</Button>
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
                {Object.entries(RESULT_TYPE_LABEL).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
              </TextField>
              {!['COMPLETED', 'CANCELLED'].includes(correct?.resultType) && (
                <TextField fullWidth required sx={{ mb: 2 }} label="Finish reason" helperText="e.g. Injury, did not report at call 3, hansoku"
                  value={correct?.finishReason || ''} onChange={(e) => setCorrect({ ...correct, finishReason: e.target.value })} />
              )}
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
          <Button variant="contained" disabled={action.busy || !!(correct && ((boutOutcome(correct.m) && !correct.reason.trim()) || (!['COMPLETED', 'CANCELLED'].includes(correct.resultType) && !correct.finishReason?.trim())))} onClick={async () => {
            const c = correct
            setCorrect(null)
            await action.run(() => tms.correctResult(tid, c.m.id, {
              winner: c.resultType === 'CANCELLED' ? null : c.winner, resultType: c.resultType, avgRed: Number(c.avgRed) || 0, avgBlue: Number(c.avgBlue) || 0,
              ...(c.finishReason?.trim() ? { finishReason: c.finishReason.trim() } : {}),
            }, c.reason || null), 'Result saved')
            load()
          }}>Save result</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
