import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { useMatchClock } from '../../hooks/useMatchClock'
import { useServerNow } from '../../hooks/useServerNow'

const AKA = '#FF5B5B'
const AO = '#5B7BFF'
// A scoreboard not heard from for this long is shown as last known, not live.
const STALE_MS = 15_000

/**
 * One mat, live (KAN-428): the bout on it now with its score and clock while
 * its scoreboard shows it, then the bouts waiting, "Called" once called.
 */
export default function MatCard({ mat, now, next, board, show = 3 }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }} data-testid={`mat-${mat}`}>
      <Typography variant="h3" sx={{ mb: 1 }}>Mat {mat}</Typography>
      {now ? <NowOnMat bout={now} board={board} /> : <Typography color="text.secondary" sx={{ mb: 1 }}>Mat free</Typography>}
      {next.slice(0, show).map((m, i) => (
        <Box key={m.id} sx={{ py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{i === 0 ? 'Next' : 'Then'} · {m.matchNumber}</Typography>
            {m.calledAt && <Chip size="small" color="warning" label="Called" />}
            <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>{m.category}</Typography>
          </Stack>
          <Typography variant="body2"><Box component="span" sx={{ color: AKA }}>■</Box> {m.aka}  <Box component="span" sx={{ color: AO, ml: 1 }}>■</Box> {m.ao}</Typography>
        </Box>
      ))}
      {next.length > show && <Typography variant="body2" color="text.secondary" sx={{ pt: 0.75 }}>+{next.length - show} more</Typography>}
    </Paper>
  )
}

function NowOnMat({ bout, board }) {
  const clock = useMatchClock(board?.clock || null)
  const serverNow = useServerNow()
  const beat = typeof board?.heartbeatAt === 'number' ? board.heartbeatAt : Date.parse(board?.heartbeatAt)
  const fresh = !!board && (!Number.isFinite(beat) || serverNow() - beat < STALE_MS)
  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
        <Chip size="small" color="error" label={board && fresh ? '● LIVE' : 'NOW'} />
        {board?.clock && <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{clock.display}</Typography>}
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>{bout.matchNumber} · {bout.category} · {bout.stage === 'knockout' ? bout.roundName : `Pool ${bout.pool}`}</Typography>
      </Stack>
      <Side color={AKA} name={bout.aka} score={board?.akaScore} senshu={board?.senshu === 'aka'} />
      <Side color={AO} name={bout.ao} score={board?.aoScore} senshu={board?.senshu === 'ao'} />
      {board?.outcome && <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>{board.outcome}</Typography>}
    </Box>
  )
}

function Side({ color, name, score, senshu }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Box sx={{ width: 6, height: 28, bgcolor: color, borderRadius: 1 }} />
      <Typography variant="h4" sx={{ flex: 1 }} noWrap>{name || 'TBD'}{senshu ? ' · senshu' : ''}</Typography>
      {score != null && <Typography variant="h3" sx={{ fontVariantNumeric: 'tabular-nums' }}>{score}</Typography>}
    </Stack>
  )
}
