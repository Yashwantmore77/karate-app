import { useEffect, useState } from 'react'
import { Box, Typography, Stack, Chip } from '@mui/material'
import { displayRepo } from '../data/repo'
import { useMatchClock } from '../hooks/useMatchClock'
import { useServerNow } from '../hooks/useServerNow'

const WKF = {
  ao: '#0000C0',
  aka: '#C00000',
  onPanel: '#FFFFFF',
  timerInk: '#000040',
}

const STALE_AFTER_MS = 5_000

export default function DisplayScoreboard() {
  const [live, setLive] = useState(null)
  const serverNow = useServerNow()
  const clock = useMatchClock(live?.clock)
  const [, setTick] = useState(0)

  useEffect(() => displayRepo.subscribe(setLive), [])

  // A frozen scoreboard looks broken, so the clock keeps rendering; the badge
  // is what tells the hall the feed is no longer live.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const open = live?.status === 'open'
  const stale = open && live.heartbeatAt != null && serverNow() - live.heartbeatAt > STALE_AFTER_MS

  if (!open) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#111',
      }}>
        <Typography sx={{ color: '#888', fontSize: 40, fontWeight: 700 }}>No live match</Typography>
      </Box>
    )
  }

  const side = (name, score, bg, senshu) => (
    <Box sx={{
      flex: 1, bgcolor: bg, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', p: 4,
    }}>
      <Typography sx={{ color: WKF.onPanel, fontSize: 48, fontWeight: 700, textAlign: 'center' }}>
        {name}
      </Typography>
      {senshu && <Chip label="SENSHU" sx={{ bgcolor: WKF.onPanel, fontWeight: 700, my: 1 }} />}
      <Typography sx={{ color: WKF.onPanel, fontSize: 200, fontWeight: 800, lineHeight: 1 }}>
        {score}
      </Typography>
    </Box>
  )

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" sx={{ flex: 1 }}>
        {side(live.aoName, live.aoScore, WKF.ao, live.senshu === 'ao')}
        <Box sx={{
          width: 420, bgcolor: '#FFF', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography variant="h1" sx={{
            fontSize: 120, fontWeight: 800,
            color: stale ? '#9E9E9E' : WKF.timerInk,
          }}>
            {clock.display}
          </Typography>
          {stale
            ? <Chip label="NOT LIVE" color="warning" sx={{ fontWeight: 700 }} />
            : <Typography sx={{ color: '#666' }}>Field {live.fieldNumber}</Typography>}
        </Box>
        {side(live.akaName, live.akaScore, WKF.aka, live.senshu === 'aka')}
      </Stack>
    </Box>
  )
}
