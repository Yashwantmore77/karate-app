import { useEffect, useState } from 'react'
import {
  Container, Grid, Paper, Button, IconButton, Typography, Checkbox,
  FormControlLabel, TextField, Divider, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material'
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material'
import {
  makeMatchState, awardPoint, deductPoint, setSenshu, setPenalty, evaluateOutcome,
  POINTS, PENALTY_LADDER, PENALTY_CATEGORIES, DEFAULT_RULES
} from '../../shared/rules'
import {
  makeClock, remainingNow, startClock, stopClock, adjustClock, setClock
} from '../../shared/clock'
import { formatClock, toMinutesSeconds, parseDuration } from '../../shared/format'
import { displayRepo } from '../../data/repo'
import { useMatchState } from '../../hooks/useMatchState'
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

const panelCheckboxSx = {
  color: WKF.onPanel,
  '&.Mui-checked': { color: WKF.onPanel },
}

const DEFAULT_DURATION_MS = 90_000 // 1:30

const defaultState = () => ({
  match: makeMatchState(),
  clock: makeClock(DEFAULT_DURATION_MS),
  durationMs: DEFAULT_DURATION_MS,
  koActive: false,
  koClock: makeClock(DEFAULT_RULES.koTimerMs),
  fieldNumber: '1',
  scoreboardActive: false,
})

export default function RefereeKumiteScoring({
  matchId, redComp, blueComp, tournamentExpired, mode = 'control', onBack, onFinalize
}) {
  const [state, setState] = useMatchState(matchId, defaultState)
  const [fieldNumberDraft, setFieldNumberDraft] = useState('1')
  const [pendingAction, setPendingAction] = useState(null)
  const serverNow = useServerNow()

  const observing = mode === 'observe'
  const view = state || defaultState()
  const mainClock = useMatchClock(view.clock)
  const koClock = useMatchClock(view.koActive ? view.koClock : null)

  useEffect(() => {
    if (state?.fieldNumber) setFieldNumberDraft(state.fieldNumber)
  }, [state?.fieldNumber])

  // Only the controlling device writes. Everyone else reaches zero on their
  // own and simply displays it.
  useEffect(() => {
    if (observing || !state) return
    if (state.clock.running && mainClock.expired) {
      setState((prev) => ({ ...prev, clock: stopClock(prev.clock, serverNow()) }))
    }
    if (state.koActive && koClock.expired) {
      setState((prev) => ({ ...prev, koActive: false, koClock: stopClock(prev.koClock, serverNow()) }))
    }
  }, [observing, state, mainClock.expired, koClock.expired, setState, serverNow])

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
    })
    publish()
    const id = setInterval(publish, 2000)
    return () => clearInterval(id)
  }, [observing, state, matchId, blueComp?.name, redComp?.name, serverNow])

  const disabled = tournamentExpired || observing
  const clockRunning = view.clock.running
  const shownMs = view.koActive ? koClock.remainingMs : mainClock.remainingMs

  const editMatch = (fn) => setState((prev) => ({ ...prev, match: fn(prev.match) }))
  const editClock = (fn) => setState((prev) => ({ ...prev, clock: fn(prev.clock, serverNow()) }))

  const toggleTimer = () => editClock(clockRunning ? stopClock : startClock)

  const resetTime = () => setState((prev) => ({
    ...prev, clock: makeClock(prev.durationMs)
  }))

  const useDuration = (durationMs) => setState((prev) => ({
    ...prev, durationMs, clock: makeClock(durationMs)
  }))

  const setMatchDuration = (minutes, seconds) => useDuration(parseDuration(minutes, seconds))

  const toggleKoTimer = () => setState((prev) => {
    const at2 = serverNow()
    if (prev.koActive) {
      return { ...prev, koActive: false, koClock: stopClock(prev.koClock, at2) }
    }
    return {
      ...prev,
      koActive: true,
      koClock: startClock(makeClock(DEFAULT_RULES.koTimerMs), at2),
      clock: stopClock(prev.clock, at2),
    }
  })

  const commitFieldNumber = () => setState((prev) => ({ ...prev, fieldNumber: fieldNumberDraft }))

  const toggleScoreboard = () => setState((prev) => {
    const next = !prev.scoreboardActive
    if (!next) displayRepo.put({ status: 'closed' })
    return { ...prev, scoreboardActive: next }
  })

  const handleClose = () => {
    const { winner } = evaluateOutcome(view.match, DEFAULT_RULES, { expired: true })
    onFinalize({
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
                onChange={() => editMatch((m) => setPenalty(m, side, category, idx + 1))}
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
    <Paper elevation={0} sx={{ p: 2, bgcolor: bg, borderRadius: 2, textAlign: 'center', height: '100%' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: WKF.onPanel }}>{side === 'ao' ? 'Ao' : 'Aka'}</Typography>
      <Typography variant="subtitle1" sx={{ color: WKF.onPanel, mb: 1 }}>{comp?.name} • #{comp?.bib}</Typography>

      <FormControlLabel
        sx={{ mb: 1, color: WKF.onPanel }}
        control={
          <Checkbox
            checked={view.match.senshu === side}
            disabled={disabled}
            onChange={() => editMatch((m) => setSenshu(m, side))}
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
            onClick={() => editMatch((m) => awardPoint(m, side, p.key))}
            sx={{ bgcolor: control, color: WKF.ink, fontWeight: 700, '&:hover': { bgcolor: control, filter: 'brightness(0.92)' } }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          variant="contained"
          disabled={disabled}
          onClick={() => editMatch((m) => deductPoint(m, side))}
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

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {renderSide('ao', blueComp, WKF.ao, WKF.aoControl)}
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h1" sx={{ fontSize: 56, fontWeight: 800, color: WKF.timerInk }}>
                {formatClock(shownMs)}
              </Typography>

              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 1 }}>
                <IconButton disabled={disabled || clockRunning} onClick={() => editClock((c, t) => adjustClock(c, 5_000, t))}>
                  <KeyboardArrowUp />
                </IconButton>
                <IconButton disabled={disabled || clockRunning} onClick={() => editClock((c, t) => adjustClock(c, -5_000, t))}>
                  <KeyboardArrowDown />
                </IconButton>
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
                <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Switch to extra time', () => useDuration(DEFAULT_RULES.extraTimeMs))} sx={utilityButtonSx}>Extra time</Button>
              </Stack>
              <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Set the clock to 60 seconds', () => useDuration(60_000))} sx={{ ...utilityButtonSx, mt: 1 }}>
                60 seconds
              </Button>

              <Divider sx={{ my: 2 }} />

              <Typography variant="caption" display="block" sx={{ mb: 1 }}>Match time</Typography>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || clockRunning}
                  value={durationMinutes}
                  onChange={(e) => setMatchDuration(Number(e.target.value) || 0, durationSeconds)}
                  inputProps={{ min: 0, style: { textAlign: 'center', width: 40 } }}
                />
                <Typography>:</Typography>
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || clockRunning}
                  value={durationSeconds}
                  onChange={(e) => setMatchDuration(durationMinutes, Number(e.target.value) || 0)}
                  inputProps={{ min: 0, max: 59, style: { textAlign: 'center', width: 40 } }}
                />
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>Field number</Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  value={fieldNumberDraft}
                  disabled={disabled}
                  onChange={(e) => setFieldNumberDraft(e.target.value)}
                  inputProps={{ style: { textAlign: 'center' } }}
                />
                <Button variant="outlined" disabled={disabled} onClick={guarded('Change the field number', commitFieldNumber)} sx={utilityButtonSx}>Set</Button>
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
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

            <Button variant="outlined" onClick={guarded('Close and finalize the match', handleClose)} sx={utilityButtonSx}>Close</Button>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          {renderSide('aka', redComp, WKF.aka, WKF.akaControl)}
        </Grid>
      </Grid>

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
