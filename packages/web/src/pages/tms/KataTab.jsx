import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, Alert, Box, Chip, TextField, MenuItem, ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import { KATA_METHOD_LABEL, KATA_TIE_BREAK_LABEL } from '@kumite/shared/kata.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { listOfficials } from '../../data/officials'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import KataRoundTable from '../../components/tms/KataRoundTable'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { runningEvent } from '@kumite/shared/tms.js'
import { hasSessions } from '../../components/tms/EventSession'

/**
 * PRD point 19, sections 32-33: kata judged by a panel. The admin opens each
 * round (round one is everyone in a drawn order, later rounds the top
 * scorers), judges score from their own screens, and the admin closes the
 * round once every judge has scored every performer.
 */
export default function KataTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const [divisions, setDivisions] = useState(null)
  const [selected, setSelected] = useState(null) // round id
  const [round, setRound] = useState(null)
  const [entry, setEntry] = useState({ playerId: '', seat: 1, score: '', technical: '', athletic: '' })
  const [confirm, setConfirm] = useState(null)
  const [judges, setJudges] = useState([])
  const [seats, setSeats] = useState({})
  const [official, setOfficial] = useState({ kind: 'penalty', playerId: '', seat: 1, value: '', technical: '', athletic: '', reason: '' })
  useEffect(() => { listOfficials().then((o) => setJudges(o.filter((x) => x.role === 'judge'))).catch(() => {}) }, [])
  useEffect(() => { setSeats(round?.judgeAssignments || {}) }, [round?.id, JSON.stringify(round?.judgeAssignments || {})])

  const load = () => tms.kata.divisions(tid).then(setDivisions).catch(() => setDivisions([]))
  const loadRound = (id = selected) => (id ? tms.kata.round(tid, id).then(setRound).catch(() => setRound(null)) : setRound(null))
  useEffect(() => { load() }, [tid, version])
  useEffect(() => { loadRound() }, [selected])
  // Judges' scores arrive as they are given.
  useEffect(() => watchPublicChanges(() => { load(); loadRound() }), [tid, selected])

  if (!divisions) return <PageLoader label="Loading kata categories…" />
  if (tournament.settings?.kataMode === 'bouts') return <Alert severity="info">Kata in this tournament is fought as bouts (flags), on the Matches tab. Switch to panel judging in Settings.</Alert>
  if (!divisions.length) return <Alert severity="info">No kata categories with players yet.</Alert>

  const start = (d) => setConfirm({
    title: d.rounds.length ? `Open the next round of ${d.label}?` : `Open round 1 of ${d.label}?`,
    message: d.rounds.length ? `The top ${d.qualifiers} of the last round perform again, lowest score first.` : 'Every entrant performs, in a drawn order.',
    run: async () => {
      const r = await action.run(() => tms.kata.createRound(tid, d.key), (x) => `${x.name} opened`)
      if (r) { setSelected(r.id); load() }
    },
  })

  const submit = async () => {
    const body = round.components
      ? { playerId: entry.playerId, seat: Number(entry.seat), technical: Number(entry.technical), athletic: Number(entry.athletic) }
      : { playerId: entry.playerId, seat: Number(entry.seat), score: Number(entry.score) }
    const out = await action.run(() => tms.kata.score(tid, round.id, body), 'Score saved')
    if (out) { setRound(out.round); setEntry({ ...entry, score: '', technical: '', athletic: '' }) }
  }
  const entryReady = entry.playerId && (round?.components ? entry.technical !== '' && entry.athletic !== '' : entry.score !== '')
  const saveSeats = () => action.run(() => tms.kata.assignJudges(tid, round.id, Object.entries(seats).filter(([, uid]) => uid).map(([seat, uid]) => ({ seat: Number(seat), uid }))), 'Judges assigned').then((r) => r && setRound(r))
  const officialAction = async () => {
    const o = official
    const r = o.kind === 'penalty'
      ? await action.run(() => tms.kata.penalty(tid, round.id, { playerId: o.playerId, deduction: Number(o.value) || 0, reason: o.reason || null }), 'Penalty recorded')
      : await action.run(() => tms.kata.override(tid, round.id, round.components
        ? { playerId: o.playerId, seat: Number(o.seat), technical: Number(o.technical), athletic: Number(o.athletic), reason: o.reason }
        : { playerId: o.playerId, seat: Number(o.seat), score: Number(o.value), reason: o.reason }), 'Score overridden')
    if (r) { setRound(r); setOfficial({ ...o, value: '', technical: '', athletic: '', reason: '' }) }
  }
  const range = round ? { min: round.minScore ?? 5, max: round.maxScore ?? 10, step: 1 / 10 ** (round.precision ?? 1) } : { min: 5, max: 10, step: 0.1 }

  return (
    <Stack spacing={2}>
      {!tournament.entriesLocked && <Alert severity="warning">Lock entries on the Draw tab before opening kata rounds.</Alert>}
      {/* Kata and Kumite take turns on the mats. */}
      {hasSessions(tournament) && runningEvent(tournament) !== 'kata' && <Alert severity="info">Kumite is on the mats now. Rounds can be set up; they start when the session is switched to Kata (top of the page).</Alert>}
      {divisions.map((d) => {
        const last = d.rounds[d.rounds.length - 1]
        const canStart = tournament.entriesLocked && (!last || (last.status === 'completed' && last.name !== 'Final'))
        return (
          <Paper key={d.key} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <HelpTitle id="kata.rounds" variant="h3">{d.label}</HelpTitle>
                <Typography variant="body2" color="text.secondary">
                  {d.count} performers · {d.judges} judges · {KATA_METHOD_LABEL[d.method] || d.method} · {d.plannedRounds} round{d.plannedRounds > 1 ? 's' : ''}, top {d.qualifiers} go through
                  {tournament.settings?.kataComponents ? ' · technical + athletic' : ''}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                {d.rounds.length > 0 && (
                  <ToggleButtonGroup exclusive size="small" value={selected} onChange={(_e, v) => v && setSelected(v)}>
                    {d.rounds.map((r) => <ToggleButton key={r.id} value={r.id}>{r.name}{r.status === 'open' ? ' •' : r.status === 'pending' ? ' (not started)' : ''}</ToggleButton>)}
                  </ToggleButtonGroup>
                )}
                {canStart && <Button variant="contained" onClick={() => start(d)}>{last ? 'Open next round' : 'Open round 1'}</Button>}
                {last?.name === 'Final' && last.status === 'completed' && <Chip color="success" label="Final complete" />}
              </Stack>
            </Stack>

            {selected && round?.id !== selected && d.rounds.some((r) => r.id === selected) && <PageLoader label="Loading the round…" minHeight={100} />}
            {round && round.id === selected && round.divisionKey === d.key && (
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                  <Typography variant="h4">{round.name}</Typography>
                  <Chip size="small" color={round.status === 'open' ? 'warning' : round.status === 'pending' ? 'default' : 'success'}
                    label={round.status === 'open' ? 'Scoring open' : round.status === 'pending' ? 'Not started' : 'Completed'} />
                  {round.tieBreak && <Typography variant="body2" color="text.secondary">Ties: {KATA_TIE_BREAK_LABEL[round.tieBreak] || round.tieBreak}</Typography>}
                  <Typography variant="body2" color="text.secondary">
                    {round.rows.filter((r) => r.final != null).length} of {round.rows.length} fully scored
                  </Typography>
                </Stack>
                {round.status !== 'completed' && (
                  <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Judges on this round (PRD v1 §14: each judge scores only their own seat)</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                      {Array.from({ length: round.judges }, (_, i) => i + 1).map((seat) => (
                        <TextField key={seat} select size="small" label={`J${seat}`} sx={{ minWidth: 170 }} value={seats[seat] || ''}
                          onChange={(e) => setSeats({ ...seats, [seat]: e.target.value })}>
                          <MenuItem value="">Unassigned</MenuItem>
                          {judges.map((j) => <MenuItem key={j.uid} value={j.uid}>{j.label}</MenuItem>)}
                        </TextField>
                      ))}
                      <Button variant="outlined" onClick={saveSeats} disabled={action.busy}>Save judges</Button>
                      {round.status === 'pending' && (
                        <Button variant="contained" disabled={action.busy} onClick={() => setConfirm({
                          title: `Start ${round.name}?`, message: 'Assigned judges can score from now.',
                          run: async () => { const r = await action.run(() => tms.kata.start(tid, round.id), `${round.name} started`); if (r) { setRound(r); load() } },
                        })}>Start round</Button>
                      )}
                    </Stack>
                  </Paper>
                )}
                <KataRoundTable round={round} showOrder={round.status !== 'completed'} />
                {round.status === 'open' && (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { md: 'center' } }}>
                    <Typography variant="body2" color="text.secondary">Enter a score from a paper sheet:</Typography>
                    <TextField select size="small" label="Performer" value={entry.playerId} sx={{ minWidth: 200 }} onChange={(e) => setEntry({ ...entry, playerId: e.target.value })}>
                      {[...round.rows].sort((a, b) => a.order - b.order).map((r) => <MenuItem key={r.playerId} value={r.playerId}>{r.order}. {r.name}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Judge" value={entry.seat} sx={{ width: 100 }} onChange={(e) => setEntry({ ...entry, seat: e.target.value })}>
                      {Array.from({ length: round.judges }, (_, i) => <MenuItem key={i + 1} value={i + 1}>J{i + 1}</MenuItem>)}
                    </TextField>
                    {round.components ? ['technical', 'athletic'].map((k) => (
                      <TextField key={k} size="small" type="number" label={k === 'technical' ? 'Technical' : 'Athletic'} value={entry[k]} sx={{ width: 110 }}
                        slotProps={{ htmlInput: range }} onChange={(e) => setEntry({ ...entry, [k]: e.target.value })} />
                    )) : (
                      <TextField size="small" type="number" label="Score" value={entry.score} sx={{ width: 110 }}
                        slotProps={{ htmlInput: range }} onChange={(e) => setEntry({ ...entry, score: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && entryReady && submit()} />
                    )}
                    <Button variant="outlined" disabled={!entryReady || action.busy} onClick={submit}>Save score</Button>
                    <Box sx={{ flex: 1 }} />
                    <Button variant="contained" color="success" disabled={round.rows.some((r) => r.final == null) || action.busy}
                      onClick={() => setConfirm({
                        title: `Close ${round.name}?`, message: 'Scores can no longer change once the round is closed.',
                        run: async () => { const r = await action.run(() => tms.kata.complete(tid, round.id), `${round.name} completed`); if (r) { setRound(r); load() } },
                      })}>Complete round</Button>
                  </Stack>
                )}
                {round.status !== 'pending' && (can(role, P.RESULT_MANAGE) || can(role, P.RESULT_OVERRIDE)) && (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { md: 'center' }, flexWrap: 'wrap' }}>
                    <Typography variant="body2" color="text.secondary">Official action:</Typography>
                    <TextField select size="small" label="Action" value={official.kind} sx={{ width: 150 }} onChange={(e) => setOfficial({ ...official, kind: e.target.value })}>
                      {can(role, P.RESULT_MANAGE) && <MenuItem value="penalty">Penalty</MenuItem>}
                      {can(role, P.RESULT_OVERRIDE) && <MenuItem value="override">Override a score</MenuItem>}
                    </TextField>
                    <TextField select size="small" label="Performer" value={official.playerId} sx={{ minWidth: 180 }} onChange={(e) => setOfficial({ ...official, playerId: e.target.value })}>
                      {round.rows.map((r) => <MenuItem key={r.playerId} value={r.playerId}>{r.name}</MenuItem>)}
                    </TextField>
                    {official.kind === 'override' && (
                      <TextField select size="small" label="Judge" value={official.seat} sx={{ width: 90 }} onChange={(e) => setOfficial({ ...official, seat: e.target.value })}>
                        {Array.from({ length: round.judges }, (_, i) => <MenuItem key={i + 1} value={i + 1}>J{i + 1}</MenuItem>)}
                      </TextField>
                    )}
                    {official.kind === 'override' && round.components ? ['technical', 'athletic'].map((k) => (
                      <TextField key={k} size="small" type="number" label={k === 'technical' ? 'Technical' : 'Athletic'} value={official[k]} sx={{ width: 100 }} onChange={(e) => setOfficial({ ...official, [k]: e.target.value })} />
                    )) : (
                      <TextField size="small" type="number" label={official.kind === 'penalty' ? 'Deduction' : 'Score'} value={official.value} sx={{ width: 110 }}
                        slotProps={{ htmlInput: { step: 0.1, min: 0 } }} onChange={(e) => setOfficial({ ...official, value: e.target.value })} />
                    )}
                    <TextField size="small" label="Reason" value={official.reason} sx={{ minWidth: 180 }} onChange={(e) => setOfficial({ ...official, reason: e.target.value })} />
                    <Button variant="outlined" disabled={!official.playerId || action.busy || (official.kind === 'override' && !official.reason.trim())} onClick={officialAction}>Apply</Button>
                  </Stack>
                )}
              </Box>
            )}
          </Paper>
        )
      })}
      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c.run() }} />
    </Stack>
  )
}
