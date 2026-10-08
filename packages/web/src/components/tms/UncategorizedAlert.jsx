import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material'
import { Category } from '@mui/icons-material'

const EVENT = { kata: 'Kata', kumite: 'Kumite' }
const SHOWN = 10

/**
 * Players taking part whose entry has no category. The draw leaves them out,
 * so this says who, why, and where to fix it. `rows` are { playerId, name,
 * event, message }; `onFix(row)` opens that player's category, when the
 * screen can.
 */
export default function UncategorizedAlert({ rows = [], goTab, onFix, sx }) {
  if (!rows.length) return null
  const players = new Set(rows.map((r) => r.playerId)).size
  return (
    <Alert severity="warning" sx={sx}>
      <AlertTitle>
        {players} player{players === 1 ? ' has' : 's have'} no category, so the draw would leave them out
      </AlertTitle>
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        {rows.slice(0, SHOWN).map((r) => (
          <Stack key={`${r.playerId}-${r.event}`} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2"><b>{r.name}</b> · {EVENT[r.event] || r.event}: {r.message}</Typography>
            {onFix && <Button size="small" startIcon={<Category fontSize="small" />} onClick={() => onFix(r)}>Fix category</Button>}
          </Stack>
        ))}
        {rows.length > SHOWN && <Typography variant="body2">…and {rows.length - SHOWN} more.</Typography>}
      </Stack>
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Usually a weight class is missing, or there is a gap between two classes (for example -40 KG then +45 KG leaves 40–45 kg uncovered).
          Add the class in Categories{onFix ? ', or choose their category with Fix category' : ', or choose their category in Registrations'}.
        </Typography>
        {goTab && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="outlined" color="inherit" onClick={() => goTab('categories')}>Open Categories</Button>
            {!onFix && <Button size="small" variant="outlined" color="inherit" onClick={() => goTab('registrations')}>Open Registrations</Button>}
          </Stack>
        )}
      </Box>
    </Alert>
  )
}
