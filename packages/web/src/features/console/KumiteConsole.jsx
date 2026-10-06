import { useEffect, useState } from 'react'
import {
  Box, Container, Grid, Paper, Button, IconButton, Typography, Checkbox,
  FormControlLabel, TextField, Divider, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material'
import { KeyboardArrowUp, KeyboardArrowDown, Undo as UndoIcon, Gavel } from '@mui/icons-material'
import {
  evaluateOutcome, PENALTY_LADDER, PENALTY_CATEGORIES, DEFAULT_RULES
} from '@kumite/shared/rules.js'
import { initialMatchState, UNDO } from '@kumite/shared/commands.js'
import { toMinutesSeconds, parseDuration } from '@kumite/shared/format.js'
import { displayRepo } from '../../data/display'
import { useMatchChannel } from '../../hooks/useMatchChannel'
import { useMatchClock } from '../../hooks/useMatchClock'
import { useServerNow } from '../../hooks/useServerNow'

const POINT_BUTTONS = [
  { key: 'ippon', label: 'Ippon' },
  { key: 'wazaAri', label: 'Waza-ari' },
  { key: 'yuko', label: 'Yuko' },
]

const CATEGORY_LABELS = { c1: 'Category 1', c2: 'Category 2' }

// Sampled from the WKF scoring console this screen mirrors.
const WKF = {
  ao: '#0000C0',
  aka: '#C00000',
  aoControl: '#93FFFF',
  akaControl: '#FF9192',
  onPanel: '#FFFFFF',
  timerInk: '#000040',
  start: '#93FE94',
  stop: '#E47E7A',
  koTimer: '#7B76F4',
  utility: '#F2F2F2',
  utilityBorder: '#ACACAC',
  scoreboardStart: '#D2FFD4',
  scoreboardClose: '#E47E7A',
  ink: '#000000',
}

const utilityButtonSx = {
  bgcolor: WKF.utility,
  color: WKF.ink,
  borderColor: WKF.utilityBorder,
  '&:hover': { bgcolor: '#E5E5E5', borderColor: WKF.utilityBorder },
}

// Pinned light: these carry near-black digits and labels sampled from the
// reference console, which would disappear on the dark theme's paper.
const boardPaperSx = {
  bgcolor: '#FFFFFF',
  backgroundImage: 'none',
  border: '1px solid rgba(0,0,0,0.12)',
  color: WKF.ink,
  '& .MuiTypography-root': { color: WKF.ink },
}

// Inputs that sit on the white board need their own light styling: the dark
// theme gives them white borders, which vanish against it.
const boardFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#FFFFFF',
    color: WKF.ink,
    '& fieldset': { borderColor: 'rgba(0,0,0,0.28)' },
    '&:hover fieldset': { borderColor: 'rgba(0,0,0,0.5)' },
    '&.Mui-focused fieldset': { borderColor: WKF.timerInk },
  },
  '& .MuiInputBase-input': { color: WKF.ink },
}

const panelCheckboxSx = {
  color: WKF.onPanel,
  '&.Mui-checked': { color: WKF.onPanel },
}

export default function KumiteConsole({
  matchId, redComp, blueComp, tournamentExpired, mode = 'control', onBack, onFinalize, rules = null, displayInfo = null
}) {
  const observing = mode === 'observe'
  const [state, send, mat] = useMatchChannel(matchId, { control: !observing })
  const [fieldNumberDraft, setFieldNumberDraft] = useState('1')
  const [pendingAction, setPendingAction] = useState(null)
  const [decisionOpen, setDecisionOpen] = useState(false)
  const serverNow = useServerNow()

  const view = state || initialMatchState()
  const mainClock = useMatchClock(view.clock)
  const koClock = useMatchClock(view.koActive ? view.koClock : null)

  useEffect(() => {
    if (state?.fieldNumber) setFieldNumberDraft(state.fieldNumber)
  }, [state?.fieldNumber])

  // A bout from a configured tournament runs under that tournament's rules
  // (duration, point gap). The reducer ignores this once the bout has begun.
  const rulesKey = rules ? JSON.stringify(rules) : null
  useEffect(() => {
    if (observing || !state || !rulesKey) return
    send('RULES', JSON.parse(rulesKey))
  }, [observing, !!state, rulesKey, send])

  // Publish to the public scoreboard, with a heartbeat so a display can tell
  // a quiet match from a dead connection.
  useEffect(() => {
    if (observing || !state?.scoreboardActive) return
    const publish = () => displayRepo.put({
      status: 'open',
      matchId,
      fieldNumber: state.fieldNumber,
      aoName: blueComp?.name,
      akaName: redComp?.name,
      aoScore: state.match.scores.ao,
      akaScore: state.match.scores.aka,
      senshu: state.match.senshu,
      clock: state.koActive ? state.koClock : state.clock,
      heartbeatAt: serverNow(),
      // Section 38: category, round, match number, result and what is next.
      category: displayInfo?.category ?? null,
      matchNumber: displayInfo?.matchNumber ?? null,
      round: displayInfo?.round ?? null,
      next: displayInfo?.next ?? null,
      outcome: state.outcome?.ended && state.outcome.winner
        ? `${state.outcome.winner === 'aka' ? 'AKA' : 'AO'} wins`
        : null,
    })
    publish()
    const id = setInterval(publish, 2000)
    return () => clearInterval(id)
  }, [observing, state, matchId, blueComp?.name, redComp?.name, serverNow, displayInfo])

  // The server hands one mat to one socket, so holding it is the real question
  // — not whether this screen asked for control. Anything else renders
  // read-only, because a button that looks live and is refused is worse than
  // one that is plainly out of reach.
  const disabled = tournamentExpired || observing || !mat.holdsControl
  const clockRunning = view.clock.running
  const shownClock = view.koActive ? koClock : mainClock

  const toggleTimer = () => send(clockRunning ? 'CLOCK_STOP' : 'CLOCK_START')
  const resetTime = () => send('CLOCK_RESET')
  const useDuration = (durationMs) => send('CLOCK_SET', { durationMs })
  const setMatchDuration = (minutes, seconds) => useDuration(parseDuration(minutes, seconds))
  const toggleKoTimer = () => send('KO_TIMER')
  const commitFieldNumber = () => send('FIELD_NUMBER', { value: fieldNumberDraft })

  const declare = (cmd, side) => {
    send(cmd, { side })
    setDecisionOpen(false)
  }

  const toggleScoreboard = () => {
    const next = !view.scoreboardActive
    if (!next) displayRepo.put({ status: 'closed' })
    send('SCOREBOARD', { active: next })
  }

  const handleClose = () => {
    // A referee decision (kiken, shikkaku, hantei) beats the score, so take the
    // verdict the authority already published rather than recomputing it.
    const { winner } = view.outcome
      ?? evaluateOutcome(view.match, view.rules || DEFAULT_RULES, { expired: true })
    const method = view.outcome?.method
    onFinalize({
      // Kiken (withdrawal) is recorded as a walkover and shikkaku as a
      // disqualification, the PRD's own terms for them (section 27).
      result: { method: method || 'points', type: method === 'kiken' ? 'WALKOVER' : method === 'shikkaku' ? 'DISQUALIFIED' : 'COMPLETED' },
      status: 'completed',
      winner: winner === 'aka' ? 'red' : winner === 'ao' ? 'blue' : 'tie',
      avgRed: view.match.scores.aka,
      avgBlue: view.match.scores.ao,
    })
    onBack()
  }

  // Anything that disrupts a match in progress needs confirming while the
  // clock runs; scoring stays immediate so the referee is never slowed down.
  const guarded = (label, run) => () => {
    if (clockRunning) setPendingAction({ label, run })
    else run()
  }

  const confirmPendingAction = () => {
    pendingAction.run()
    setPendingAction(null)
  }

  const { minutes: durationMinutes, seconds: durationSeconds } = toMinutesSeconds(view.durationMs)

  const OUTCOME_LABEL = {
    points: 'on points',
    gapRule: 'by point gap',
    senshu: 'by senshu',
    hansoku: 'by hansoku',
    shikkaku: 'by shikkaku',
    kiken: 'by kiken',
    tieBreak: 'level \u2014 needs extra time or a decision',
  }
  const outcome = view.outcome
  const outcomeName = outcome?.winner === 'ao' ? blueComp?.name
    : outcome?.winner === 'aka' ? redComp?.name
    : null

  const renderPenaltyRow = (side, category) => {
    const level = view.match.penalties[side][category]
    return (
      <Stack direction="row" spacing={1} key={category} alignItems="center">
        <Typography variant="caption" sx={{ width: 72, color: WKF.onPanel, fontWeight: 700 }}>
          {CATEGORY_LABELS[category]}
        </Typography>
        {PENALTY_LADDER.map((step, idx) => (
          <FormControlLabel
            key={step}
            sx={{ mr: 0.5 }}
            control={
              <Checkbox
                size="small"
                checked={level >= idx + 1}
                disabled={disabled}
                onChange={() => send('PENALTY', { side, category, level: idx + 1 })}
                sx={panelCheckboxSx}
              />
            }
            label={<Typography variant="caption" sx={{ color: WKF.onPanel, fontWeight: 700 }}>{step}</Typography>}
          />
        ))}
      </Stack>
    )
  }

  const renderSide = (side, comp, bg, control) => (
    <Paper elevation={0} sx={{
      p: 2, bgcolor: bg, backgroundImage: 'none', border: 'none',
      borderRadius: 2, textAlign: 'center', height: '100%',
    }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: WKF.onPanel }}>{side === 'ao' ? 'Ao' : 'Aka'}</Typography>
      <Typography variant="subtitle1" sx={{ color: WKF.onPanel, mb: 1 }}>{comp?.name} • #{comp?.bib}</Typography>

      <FormControlLabel
        sx={{ mb: 1, color: WKF.onPanel }}
        control={
          <Checkbox
            checked={view.match.senshu === side}
            disabled={disabled}
            onChange={() => send('SENSHU', { side })}
            sx={panelCheckboxSx}
          />
        }
        label="Senshu"
      />

      <Typography variant="h1" sx={{ fontSize: 72, fontWeight: 800, color: WKF.onPanel, my: 1 }}>
        {view.match.scores[side]}
      </Typography>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {POINT_BUTTONS.map((p) => (
          <Button
            key={p.key}
            variant="contained"
            disabled={disabled}
            onClick={() => send('SCORE', { side, type: p.key })}
            sx={{ bgcolor: control, color: WKF.ink, fontWeight: 700, '&:hover': { bgcolor: control, filter: 'brightness(0.92)' } }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          variant="contained"
          disabled={disabled}
          onClick={() => send('DEDUCT', { side })}
          sx={{ bgcolor: control, color: WKF.ink, fontWeight: 700, '&:hover': { bgcolor: control, filter: 'brightness(0.92)' } }}
        >
          -1
        </Button>
      </Stack>

      <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.35)' }} />
      <Stack spacing={0.5} alignItems="flex-start">
        {PENALTY_CATEGORIES.map((c) => renderPenaltyRow(side, c))}
      </Stack>
    </Paper>
  )

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {tournamentExpired && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Tournament expired. Scoring is read-only.
        </Alert>
      )}

      {/* Only for a screen that came here to run the mat. An observer is
          meant to be read-only and needs no explanation for it. */}
      {!observing && mat.contested && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => mat.takeover()}>
              Take over
            </Button>
          }
        >
          Another device is running this mat, so the controls are read-only.
          Taking over moves control here and makes that device read-only.
        </Alert>
      )}

      {!observing && mat.lastError === 'taken_over' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Another referee took over this mat. Your controls are now read-only.
        </Alert>
      )}

      {outcome?.ended && (
        <Alert
          severity={outcomeName ? 'success' : 'info'}
          sx={{ mb: 2, fontWeight: 700 }}
          action={!observing && (
            <Button color="inherit" size="small" onClick={handleClose}>Confirm result</Button>
          )}
        >
          {outcomeName
            ? `${outcomeName} wins ${OUTCOME_LABEL[outcome.method]}`
            : `Scores ${OUTCOME_LABEL.tieBreak}`}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {renderSide('ao', blueComp, WKF.ao, WKF.aoControl)}
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ ...boardPaperSx, p: 2, textAlign: 'center' }}>
              <Typography variant="h1" sx={{ fontSize: 56, fontWeight: 800, color: WKF.timerInk }}>
                {shownClock.display}
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 1, justifyContent: 'center' }}>
                <IconButton disabled={disabled || clockRunning} onClick={() => send('CLOCK_ADJUST', { deltaMs: 5_000 })}>
                  <KeyboardArrowUp />
                </IconButton>
                <IconButton disabled={disabled || clockRunning} onClick={() => send('CLOCK_ADJUST', { deltaMs: -5_000 })}>
                  <KeyboardArrowDown />
                </IconButton>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UndoIcon />}
                  disabled={disabled}
                  onClick={() => send(UNDO)}
                  sx={utilityButtonSx}
                >
                  Undo
                </Button>
              </Stack>

              <Button
                fullWidth
                variant="contained"
                disabled={disabled}
                onClick={toggleTimer}
                sx={{
                  mb: 1,
                  bgcolor: clockRunning ? WKF.stop : WKF.start,
                  color: WKF.ink,
                  fontWeight: 700,
                  '&:hover': { bgcolor: clockRunning ? WKF.stop : WKF.start, filter: 'brightness(0.92)' },
                }}
              >
                {clockRunning ? 'Stop' : 'Start'}
              </Button>

              <Button
                fullWidth
                variant="contained"
                disabled={disabled}
                onClick={guarded('Start the KO timer', toggleKoTimer)}
                sx={{
                  mb: 1,
                  bgcolor: WKF.koTimer,
                  color: WKF.ink,
                  fontWeight: 700,
                  outline: view.koActive ? `3px solid ${WKF.timerInk}` : 'none',
                  '&:hover': { bgcolor: WKF.koTimer, filter: 'brightness(0.92)' },
                }}
              >
                KO Timer
              </Button>

              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Reset the time', resetTime)} sx={utilityButtonSx}>Reset time</Button>
                <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Switch to extra time', () => useDuration((view.rules || DEFAULT_RULES).extraTimeMs))} sx={utilityButtonSx}>Extra time</Button>
              </Stack>
              <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Set the clock to 60 seconds', () => useDuration(60_000))} sx={{ ...utilityButtonSx, mt: 1 }}>
                60 seconds
              </Button>

              <Divider sx={{ my: 2 }} />

              <Typography variant="caption" display="block" sx={{ mb: 1 }}>Match time</Typography>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center' }}>
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || clockRunning}
                  value={durationMinutes}
                  onChange={(e) => setMatchDuration(Number(e.target.value) || 0, durationSeconds)}
                  sx={boardFieldSx}
                  inputProps={{ min: 0, style: { textAlign: 'center', width: 40 } }}
                />
                <Typography>:</Typography>
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || clockRunning}
                  value={durationSeconds}
                  onChange={(e) => setMatchDuration(durationMinutes, Number(e.target.value) || 0)}
                  sx={boardFieldSx}
                  inputProps={{ min: 0, max: 59, style: { textAlign: 'center', width: 40 } }}
                />
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ ...boardPaperSx, p: 2 }}>
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>Field number</Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  value={fieldNumberDraft}
                  disabled={disabled}
                  onChange={(e) => setFieldNumberDraft(e.target.value)}
                  sx={boardFieldSx}
                  inputProps={{ style: { textAlign: 'center' } }}
                />
                <Button variant="outlined" disabled={disabled} onClick={guarded('Change the field number', commitFieldNumber)} sx={utilityButtonSx}>Set</Button>
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ ...boardPaperSx, p: 2 }}>
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>External scoreboard</Typography>
              <Button
                fullWidth
                variant="contained"
                disabled={disabled}
                onClick={guarded(view.scoreboardActive ? 'Close the external scoreboard' : 'Start the external scoreboard', toggleScoreboard)}
                sx={{
                  bgcolor: view.scoreboardActive ? WKF.scoreboardClose : WKF.scoreboardStart,
                  color: WKF.ink,
                  fontWeight: 700,
                  '&:hover': {
                    bgcolor: view.scoreboardActive ? WKF.scoreboardClose : WKF.scoreboardStart,
                    filter: 'brightness(0.92)',
                  },
                }}
              >
                {view.scoreboardActive ? 'Close scoreboard' : 'Start scoreboard'}
              </Button>
            </Paper>

            <Button
              variant="outlined"
              startIcon={<Gavel />}
              disabled={disabled}
              onClick={() => setDecisionOpen(true)}
              sx={utilityButtonSx}
            >
              Decision
            </Button>

            <Button variant="outlined" onClick={guarded('Close and finalize the match', handleClose)} sx={utilityButtonSx}>Close</Button>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          {renderSide('aka', redComp, WKF.aka, WKF.akaControl)}
        </Grid>
      </Grid>

      <Dialog open={decisionOpen} onClose={() => setDecisionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Referee decision</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            These override the score. Kiken and shikkaku name the contestant who is out.
          </Typography>
          <Stack spacing={2}>
            {[
              { cmd: 'KIKEN', label: 'Kiken (withdrawal)' },
              { cmd: 'SHIKKAKU', label: 'Shikkaku (disqualification)' },
              { cmd: 'HANTEI', label: 'Hantei (decision \u2014 names the winner)' },
            ].map(({ cmd, label }) => (
              <Box key={cmd}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{label}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  <Button
                    fullWidth variant="contained"
                    onClick={() => declare(cmd, 'ao')}
                    sx={{ bgcolor: WKF.ao, color: WKF.onPanel, '&:hover': { bgcolor: WKF.ao, filter: 'brightness(1.15)' } }}
                  >
                    Ao
                  </Button>
                  <Button
                    fullWidth variant="contained"
                    onClick={() => declare(cmd, 'aka')}
                    sx={{ bgcolor: WKF.aka, color: WKF.onPanel, '&:hover': { bgcolor: WKF.aka, filter: 'brightness(1.15)' } }}
                  >
                    Aka
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          {view.decision && (
            <Button onClick={() => { send('CLEAR_DECISION'); setDecisionOpen(false) }}>
              Clear decision
            </Button>
          )}
          <Button onClick={() => setDecisionOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)}>
        <DialogTitle>Match clock is running</DialogTitle>
        <DialogContent>
          <Typography>
            {pendingAction?.label} while the clock is still running at {mainClock.display}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAction(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={confirmPendingAction}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
