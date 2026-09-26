import { useNavigate, useParams } from 'react-router-dom'
import { Box, AppBar, Toolbar, Typography, Button, IconButton, Chip } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'
import { useMatchRecord } from '../../hooks/useMatchRecord'
import KumiteConsole from '../../features/console/KumiteConsole'

// A judge sees the referee's console exactly as the referee does, with every
// control inert. Same component, so the two cannot drift apart.
export default function JudgeMatchView({ profile }) {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const { match, category, tournament, redComp, blueComp, loading } = useMatchRecord(matchId)

  if (loading) return null
  if (!match || !redComp || !blueComp) return <div>Match not found</div>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/judge')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Kumite WKF</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {category?.name} • Judge #{profile?.seat || '?'}
            </Typography>
          </Box>
          <Chip label="Watching" size="small" sx={{ mr: 2, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} />
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <KumiteConsole
        mode="observe"
        matchId={matchId}
        redComp={redComp}
        blueComp={blueComp}
        tournamentExpired={!!tournament && isExpired(tournament.date)}
        onBack={() => navigate('/judge')}
        onFinalize={() => {}}
      />
    </Box>
  )
}
