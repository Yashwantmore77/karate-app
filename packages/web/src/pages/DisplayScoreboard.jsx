import { useEffect, useState } from 'react'
import { Box, Typography, Stack, Chip } from '@mui/material'
import { displayRepo } from '../data/display'
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
  // ?mat=2: this screen shows mat 2 only (PRD v1 §17); without it, the latest bout.
  // Read straight from the address: the ?portal screen renders outside the router.
  const mat = Number(new URLSearchParams(window.location.search).get('mat')) || null
  const serverNow = useServerNow()
  const clock = useMatchClock(live?.clock)
  const [, setTick] = useState(0)

  useEffect(() => displayRepo.subscribe(setLive, { mat }), [mat])

  // A frozen scoreboard looks broken, so the clock keeps rendering; the badge
  // is what tells the hall the feed is no longer live.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const open = live?.status === 'open'
  const stale = open && live.heartbeatAt != null && serverNow() - live.heartbeatAt > STALE_AFTER_MS

  // PRD v1 §4: the scoreboard operator's announcement, shown on every state.
  const announcement = live?.message && (
    <Box sx={{ bgcolor: '#FFD54F', py: 1.5, px: 3, textAlign: 'center' }}>
      <Typography sx={{ color: '#111', fontSize: 34, fontWeight: 800 }}>{live.message}</Typography>
    </Box>
  )

  if (!open) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#111' }}>
        {announcement}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: '#888', fontSize: 40, fontWeight: 700 }}>{mat ? `Mat ${mat}: no live match` : 'No live match'}</Typography>
        </Box>
      </Box>
    )
  }

  const side = (name, score, bg, senshu, club) => (
    <Box sx={{
      flex: 1, bgcolor: bg, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', p: 4,
    }}>
      <Typography sx={{ color: WKF.onPanel, fontSize: 48, fontWeight: 700, textAlign: 'center' }}>
        {name}
      </Typography>
      {club && <Typography sx={{ color: WKF.onPanel, fontSize: 28, opacity: 0.85, textAlign: 'center' }}>{club}</Typography>}
      {senshu && <Chip label="SENSHU" sx={{ bgcolor: WKF.onPanel, fontWeight: 700, my: 1 }} />}
      <Typography sx={{ color: WKF.onPanel, fontSize: 200, fontWeight: 800, lineHeight: 1 }}>
        {score}
      </Typography>
    </Box>
  )

  const heading = [live.category, live.round, live.matchNumber].filter(Boolean).join('  ·  ')

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {announcement}
      {heading && (
        <Box sx={{ bgcolor: '#111', py: 1.5, textAlign: 'center' }}>
          <Typography sx={{ color: '#FFF', fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>{heading}</Typography>
        </Box>
      )}
      <Stack direction="row" sx={{ flex: 1 }}>
        {side(live.aoName, live.aoScore, WKF.ao, live.senshu === 'ao', live.aoClub)}
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
        {side(live.akaName, live.akaScore, WKF.aka, live.senshu === 'aka', live.akaClub)}
      </Stack>
      {(live.outcome || live.next) && (
        <Box sx={{ bgcolor: '#111', py: 1.5, px: 3, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ color: '#7BE8A3', fontSize: 30, fontWeight: 800 }}>{live.outcome || ''}</Typography>
          {live.next && (
            <Typography sx={{ color: '#DDD', fontSize: 28 }}>
              NEXT {live.next.matchNumber}: <Box component="span" sx={{ color: '#FF6B6B' }}>AKA {live.next.akaName}</Box> vs <Box component="span" sx={{ color: '#7B9BFF' }}>AO {live.next.aoName}</Box>
              {live.next.category && live.next.category !== live.category ? ` · ${live.next.category}` : ''}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
