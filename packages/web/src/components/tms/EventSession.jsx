import { useState } from 'react'
import { Stack, Chip, Button, Typography } from '@mui/material'
import { SwapHoriz } from '@mui/icons-material'
import { tournamentEvents, runningEvent } from '@kumite/shared/tms.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms } from '../../data/tms'
import ConfirmDialog from './ConfirmDialog'

const NAME = { kata: 'Kata', kumite: 'Kumite' }
// The session matters once bouts are drawn, until the tournament ends.
const SESSION_STAGES = ['ENTRIES_LOCKED', 'DRAW_GENERATED', 'READY', 'LIVE']

/** Whether a tournament runs Kata and Kumite sessions in turn, and is at that stage. */
export const hasSessions = (t) => tournamentEvents(t).length === 2 && (SESSION_STAGES.includes(t?.lifecycleStatus) || !!t?.drawLocked) && !['COMPLETED', 'ARCHIVED'].includes(t?.lifecycleStatus)

/**
 * Kata and Kumite take turns on the mats. Shows which is on now and, for
 * those who call the bouts, switches to the other. The server refuses while
 * something of the running event is called, under way or open.
 */
export default function EventSession({ tournament, role, action, reload, dense = false }) {
  const [confirm, setConfirm] = useState(false)
  if (!hasSessions(tournament)) return null
  const running = runningEvent(tournament)
  const other = running === 'kata' ? 'kumite' : 'kata'
  const switchTo = async () => {
    setConfirm(false)
    const done = await action.run(() => tms.setRunningEvent(tournament.id, other), `${NAME[other]} is on the mats now`)
    if (done) reload?.()
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
      <Chip color="secondary" label={`On the mats: ${NAME[running]}`} aria-label={`${NAME[running]} session running`} />
      {!dense && <Typography variant="body2" color="text.secondary">{NAME[other]} waits for its session.</Typography>}
      {can(role, P.MATCH_CALL) && (
        <Button size="small" variant="outlined" startIcon={<SwapHoriz />} disabled={action.busy} onClick={() => setConfirm(true)}>Switch to {NAME[other]}</Button>
      )}
      <ConfirmDialog open={confirm} title={`Switch the mats to ${NAME[other]}?`}
        message={`${NAME[running]} bouts and rounds wait until you switch back. Anything of ${NAME[running]} still called or under way has to finish first. Teams are told ${NAME[other]} is starting.`}
        confirmLabel={`Start ${NAME[other]}`} onConfirm={switchTo} onClose={() => setConfirm(false)} />
    </Stack>
  )
}
