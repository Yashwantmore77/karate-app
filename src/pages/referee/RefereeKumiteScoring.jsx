import { useEffect, useRef, useState } from 'react'
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
import { matchStateRepo, displayRepo, now } from '../../data/repo'

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
  matchId, redComp, blueComp, tournamentExpired, onBack, onFinalize
}) {
  const [state, setState] = useState(defaultState)
  const [fieldNumberDraft, setFieldNumberDraft] = useState('1')
  const [pendingAction, setPendingAction] = useState(null)
  const hydrated = useRef(false)

  // Re-render while a clock runs. The value is always recomputed from the
  // anchor, so a late tick shows the right number rather than drifting.
  const [, setTick] = useState(0)
  const ticking = state.clock.running || state.koActive

  useEffect(() => {
    let cancelled = false
    matchStateRepo.get(matchId).then((saved) => {
      if (!cancelled && saved) {
        const { id, createdAt, ...rest } = saved
        setState((prev) => ({ ...prev, ...rest }))
        if (rest.fieldNumber) setFieldNumberDraft(rest.fieldNumber)
      }
      hydrated.current = true
    })
    return () => { cancelled = true }
  }, [matchId])

  useEffect(() => {
    if (!hydrated.current) return
    matchStateRepo.put(matchId, state)
    if (state.scoreboardActive) {
      displayRepo.put({
        status: 'open',
        matchId,
        fieldNumber: state.fieldNumber,
        aoName: blueComp?.name,
        akaName: redComp?.name,
        aoScore: state.match.scores.ao,
        akaScore: state.match.scores.aka,
        senshu: state.match.senshu,
        clock: state.koActive ? state.koClock : state.clock,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => {
      setTick((t) => t + 1)
      setState((prev) => {
        const at = now()
        if (prev.koActive && remainingNow(prev.koClock, at) === 0) {
          return { ...prev, koActive: false, koClock: stopClock(prev.koClock, at) }
        }
        if (prev.clock.running && remainingNow(prev.clock, at) === 0) {
          return { ...prev, clock: stopClock(prev.clock, at) }
        }
        return prev
      })
    }, 100)
    return () => clearInterval(id)
  }, [ticking])

  const disabled = tournamentExpired
  const at = now()
  const clockRunning = state.clock.running
  const shownMs = state.koActive
    ? remainingNow(state.koClock, at)
    : remainingNow(state.clock, at)

  const editMatch = (fn) => setState((prev) => ({ ...prev, match: fn(prev.match) }))
  const editClock = (fn) => setState((prev) => ({ ...prev, clock: fn(prev.clock, now()) }))

  const toggleTimer = () => editClock(clockRunning ? stopClock : startClock)

  const resetTime = () => setState((prev) => ({
    ...prev, clock: makeClock(prev.durationMs)
  }))

  const useDuration = (durationMs) => setState((prev) => ({
    ...prev, durationMs, clock: makeClock(durationMs)
  }))

  const setMatchDuration = (minutes, seconds) => useDuration(parseDuration(minutes, seconds))

  const toggleKoTimer = () => setState((prev) => {
    const at2 = now()
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
    const { winner } = evaluateOutcome(state.match, DEFAULT_RULES, { expired: true })
    onFinalize({
      status: 'completed',
      winner: winner === 'aka' ? 'red' : winner === 'ao' ? 'blue' : 'tie',
      avgRed: state.match.scores.aka,
      avgBlue: state.match.scores.ao,
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

  const { minutes: durationMinutes, seconds: durationSeconds } = toMinutesSeconds(state.durationMs)

  const renderPenaltyRow = (side, category) => {
    const level = state.match.penalties[side][category]
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
            checked={state.match.senshu === side}
            disabled={disabled}
            onChange={() => editMatch((m) => setSenshu(m, side))}
            sx={panelCheckboxSx}
          />
        }
        label="Senshu"
      />

      <Typography variant="h1" sx={{ fontSize: 72, fontWeight: 800, color: WKF.onPanel, my: 1 }}>
        {state.match.scores[side]}
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
                  outline: state.koActive ? `3px solid ${WKF.timerInk}` : 'none',
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
                onClick={guarded(state.scoreboardActive ? 'Close the external scoreboard' : 'Start the external scoreboard', toggleScoreboard)}
                sx={{
                  bgcolor: state.scoreboardActive ? WKF.scoreboardClose : WKF.scoreboardStart,
                  color: WKF.ink,
                  fontWeight: 700,
                  '&:hover': {
                    bgcolor: state.scoreboardActive ? WKF.scoreboardClose : WKF.scoreboardStart,
                    filter: 'brightness(0.92)',
                  },
                }}
              >
                {state.scoreboardActive ? 'Close scoreboard' : 'Start scoreboard'}
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
            {pendingAction?.label} while the clock is still running at {formatClock(remainingNow(state.clock, at))}?
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
