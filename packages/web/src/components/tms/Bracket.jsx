import { Box, Paper, Typography } from '@mui/material'

const AKA = '#FF5B5B'
const AO = '#5B7BFF'

function Corner({ side, entrant, score, won }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, opacity: entrant ? 1 : 0.5, fontWeight: won ? 700 : 400 }}>
      <Box sx={{ width: 4, alignSelf: 'stretch', borderRadius: 1, bgcolor: side === 'aka' ? AKA : AO }} />
      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 'inherit' }} noWrap>{entrant?.name || 'TBD'}</Typography>
      {score != null && <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>{score}</Typography>}
      {won && <Typography variant="body2" aria-label="winner">✓</Typography>}
    </Box>
  )
}

/** Section 36: a knockout bracket, round by round, that fills in as results arrive. */
export default function Bracket({ rounds }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
      {rounds.map((round) => (
        <Box key={round.round} sx={{ minWidth: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{round.name}</Typography>
          {round.matches.map((m) => (
            <Paper key={m.key} variant="outlined" sx={{ py: 0.5 }}>
              {m.status === 'bye' ? (
                <Box sx={{ px: 1, py: 0.5 }}><Typography variant="body2">{(m.aka || m.ao)?.name} — bye</Typography></Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>{m.matchNumber || 'Awaiting players'}</Typography>
                  <Corner side="aka" entrant={m.aka} score={m.akaScore} won={m.winner === 'red'} />
                  <Corner side="ao" entrant={m.ao} score={m.aoScore} won={m.winner === 'blue'} />
                </>
              )}
            </Paper>
          ))}
        </Box>
      ))}
    </Box>
  )
}
