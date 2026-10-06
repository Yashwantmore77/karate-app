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
import { settingsOf } from '@kumite/shared/tms.js'
import { boutOutcome } from '@kumite/shared/results.js'
import { tms } from '../../data/tms'

// A bout from a PRD draw, or any tournament with its own rules configured,
// is scored under those rules (PRD section 29); older matches keep the
// console's defaults.
export function matchRules(tournament, match) {
  if (!tournament || !(tournament.settings || match?.stage)) return null
  const s = settingsOf(tournament)
  return { durationMs: s.matchDurationSec * 1000, pointGap: s.pointGap }
}

/**
 * What the hall screen shows around the scores for a PRD bout (section 38):
 * its category, round and number, and the next bout on the same mat.
 */
export async function hallInfo(tournamentId, match) {
  const queue = await tms.matches(tournamentId, match.mat ? { mat: String(match.mat) } : {}).catch(() => [])
  const current = queue.find((m) => m.id === match.id)
  if (!current) return null
  const pending = queue.filter((m) => m.id !== match.id && !boutOutcome(m) && m.status !== 'cancelled' && m.redId && m.blueId)
  const next = pending.find((m) => Number(String(m.matchNumber).replace(/\D/g, '')) > Number(String(current.matchNumber).replace(/\D/g, ''))) || pending[0]
  const round = (m) => (m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName}`)
  return {
    category: current.categoryName,
    matchNumber: current.matchNumber,
    round: round(current),
    next: next ? { matchNumber: next.matchNumber, akaName: next.akaName, aoName: next.aoName, category: next.categoryName, round: round(next) } : null,
  }
}

export default function RefereeMatchControl({ uid, profile }) {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const [match, setMatch] = useState(null)
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [redComp, setRedComp] = useState(null)
  const [blueComp, setBlueComp] = useState(null)
  const [status, setStatus] = useState('hidden')
  const [displayInfo, setDisplayInfo] = useState(null)

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
      if (category?.divisionKey && tournament) setDisplayInfo(await hallInfo(tournament.id, match))
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
        rules={matchRules(tournament, match)}
        displayInfo={displayInfo}
      />

    </Box>
  )
}
