import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Container, Box, AppBar, Toolbar, Typography, Button, Paper, Grid, Card, CardContent, Alert, IconButton, Chip } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import { signOut, auth, JUDGE_COUNT } from '../../firebase'
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
    let allMatches = []
    let allCategories = []
    let allTournaments = []
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      allTournaments = JSON.parse(stored)
      allTournaments.forEach(t => {
        const catStored = localStorage.getItem(`categories-${t.id}`)
        if (catStored) {
          const cats = JSON.parse(catStored)
          allCategories = [...allCategories, ...cats]
          cats.forEach(cat => {
            const matchStored = localStorage.getItem(`matches-${cat.id}`)
            if (matchStored) {
              const matches = JSON.parse(matchStored)
              allMatches = [...allMatches, ...matches.map(m => ({ ...m, categoryId: cat.id }))]
            }
          })
        }
      })
    }
    const m = allMatches.find(x => x.id === matchId)
    if (m) {
      setMatch(m)
      setStatus(m.status === 'completed' ? 'revealed' : (localStorage.getItem(`match-control-${matchId}`) || 'hidden'))
      const cat = allCategories.find(c => c.id === m.categoryId)
      setCategory(cat)
      if (cat) setTournament(allTournaments.find(t => t.id === cat.tournamentId))
      const compStored = localStorage.getItem(`competitors-${m.categoryId}`)
      if (compStored) {
        const comps = JSON.parse(compStored)
        setRedComp(comps.find(c => c.id === m.redId))
        setBlueComp(comps.find(c => c.id === m.blueId))
      }
    }
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

  const updateMatchRecord = (updates) => {
    const stored = localStorage.getItem(`matches-${match.categoryId}`)
    if (!stored) return
    const matches = JSON.parse(stored)
    const updated = matches.map(m => (m.id === matchId ? { ...m, ...updates } : m))
    localStorage.setItem(`matches-${match.categoryId}`, JSON.stringify(updated))
  }

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
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate(-1)} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Kumite WKF</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{category?.name}</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

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
