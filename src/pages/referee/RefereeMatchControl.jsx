import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Container, Box, AppBar, Toolbar, Typography, Button, Paper, Grid, Card, CardContent, Alert, IconButton, Chip } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import { signOut, auth, JUDGE_COUNT } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'
import { getScoreSpread, hasDisagreement, DISAGREEMENT_THRESHOLD } from '../../utils/scoring'

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
    let allTournaments = []
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      allTournaments = JSON.parse(stored)
      allTournaments.forEach(t => {
        const catStored = localStorage.getItem(`categories-${t.id}`)
        if (catStored) {
          JSON.parse(catStored).forEach(cat => {
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
      const catStored = localStorage.getItem(`categories-${m.categoryId}`)
      if (catStored) {
        const cats = JSON.parse(catStored)
        const cat = cats.find(c => c.id === m.categoryId)
        setCategory(cat)
        if (cat) setTournament(allTournaments.find(t => t.id === cat.tournamentId))
      }
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
            <Typography variant="h6">Match Control</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{category?.name}</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4, flex: 1 }}>
        {tournamentExpired && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Tournament expired on {new Date(tournament.date).toLocaleDateString()}. Match control is read-only.
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={5}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'error.dark' }}>{redComp.name}</Typography>
                  <Typography variant="h6" sx={{ mb: 2, color: 'error.dark' }}>#{redComp.bib}</Typography>
                  {status === 'revealed' && (
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.dark' }}>
                      {avgRed.toFixed(2)}
                    </Typography>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12} sm={2}>
                <Box sx={{ textAlign: 'center' }}>
                  <Chip
                    label={status}
                    color="primary"
                    sx={{ mb: 1, textTransform: 'uppercase', fontWeight: 700 }}
                  />
                  {status === 'open' && (
                    <Typography variant="caption" display="block" sx={{ color: 'primary.main', fontWeight: 600, mt: 1 }}>
                      {judgesSubmitted}/{JUDGE_COUNT} judges
                    </Typography>
                  )}
                </Box>
              </Grid>

              <Grid item xs={12} sm={5}>
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'info.dark' }}>{blueComp.name}</Typography>
                  <Typography variant="h6" sx={{ mb: 2, color: 'info.dark' }}>#{blueComp.bib}</Typography>
                  {status === 'revealed' && (
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.dark' }}>
                      {avgBlue.toFixed(2)}
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
          {status === 'hidden' && (
            <Button variant="contained" size="large" onClick={openRound} disabled={tournamentExpired}>
              Open Round
            </Button>
          )}
          {status === 'open' && (
            <Button variant="contained" size="large" onClick={revealResults} disabled={tournamentExpired || judgesSubmitted === 0}>
              Reveal Results {judgesSubmitted === 0 ? '(waiting for judges)' : ''}
            </Button>
          )}
          {status === 'revealed' && (
            <>
              {(redDisagreement || blueDisagreement) && (
                <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                  Judges disagree significantly on {redDisagreement && blueDisagreement ? 'both sides' : redDisagreement ? `${redComp.name}'s` : `${blueComp.name}'s`} score
                  {' '}(spread {redDisagreement ? redSpread.toFixed(1) : blueSpread.toFixed(1)}, threshold {DISAGREEMENT_THRESHOLD}). Consider reviewing before finalizing.
                </Alert>
              )}
              <Alert severity={winner === 'tie' ? 'info' : 'success'} sx={{ mb: 2 }}>
                {winner === 'tie' ? 'Tie' : `Winner: ${winner === 'red' ? redComp.name : blueComp.name}`}
              </Alert>
              <Button variant="outlined" size="large" onClick={openRound} disabled={tournamentExpired}>
                Re-Open Match
              </Button>
            </>
          )}
        </Paper>
      </Container>
    </Box>
  )
}
