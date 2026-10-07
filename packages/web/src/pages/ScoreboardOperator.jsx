import { useEffect, useState } from 'react'
import { Container, Typography, Paper, Stack, TextField, Button, Box, Chip, MenuItem } from '@mui/material'
import { OpenInNew } from '@mui/icons-material'
import { displayRepo } from '../data/display'
import { httpPatch } from '../data/http'
import useAction from '../components/tms/useAction'
import { HelpTitle } from '../components/help/InfoTip'

/**
 * PRD v1 §4, the scoreboard operator: runs the hall screens. They see what
 * is on, put an announcement on the scoreboard and open the screens; scores
 * stay the referee's.
 */
const MATS = [1, 2, 3, 4, 5, 6, 7, 8]

export default function ScoreboardOperator() {
  const action = useAction()
  const [display, setDisplay] = useState(null)
  const [message, setMessage] = useState('')
  // '' = the whole hall; a number = that mat's screen only (PRD v1 §17).
  const [target, setTarget] = useState('')
  useEffect(() => displayRepo.subscribe((row) => setDisplay(row), { mat: target || null }), [target])
  // The box shows the screen's current announcement until the operator types.
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDirty(false) }, [target])
  useEffect(() => { if (!dirty) setMessage(display?.message || '') }, [target, display?.message, dirty])

  const send = (text) => action.run(async () => { setDirty(false); return httpPatch(`/display/message${target ? `?mat=${target}` : ''}`, { message: text || null }) }, text ? 'Announcement shown' : 'Announcement cleared')

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <HelpTitle id="scoreboard.operator" variant="h1" gutterBottom>Scoreboard control</HelpTitle>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          <HelpTitle id="scoreboard.now" variant="h3" sx={{ flex: 1 }}>On the scoreboard now</HelpTitle>
          <TextField select size="small" label="Screen" value={target} sx={{ minWidth: 160 }} onChange={(e) => setTarget(e.target.value)}>
            <MenuItem value="">Whole hall</MenuItem>
            {MATS.map((m) => <MenuItem key={m} value={m}>Mat {m}</MenuItem>)}
          </TextField>
        </Stack>
        {display && display.status === 'open' ? (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip label={[display.category, display.matchNumber].filter(Boolean).join(' · ') || 'Live'} color="error" />
            <Box><b style={{ color: '#FF5B5B' }}>AKA</b> {display.akaName || '—'} {display.akaClub ? `(${display.akaClub})` : ''} — {display.akaScore ?? 0}</Box>
            <Box><b style={{ color: '#5B7BFF' }}>AO</b> {display.aoName || '—'} {display.aoClub ? `(${display.aoClub})` : ''} — {display.aoScore ?? 0}</Box>
          </Stack>
        ) : <Typography color="text.secondary">No bout is on the scoreboard.</Typography>}
        {display?.message && <Typography sx={{ mt: 1 }}>Announcement: <b>{display.message}</b></Typography>}
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h3" gutterBottom>Announcement {target ? `for mat ${target}` : 'for the whole hall'}</Typography>
        {target && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>A mat&apos;s own announcement replaces the hall announcement on that mat&apos;s screen.</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField fullWidth label="Message for the hall (e.g. Mat 2: finals start at 3 pm)" value={message} slotProps={{ htmlInput: { maxLength: 200 } }}
            onChange={(e) => { setDirty(true); setMessage(e.target.value) }} onKeyDown={(e) => e.key === 'Enter' && send(message.trim())} />
          <Button variant="contained" onClick={() => send(message.trim())} disabled={action.busy || !message.trim()}>Show</Button>
          <Button onClick={() => { setMessage(''); send('') }} disabled={action.busy}>Clear</Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <HelpTitle id="scoreboard.screens" variant="h3" gutterBottom>Screens</HelpTitle>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" endIcon={<OpenInNew />} href="/display" target="_blank">Hall scoreboard (latest bout)</Button>
          {MATS.map((m) => <Button key={m} variant="outlined" endIcon={<OpenInNew />} href={`/display?mat=${m}`} target="_blank">Mat {m}</Button>)}
          <Button variant="outlined" endIcon={<OpenInNew />} href="/live" target="_blank">Live board (every mat)</Button>
          <Button variant="outlined" endIcon={<OpenInNew />} href="/tournaments" target="_blank">Public site</Button>
        </Stack>
      </Paper>
      {action.feedback}
    </Container>
  )
}
