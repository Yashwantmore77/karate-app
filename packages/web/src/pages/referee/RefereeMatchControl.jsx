import { useNavigate, useParams } from 'react-router-dom'
import { Box, Toolbar, Typography, IconButton } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { matches as matchStore } from '../../data/domain'
import { useMatchRecord } from '../../hooks/useMatchRecord'
import { isExpired } from '../../utils/dateUtils'
import KumiteConsole from '../../features/console/KumiteConsole'

export default function RefereeMatchControl() {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const { match, category, tournament, redComp, blueComp, loading } = useMatchRecord(matchId)

  // Nothing until the read settles, rather than a "not found" that flashes up
  // on every load before the match arrives.
  if (loading) return null
  if (!match || !redComp || !blueComp) return <div>Match not found</div>

  const tournamentExpired = !!tournament && isExpired(tournament.date)

  // How a bout ended is the one record that has to outlive this device, so it
  // goes to the server rather than staying in the console.
  const updateMatchRecord = (updates) =>
    matchStore.update(match.categoryId, matchId, updates)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate(-1)} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Kumite WKF</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{category?.name}</Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <KumiteConsole
        matchId={matchId}
        tournament={tournament}
        redComp={redComp}
        blueComp={blueComp}
        tournamentExpired={tournamentExpired}
        onBack={() => navigate(-1)}
        onFinalize={updateMatchRecord}
      />
    </Box>
  )
}
