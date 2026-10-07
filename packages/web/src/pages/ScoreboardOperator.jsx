import { useEffect, useState } from 'react'
import { Container, Typography, Paper, Stack, TextField, Button, Box, Chip } from '@mui/material'
import { OpenInNew } from '@mui/icons-material'
import { displayRepo } from '../data/display'
import { httpPatch } from '../data/http'
import useAction from '../components/tms/useAction'

/**
 * PRD v1 §4, the scoreboard operator: runs the hall screens. They see what
 * is on, put an announcement on the scoreboard and open the screens; scores
 * stay the referee's.
 */
export default function ScoreboardOperator() {
  const action = useAction()
  const [display, setDisplay] = useState(null)
  const [message, setMessage] = useState('')
  useEffect(() => displayRepo.subscribe((row) => setDisplay(row)), [])
  useEffect(() => { setMessage((m) => m || display?.message || '') }, [display?.message])

  const send = (text) => action.run(() => httpPatch('/display/message', { message: text || null }), text ? 'Announcement shown' : 'Announcement cleared')

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>Scoreboard control</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h3" gutterBottom>On the scoreboard now</Typography>
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
        <Typography variant="h3" gutterBottom>Announcement</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField fullWidth label="Message for the hall (e.g. Mat 2: finals start at 3 pm)" value={message} slotProps={{ htmlInput: { maxLength: 200 } }}
            onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(message.trim())} />
          <Button variant="contained" onClick={() => send(message.trim())} disabled={action.busy || !message.trim()}>Show</Button>
          <Button onClick={() => { setMessage(''); send('') }} disabled={action.busy}>Clear</Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Screens</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" endIcon={<OpenInNew />} href="/display" target="_blank">Scoreboard</Button>
          <Button variant="outlined" endIcon={<OpenInNew />} href="/live" target="_blank">Live board (every mat)</Button>
          <Button variant="outlined" endIcon={<OpenInNew />} href="/tournaments" target="_blank">Public site</Button>
        </Stack>
      </Paper>
      {action.feedback}
    </Container>
  )
}
