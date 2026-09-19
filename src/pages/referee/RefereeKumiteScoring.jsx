import { useEffect, useState } from 'react'
import {
  Box, Container, Grid, Paper, Button, IconButton, Typography, Checkbox,
  FormControlLabel, TextField, Divider, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material'
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material'

const POINT_BUTTONS = [
  { key: 'ippon', label: 'Ippon', value: 3 },
  { key: 'wazaAri', label: 'Waza-ari', value: 2 },
  { key: 'yuko', label: 'Yuko', value: 1 },
]

const PENALTY_STEPS = ['C', 'K', 'HC', 'H']
const PENALTY_CATEGORIES = ['Category 1', 'Category 2']

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

const DEFAULT_MATCH_SECONDS = 90 // 1:30
const EXTRA_TIME_SECONDS = 60 // 1:00 encho
const KO_TIMER_SECONDS = 180 // 3:00 injury assessment

const emptyPenalties = () => ({ 'Category 1': 0, 'Category 2': 0 })

const defaultState = () => ({
  aoScore: 0,
  akaScore: 0,
  senshu: null, // 'ao' | 'aka' | null
  aoPenalties: emptyPenalties(),
  akaPenalties: emptyPenalties(),
  matchSeconds: DEFAULT_MATCH_SECONDS,
  timeRemaining: DEFAULT_MATCH_SECONDS,
  timerRunning: false,
  koTimerActive: false,
  koTimeRemaining: KO_TIMER_SECONDS,
  fieldNumber: '1',
  scoreboardActive: false,
})

const formatTime = (totalSeconds) => {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function RefereeKumiteScoring({
  matchId, tournament, redComp, blueComp, tournamentExpired, onBack, onFinalize
}) {
  const storageKey = `kumite-${matchId}`
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved ? { ...defaultState(), ...JSON.parse(saved) } : defaultState()
  })
  const [fieldNumberDraft, setFieldNumberDraft] = useState(state.fieldNumber)
  const [pendingAction, setPendingAction] = useState(null)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
    if (state.scoreboardActive) {
      localStorage.setItem('live-scoreboard', JSON.stringify({
        status: 'open',
        matchId,
        fieldNumber: state.fieldNumber,
        aoName: blueComp?.name,
        akaName: redComp?.name,
        aoScore: state.aoScore,
        akaScore: state.akaScore,
        senshu: state.senshu,
        timeDisplay: state.koTimerActive ? formatTime(state.koTimeRemaining) : formatTime(state.timeRemaining),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Main match clock
  useEffect(() => {
    if (!state.timerRunning || state.koTimerActive) return
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.timeRemaining <= 1) return { ...prev, timeRemaining: 0, timerRunning: false }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state.timerRunning, state.koTimerActive])

  // KO / injury timer
  useEffect(() => {
    if (!state.koTimerActive) return
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.koTimeRemaining <= 1) return { ...prev, koTimeRemaining: 0, koTimerActive: false }
        return { ...prev, koTimeRemaining: prev.koTimeRemaining - 1 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state.koTimerActive])

  const disabled = tournamentExpired

  const awardPoint = (side, value) => {
    setState((prev) => {
      const scoreKey = side === 'ao' ? 'aoScore' : 'akaScore'
      return {
        ...prev,
        [scoreKey]: prev[scoreKey] + value,
        senshu: prev.senshu ?? side,
      }
    })
  }

  const deductPoint = (side) => {
    setState((prev) => {
      const scoreKey = side === 'ao' ? 'aoScore' : 'akaScore'
      return { ...prev, [scoreKey]: Math.max(0, prev[scoreKey] - 1) }
    })
  }

  const toggleSenshu = (side) => {
    setState((prev) => ({ ...prev, senshu: prev.senshu === side ? null : side }))
  }

  const togglePenalty = (side, category, stepIndex) => {
    setState((prev) => {
      const key = side === 'ao' ? 'aoPenalties' : 'akaPenalties'
      const clickedLevel = stepIndex + 1
      const currentLevel = prev[key][category]
      const newLevel = currentLevel === clickedLevel ? clickedLevel - 1 : clickedLevel
      return { ...prev, [key]: { ...prev[key], [category]: newLevel } }
    })
  }

  const toggleTimer = () => setState((prev) => ({ ...prev, timerRunning: !prev.timerRunning }))

  const resetTime = () => setState((prev) => ({ ...prev, timeRemaining: prev.matchSeconds, timerRunning: false }))

  const setExtraTime = () => setState((prev) => ({
    ...prev, matchSeconds: EXTRA_TIME_SECONDS, timeRemaining: EXTRA_TIME_SECONDS, timerRunning: false
  }))

  const setSixtySeconds = () => setState((prev) => ({
    ...prev, matchSeconds: 60, timeRemaining: 60, timerRunning: false
  }))

  const adjustTime = (delta) => setState((prev) => ({
    ...prev, timeRemaining: Math.max(0, prev.timeRemaining + delta)
  }))

  const setMatchDuration = (minutes, seconds) => {
    const total = Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds))
    setState((prev) => ({ ...prev, matchSeconds: total, timeRemaining: total }))
  }

  const toggleKoTimer = () => setState((prev) => ({
    ...prev,
    koTimerActive: !prev.koTimerActive,
    koTimeRemaining: prev.koTimerActive ? prev.koTimeRemaining : KO_TIMER_SECONDS,
  }))

  const commitFieldNumber = () => setState((prev) => ({ ...prev, fieldNumber: fieldNumberDraft }))

  const toggleScoreboard = () => setState((prev) => {
    const next = !prev.scoreboardActive
    if (!next) {
      localStorage.setItem('live-scoreboard', JSON.stringify({ status: 'closed' }))
    }
    return { ...prev, scoreboardActive: next }
  })

  const handleClose = () => {
    const winner = state.akaScore > state.aoScore ? 'red'
      : state.aoScore > state.akaScore ? 'blue'
      : state.senshu === 'aka' ? 'red'
      : state.senshu === 'ao' ? 'blue'
      : 'tie'
    onFinalize({ status: 'completed', winner, avgRed: state.akaScore, avgBlue: state.aoScore })
    onBack()
  }

  // Anything that disrupts a match in progress needs confirming while the
  // clock runs; scoring stays immediate so the referee is never slowed down.
  const guarded = (label, run) => () => {
    if (state.timerRunning) setPendingAction({ label, run })
    else run()
  }

  const confirmPendingAction = () => {
    pendingAction.run()
    setPendingAction(null)
  }

  const matchMinutes = Math.floor(state.matchSeconds / 60)
  const matchSecondsPart = state.matchSeconds % 60

  const renderPenaltyRow = (side, category) => {
    const level = (side === 'ao' ? state.aoPenalties : state.akaPenalties)[category]
    return (
      <Stack direction="row" spacing={1} key={category} alignItems="center">
        <Typography variant="caption" sx={{ width: 72, color: WKF.onPanel, fontWeight: 700 }}>{category}</Typography>
        {PENALTY_STEPS.map((step, idx) => (
          <FormControlLabel
            key={step}
            sx={{ mr: 0.5 }}
            control={
              <Checkbox
                size="small"
                checked={level >= idx + 1}
                disabled={disabled}
                onChange={() => togglePenalty(side, category, idx)}
                sx={panelCheckboxSx}
              />
            }
            label={<Typography variant="caption" sx={{ color: WKF.onPanel, fontWeight: 700 }}>{step}</Typography>}
          />
        ))}
      </Stack>
    )
  }

  const renderSide = (side, comp, score, bg, control) => (
    <Paper elevation={0} sx={{ p: 2, bgcolor: bg, borderRadius: 2, textAlign: 'center', height: '100%' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: WKF.onPanel }}>{side === 'ao' ? 'Ao' : 'Aka'}</Typography>
      <Typography variant="subtitle1" sx={{ color: WKF.onPanel, mb: 1 }}>{comp?.name} • #{comp?.bib}</Typography>

      <FormControlLabel
        sx={{ mb: 1, color: WKF.onPanel }}
        control={
          <Checkbox checked={state.senshu === side} disabled={disabled} onChange={() => toggleSenshu(side)} sx={panelCheckboxSx} />
        }
        label="Senshu"
      />

      <Typography variant="h1" sx={{ fontSize: 72, fontWeight: 800, color: WKF.onPanel, my: 1 }}>{score}</Typography>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {POINT_BUTTONS.map((p) => (
          <Button
            key={p.key}
            variant="contained"
            disabled={disabled}
            onClick={() => awardPoint(side, p.value)}
            sx={{ bgcolor: control, color: WKF.ink, fontWeight: 700, '&:hover': { bgcolor: control, filter: 'brightness(0.92)' } }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          variant="contained"
          disabled={disabled}
          onClick={() => deductPoint(side)}
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
          {renderSide('ao', blueComp, state.aoScore, WKF.ao, WKF.aoControl)}
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h1" sx={{ fontSize: 56, fontWeight: 800, color: WKF.timerInk }}>
                {state.koTimerActive ? formatTime(state.koTimeRemaining) : formatTime(state.timeRemaining)}
              </Typography>

              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 1 }}>
                <IconButton disabled={disabled || state.timerRunning} onClick={() => adjustTime(5)}>
                  <KeyboardArrowUp />
                </IconButton>
                <IconButton disabled={disabled || state.timerRunning} onClick={() => adjustTime(-5)}>
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
                  bgcolor: state.timerRunning ? WKF.stop : WKF.start,
                  color: WKF.ink,
                  fontWeight: 700,
                  '&:hover': { bgcolor: state.timerRunning ? WKF.stop : WKF.start, filter: 'brightness(0.92)' },
                }}
              >
                {state.timerRunning ? 'Stop' : 'Start'}
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
                  outline: state.koTimerActive ? `3px solid ${WKF.timerInk}` : 'none',
                  '&:hover': { bgcolor: WKF.koTimer, filter: 'brightness(0.92)' },
                }}
              >
                KO Timer
              </Button>

              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Reset the time', resetTime)} sx={utilityButtonSx}>Reset time</Button>
                <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Switch to extra time', setExtraTime)} sx={utilityButtonSx}>Extra time</Button>
              </Stack>
              <Button fullWidth variant="outlined" disabled={disabled} onClick={guarded('Set the clock to 60 seconds', setSixtySeconds)} sx={{ ...utilityButtonSx, mt: 1 }}>
                60 seconds
              </Button>

              <Divider sx={{ my: 2 }} />

              <Typography variant="caption" display="block" sx={{ mb: 1 }}>Match time</Typography>
              <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || state.timerRunning}
                  value={matchMinutes}
                  onChange={(e) => setMatchDuration(Number(e.target.value) || 0, matchSecondsPart)}
                  inputProps={{ min: 0, style: { textAlign: 'center', width: 40 } }}
                />
                <Typography>:</Typography>
                <TextField
                  size="small"
                  type="number"
                  disabled={disabled || state.timerRunning}
                  value={matchSecondsPart}
                  onChange={(e) => setMatchDuration(matchMinutes, Number(e.target.value) || 0)}
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
          {renderSide('aka', redComp, state.akaScore, WKF.aka, WKF.akaControl)}
        </Grid>
      </Grid>

      <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)}>
        <DialogTitle>Match clock is running</DialogTitle>
        <DialogContent>
          <Typography>
            {pendingAction?.label} while the clock is still running at {formatTime(state.timeRemaining)}?
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
