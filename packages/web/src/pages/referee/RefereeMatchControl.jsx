import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Toolbar, Typography, IconButton } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { matches as matchStore } from '../../data/domain'
import { useMatchRecord } from '../../hooks/useMatchRecord'
import { isExpired } from '../../utils/dateUtils'
import KumiteConsole from '../../features/console/KumiteConsole'
import { settingsOf, parseDivisionKey } from '@kumite/shared/tms.js'
import { boutOutcome } from '@kumite/shared/results.js'
import { tms } from '../../data/tms'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

// A bout from a PRD draw, or any tournament with its own rules configured,
// is scored under those rules (PRD section 29); older matches keep the
// console's defaults.
export function matchRules(tournament, match, category = null) {
  if (!tournament || !(tournament.settings || match?.stage || category?.rules)) return null
  // A category's own rules (PRD point 3), written when its bouts were made,
  // win over the tournament's.
  const s = { ...settingsOf(tournament), ...(category?.rules || {}) }
  // PRD v1 §6: overtime, senshu and the penalty ladder come from the tournament's ruleset too.
  return {
    durationMs: s.matchDurationSec * 1000, pointGap: s.pointGap, points: s.points,
    senshu: s.senshu !== false, overtime: s.overtime, extraTimeMs: (s.extraTimeSec || 60) * 1000,
    penaltyCategories: s.penaltyCategories, penaltyLadder: Array.isArray(s.penaltyLadder) ? s.penaltyLadder : undefined,
  }
}

/**
 * What the hall screen shows around the scores for a PRD bout (section 38):
 * its category, round and number, and the next bout on the same mat.
 */
export async function hallInfo(tournamentId, match) {
  const queue = await tms.matches(tournamentId, match.mat ? { mat: String(match.mat) } : {}).catch(() => [])
  const current = queue.find((m) => m.id === match.id)
  if (!current) return null
  // The next bout of the same event: Kata and Kumite take turns on the mats.
  const event = (m) => (m.divisionKey ? parseDivisionKey(m.divisionKey).event : null)
  const pending = queue.filter((m) => m.id !== match.id && !boutOutcome(m) && m.status !== 'cancelled' && m.redId && m.blueId && event(m) === event(current))
  const number = (m) => Number(String(m.matchNumber).replace(/\D/g, ''))
  const next = pending.find((m) => number(m) > number(current)) || pending[0]
  const round = (m) => (m.stage === 'knockout' ? m.roundName : `Pool ${m.poolName}`)
  return {
    category: current.categoryName,
    matchNumber: current.matchNumber,
    round: round(current),
    next: next ? { matchNumber: next.matchNumber, akaName: next.akaName, aoName: next.aoName, category: next.categoryName, round: round(next) } : null,
  }
}

export default function RefereeMatchControl() {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const { match, category, tournament, redComp, blueComp, loading } = useMatchRecord(matchId)
  const [displayInfo, setDisplayInfo] = useState(null)

  useEffect(() => {
    if (!match || !tournament || !category?.divisionKey) return undefined
    let alive = true
    hallInfo(tournament.id, match).then((info) => { if (alive) setDisplayInfo(info) })
    return () => { alive = false }
  }, [match?.id, tournament?.id, category?.divisionKey])

  // Nothing until the read settles, rather than a "not found" that flashes up
  // on every load before the match arrives.
  if (loading) return <PageLoader label="Loading match…" />
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
          <IconButton color="inherit" aria-label="Back" onClick={() => navigate(-1)} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <HelpTitle id="console" variant="h6">Kumite WKF</HelpTitle>
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
        rules={matchRules(tournament, match, category)}
        displayInfo={displayInfo}
      />
    </Box>
  )
}
