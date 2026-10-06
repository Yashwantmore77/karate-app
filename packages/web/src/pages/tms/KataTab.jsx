import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, Alert, Box, Chip, TextField, MenuItem, ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import { KATA_METHOD_LABEL } from '@kumite/shared/kata.js'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import KataRoundTable from '../../components/tms/KataRoundTable'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { PageLoader } from '../../components/Loader'

/**
 * PRD point 19, sections 32-33: kata judged by a panel. The admin opens each
 * round (round one is everyone in a drawn order, later rounds the top
 * scorers), judges score from their own screens, and the admin closes the
 * round once every judge has scored every performer.
 */
export default function KataTab({ tournament, version, action }) {
  const tid = tournament.id
  const [divisions, setDivisions] = useState(null)
  const [selected, setSelected] = useState(null) // round id
  const [round, setRound] = useState(null)
  const [entry, setEntry] = useState({ playerId: '', seat: 1, score: '' })
  const [confirm, setConfirm] = useState(null)

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
    const out = await action.run(() => tms.kata.score(tid, round.id, { playerId: entry.playerId, seat: Number(entry.seat), score: Number(entry.score) }), 'Score saved')
    if (out) { setRound(out.round); setEntry({ ...entry, score: '' }) }
  }

  return (
    <Stack spacing={2}>
      {!tournament.entriesLocked && <Alert severity="warning">Lock entries on the Draw tab before opening kata rounds.</Alert>}
      {divisions.map((d) => {
        const last = d.rounds[d.rounds.length - 1]
        const canStart = tournament.entriesLocked && (!last || (last.status === 'completed' && last.name !== 'Final'))
        return (
          <Paper key={d.key} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h3">{d.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {d.count} performers · {d.judges} judges · {KATA_METHOD_LABEL[d.method] || d.method} · {d.plannedRounds} round{d.plannedRounds > 1 ? 's' : ''}, top {d.qualifiers} go through
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                {d.rounds.length > 0 && (
                  <ToggleButtonGroup exclusive size="small" value={selected} onChange={(_e, v) => v && setSelected(v)}>
                    {d.rounds.map((r) => <ToggleButton key={r.id} value={r.id}>{r.name}{r.status === 'open' ? ' •' : ''}</ToggleButton>)}
                  </ToggleButtonGroup>
                )}
                {canStart && <Button variant="contained" onClick={() => start(d)}>{last ? 'Open next round' : 'Open round 1'}</Button>}
                {last?.name === 'Final' && last.status === 'completed' && <Chip color="success" label="Final complete" />}
              </Stack>
            </Stack>

            {round && round.divisionKey === d.key && (
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                  <Typography variant="h4">{round.name}</Typography>
                  <Chip size="small" color={round.status === 'open' ? 'warning' : 'success'} label={round.status === 'open' ? 'Scoring open' : 'Completed'} />
                  <Typography variant="body2" color="text.secondary">
                    {round.rows.filter((r) => r.final != null).length} of {round.rows.length} fully scored
                  </Typography>
                </Stack>
                <KataRoundTable round={round} showOrder={round.status === 'open'} />
                {round.status === 'open' && (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { md: 'center' } }}>
                    <Typography variant="body2" color="text.secondary">Enter a score from a paper sheet:</Typography>
                    <TextField select size="small" label="Performer" value={entry.playerId} sx={{ minWidth: 200 }} onChange={(e) => setEntry({ ...entry, playerId: e.target.value })}>
                      {[...round.rows].sort((a, b) => a.order - b.order).map((r) => <MenuItem key={r.playerId} value={r.playerId}>{r.order}. {r.name}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Judge" value={entry.seat} sx={{ width: 100 }} onChange={(e) => setEntry({ ...entry, seat: e.target.value })}>
                      {Array.from({ length: round.judges }, (_, i) => <MenuItem key={i + 1} value={i + 1}>J{i + 1}</MenuItem>)}
                    </TextField>
                    <TextField size="small" type="number" label="Score" value={entry.score} sx={{ width: 110 }}
                      slotProps={{ htmlInput: { min: 5, max: 10, step: 0.1 } }} onChange={(e) => setEntry({ ...entry, score: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && entry.playerId && entry.score && submit()} />
                    <Button variant="outlined" disabled={!entry.playerId || !entry.score || action.busy} onClick={submit}>Save score</Button>
                    <Box sx={{ flex: 1 }} />
                    <Button variant="contained" color="success" disabled={round.rows.some((r) => r.final == null) || action.busy}
                      onClick={() => setConfirm({
                        title: `Close ${round.name}?`, message: 'Scores can no longer change once the round is closed.',
                        run: async () => { const r = await action.run(() => tms.kata.complete(tid, round.id), `${round.name} completed`); if (r) { setRound(r); load() } },
                      })}>Complete round</Button>
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
