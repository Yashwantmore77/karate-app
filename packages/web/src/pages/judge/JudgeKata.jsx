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
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

/**
 * PRD point 19: a kata judge's screen. The judge picks the open round and
 * scores each performer, in order, from their own seat. A score can be
 * changed until the admin closes the round; every change is recorded.
 */
export default function JudgeKata({ profile, uid = null }) {
  const navigate = useNavigate()
  const { tournamentId } = useParams()
  if (!tournamentId) return <TournamentSelector title="Kata scoring: choose a tournament" onPick={(t) => navigate(`/judge/kata/${t.id}`)} />
  return <KataPanel tid={tournamentId} accountSeat={profile?.seat} uid={uid} />
}

function KataPanel({ tid, accountSeat, uid }) {
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

  // PRD v1 §14: the seat a judge holds on this round, as the admin assigned it.
  const assigned = round && uid ? Object.entries(round.judgeAssignments || {}).find(([, who]) => who === uid)?.[0] : null
  const seat = assigned ? Number(assigned) : accountSeat
  if (!divisions) return <PageLoader label="Loading kata rounds…" />
  const limits = round ? { min: round.minScore ?? KATA_MIN, max: round.maxScore ?? KATA_MAX, precision: round.precision ?? 1 } : { min: KATA_MIN, max: KATA_MAX, precision: 1 }
  const step = 1 / 10 ** limits.precision

  const performers = round ? [...round.rows].sort((a, b) => a.order - b.order) : []
  const mine = (r) => r.bySeat?.[seat]
  const nextUp = performers.find((r) => mine(r) == null)

  const bad = () => action.notify({ severity: 'error', text: `A score is ${limits.min} to ${limits.max}, in steps of ${step}.` })
  // A clientside id makes a resend after a dropped connection count once (PRD v1 §15).
  const submissionId = () => `${uid || 'j'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const submit = async (r) => {
    const d = drafts[r.playerId] || {}
    let body
    if (round.components) {
      const technical = normalizeKataScore(d.technical, limits)
      const athletic = normalizeKataScore(d.athletic, limits)
      if (technical == null || athletic == null) return bad()
      body = { playerId: r.playerId, technical, athletic }
    } else {
      const score = normalizeKataScore(d.score, limits)
      if (score == null) return bad()
      body = { playerId: r.playerId, score }
    }
    const out = await action.run(() => tms.kata.score(tid, round.id, { ...body, submissionId: submissionId() }), `${r.name}: scored`)
    if (out) { setRound(out.round); setDrafts((x) => ({ ...x, [r.playerId]: undefined })) }
  }
  const ready = (r) => {
    const d = drafts[r.playerId] || {}
    return round.components ? d.technical != null && d.technical !== '' && d.athletic != null && d.athletic !== '' : d.score != null && d.score !== ''
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <HelpTitle id="judge.kata" variant="h1" sx={{ flex: 1 }}>Kata scoring</HelpTitle>
        {seat ? <Chip color="primary" label={`Judge J${seat}`} /> : null}
      </Stack>

      {!open.length && <Alert severity="info">No kata round you are judging is open. This page updates when the admin assigns you and starts a round.</Alert>}
      {open.length > 1 && (
        <Paper sx={{ mb: 2 }}>
          <List dense>
            {open.map((r) => (
              <ListItemButton key={r.id} data-tip="Shows this round so you can score its performers" selected={r.id === roundId} onClick={() => setRoundId(r.id)}>
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
                  {given != null && <Chip color="success" label={`Your score ${given.toFixed(limits.precision)}`} />}
                  {round.status === 'open' && (
                    <>
                      {(round.components ? [['technical', 'Technical'], ['athletic', 'Athletic']] : [['score', given != null ? 'Change to' : 'Score']]).map(([k, label], idx) => (
                        <TextField key={k} size="small" type="number" label={label} sx={{ width: 110 }}
                          value={drafts[r.playerId]?.[k] ?? ''} autoFocus={isNext && idx === 0}
                          slotProps={{ htmlInput: { min: limits.min, max: limits.max, step, inputMode: 'decimal' } }}
                          onChange={(e) => setDrafts({ ...drafts, [r.playerId]: { ...(drafts[r.playerId] || {}), [k]: e.target.value } })}
                          onKeyDown={(e) => e.key === 'Enter' && ready(r) && submit(r)} />
                      ))}
                      <Button variant={isNext ? 'contained' : 'outlined'} disabled={!ready(r) || action.busy} onClick={() => submit(r)}>
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
