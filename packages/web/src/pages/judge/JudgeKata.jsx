import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Container, Typography, Paper, Stack, Button, Alert, Box, Chip, TextField, List, ListItemButton, ListItemText,
} from '@mui/material'
import { KATA_MIN, KATA_MAX, normalizeKataScore } from '@kumite/shared/kata.js'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import useAction from '../../components/tms/useAction'
import TournamentSelector from '../../components/tms/TournamentSelector'

/**
 * PRD point 19: a kata judge's screen. The judge picks the open round and
 * scores each performer, in order, from their own seat. A score can be
 * changed until the admin closes the round; every change is recorded.
 */
export default function JudgeKata({ profile }) {
  const navigate = useNavigate()
  const { tournamentId } = useParams()
  if (!tournamentId) return <TournamentSelector title="Kata scoring: choose a tournament" onPick={(t) => navigate(`/judge/kata/${t.id}`)} />
  return <KataPanel tid={tournamentId} seat={profile?.seat} />
}

function KataPanel({ tid, seat }) {
  const action = useAction()
  const [divisions, setDivisions] = useState(null)
  const [roundId, setRoundId] = useState(null)
  const [round, setRound] = useState(null)
  const [drafts, setDrafts] = useState({})

  const load = () => tms.kata.divisions(tid).then(setDivisions).catch(() => setDivisions([]))
  const loadRound = () => (roundId ? tms.kata.round(tid, roundId).then(setRound).catch(() => setRound(null)) : null)
  useEffect(() => { load() }, [tid])
  useEffect(() => { setDrafts({}); loadRound() }, [roundId])
  useEffect(() => watchPublicChanges(() => { load(); loadRound() }), [tid, roundId])

  const open = useMemo(() => (divisions || []).flatMap((d) => d.rounds.filter((r) => r.status === 'open').map((r) => ({ ...r, label: d.label }))), [divisions])
  // Pick the only open round without asking.
  useEffect(() => { if (!roundId && open.length === 1) setRoundId(open[0].id) }, [open, roundId])

  if (!seat) return <Container sx={{ py: 4 }}><Alert severity="warning">Your account has no judge seat. Ask the tournament admin to set one (J1 to J7).</Alert></Container>
  if (!divisions) return null

  const performers = round ? [...round.rows].sort((a, b) => a.order - b.order) : []
  const mine = (r) => r.bySeat?.[seat]
  const nextUp = performers.find((r) => mine(r) == null)

  const submit = async (r) => {
    const value = normalizeKataScore(drafts[r.playerId])
    if (value == null) return action.notify({ severity: 'error', text: `A score is ${KATA_MIN.toFixed(1)} to ${KATA_MAX.toFixed(1)}, in steps of 0.1.` })
    const out = await action.run(() => tms.kata.score(tid, round.id, { playerId: r.playerId, score: value }), `${r.name}: ${value.toFixed(1)}`)
    if (out) { setRound(out.round); setDrafts((d) => ({ ...d, [r.playerId]: undefined })) }
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h1" sx={{ flex: 1 }}>Kata scoring</Typography>
        <Chip color="primary" label={`Judge J${seat}`} />
      </Stack>

      {!open.length && <Alert severity="info">No kata round is open for scoring. This page updates when the admin opens one.</Alert>}
      {open.length > 1 && (
        <Paper sx={{ mb: 2 }}>
          <List dense>
            {open.map((r) => (
              <ListItemButton key={r.id} selected={r.id === roundId} onClick={() => setRoundId(r.id)}>
                <ListItemText primary={`${r.label} — ${r.name}`} secondary={`${r.performers} performers`} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {round && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h3">{round.label} — {round.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {round.status === 'open' ? `${performers.filter((r) => mine(r) != null).length} of ${performers.length} scored by you` : 'This round is closed.'}
          </Typography>
          <Stack spacing={1}>
            {performers.map((r) => {
              const given = mine(r)
              const isNext = nextUp?.playerId === r.playerId
              return (
                <Box key={r.playerId} sx={{
                  display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', p: 1, borderRadius: 1,
                  border: '1px solid', borderColor: isNext ? 'primary.main' : 'divider',
                }}>
                  <Typography sx={{ width: 28, fontWeight: 700 }}>{r.order}</Typography>
                  <Box sx={{ flex: '1 1 160px' }}>
                    <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{r.club || r.team || ''}</Typography>
                  </Box>
                  {given != null && <Chip color="success" label={`Your score ${given.toFixed(1)}`} />}
                  {round.status === 'open' && (
                    <>
                      <TextField size="small" type="number" label={given != null ? 'Change to' : 'Score'} sx={{ width: 110 }}
                        value={drafts[r.playerId] ?? ''} autoFocus={isNext}
                        slotProps={{ htmlInput: { min: KATA_MIN, max: KATA_MAX, step: 0.1, inputMode: 'decimal' } }}
                        onChange={(e) => setDrafts({ ...drafts, [r.playerId]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && submit(r)} />
                      <Button variant={isNext ? 'contained' : 'outlined'} disabled={drafts[r.playerId] == null || drafts[r.playerId] === '' || action.busy} onClick={() => submit(r)}>
                        {given != null ? 'Change' : 'Submit'}
                      </Button>
                    </>
                  )}
                </Box>
              )
            })}
          </Stack>
        </Paper>
      )}
      {action.feedback}
    </Container>
  )
}
