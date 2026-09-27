import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Container, Box, Toolbar, Typography, Button, Paper, Grid, Card, CardContent, Alert, IconButton, Chip } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { JUDGE_COUNT } from '../../firebase'
import { competitors as competitorStore, matches as matchStore } from '../../data/domain'
import { findMatchContext } from '../../data/domain/tree'
import { isExpired } from '../../utils/dateUtils'
import { getScoreSpread, hasDisagreement, DISAGREEMENT_THRESHOLD } from '../../utils/scoring'
import KumiteConsole from '../../features/console/KumiteConsole'

export default function RefereeMatchControl({ uid, profile }) {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const [match, setMatch] = useState(null)
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [redComp, setRedComp] = useState(null)
  const [blueComp, setBlueComp] = useState(null)
  const [status, setStatus] = useState('hidden')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { match, category, tournament } = await findMatchContext(matchId)
      if (!match) return
      const roster = await competitorStore.list(match.categoryId)
      if (!alive) return

      setMatch(match)
      setStatus(match.status === 'completed'
        ? 'revealed'
        : (localStorage.getItem(`match-control-${matchId}`) || 'hidden'))
      setCategory(category)
      setTournament(tournament)
      setRedComp(roster.find(c => c.id === match.redId))
      setBlueComp(roster.find(c => c.id === match.blueId))
    })()
    return () => { alive = false }
  }, [matchId])

  const tournamentExpired = tournament && isExpired(tournament.date)

  // Collect all judge scores
  const allJudgeScores = { red: [], blue: [] }
  for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
    const judgeScore = localStorage.getItem(`judge-${seat}-${matchId}`)
    if (judgeScore) {
      const s = JSON.parse(judgeScore)
      if (s.competitor1 !== undefined) allJudgeScores.red.push(s.competitor1)
      if (s.competitor2 !== undefined) allJudgeScores.blue.push(s.competitor2)
    }
  }

  const avgRed = allJudgeScores.red.length > 0 ? allJudgeScores.red.reduce((a, b) => a + b, 0) / allJudgeScores.red.length : 0
  const avgBlue = allJudgeScores.blue.length > 0 ? allJudgeScores.blue.reduce((a, b) => a + b, 0) / allJudgeScores.blue.length : 0
  const winner = avgRed > avgBlue ? 'red' : avgBlue > avgRed ? 'blue' : 'tie'
  const judgesSubmitted = allJudgeScores.red.length

  const redDisagreement = hasDisagreement(allJudgeScores.red)
  const blueDisagreement = hasDisagreement(allJudgeScores.blue)
  const redSpread = getScoreSpread(allJudgeScores.red)
  const blueSpread = getScoreSpread(allJudgeScores.blue)

  // How a bout ended is the one record that has to outlive this device, so it
  // goes through the store rather than straight to local storage.
  const updateMatchRecord = (updates) =>
    matchStore.update(match.categoryId, matchId, updates)

  function openRound() {
    for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
      localStorage.removeItem(`judge-${seat}-${matchId}`)
    }
    setStatus('open')
    localStorage.setItem(`match-control-${matchId}`, 'open')
    updateMatchRecord({ status: 'open' })
  }

  function revealResults() {
    setStatus('revealed')
    localStorage.setItem(`match-control-${matchId}`, 'revealed')
    updateMatchRecord({ status: 'completed', winner, avgRed, avgBlue })
  }

  if (!match || !redComp || !blueComp) {
    return <div>Match not found</div>
  }

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
