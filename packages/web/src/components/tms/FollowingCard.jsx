import { Box, Chip, IconButton, Paper, Stack, Typography } from '@mui/material'
import { Close } from '@mui/icons-material'
import { athleteStatus } from './following'
import { humanize } from './StatusBadge'

const EVENT_NAME = { kata: 'Kata', kumite: 'Kumite' }
const TEAM_SHOWN = 5
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The athletes and clubs followed on this phone (KAN-428), at the top of the
 * public page: who is on a mat now with the score, who is called or next and
 * after how many bouts, and each one's latest result.
 */
export default function FollowingCard({ data, follow, queues, scoreOf }) {
  const players = follow.players.map((id) => data.players.find((p) => p.id === id)).filter(Boolean)
  const teams = follow.teams.map((id) => data.teams.find((tm) => tm.id === id)).filter(Boolean)
  if (!players.length && !teams.length) return null
  const teamName = Object.fromEntries(data.teams.map((tm) => [tm.id, tm.name]))
  const statusOf = (p) => athleteStatus(p.id, data.matches, queues)

  return (
    <Paper sx={{ p: 2, mb: 3 }} data-testid="following">
      <Typography variant="h3" sx={{ mb: 1 }}>Following</Typography>
      {players.map((p) => (
        <Athlete key={p.id} player={p} club={p.club || teamName[p.teamId]} status={statusOf(p)} scoreOf={scoreOf}
          onUnfollow={() => follow.toggle('players', p.id)} />
      ))}
      {teams.map((tm) => <Team key={tm.id} team={tm} data={data} statusOf={statusOf} scoreOf={scoreOf} onUnfollow={() => follow.toggle('teams', tm.id)} />)}
    </Paper>
  )
}

// A club: its athletes with a bout to come, the soonest first.
function Team({ team, data, statusOf, scoreOf, onUnfollow }) {
  const soon = (s) => (s.now ? -1 : s.next ? s.next.ahead : Infinity)
  const athletes = data.players.filter((p) => p.teamId === team.id).map((p) => ({ p, s: statusOf(p) }))
  const coming = athletes.filter(({ s }) => s.now || s.next || s.later).sort((a, b) => soon(a.s) - soon(b.s))
  const done = athletes.length - coming.length
  return (
    <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="h4" sx={{ flex: 1 }} noWrap>{team.name}</Typography>
        <IconButton size="small" aria-label={`Stop following ${team.name}`} data-tip="Stop following this club on this phone." onClick={onUnfollow}><Close fontSize="small" /></IconButton>
      </Stack>
      {coming.slice(0, TEAM_SHOWN).map(({ p, s }) => <Athlete key={p.id} player={p} status={s} scoreOf={scoreOf} />)}
      {coming.length > TEAM_SHOWN && <Typography variant="body2" color="text.secondary">+{coming.length - TEAM_SHOWN} more with a bout to come</Typography>}
      {done > 0 && <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>{plural(done, 'athlete')} with no bout to come</Typography>}
    </Box>
  )
}

function Athlete({ player, club, status, scoreOf, onUnfollow }) {
  const { now, next, later, latest } = status
  const board = now ? scoreOf(now.bout) : null
  const score = board && (now.side === 'aka' ? `${board.akaScore}–${board.aoScore}` : `${board.aoScore}–${board.akaScore}`)
  return (
    <Box sx={{ py: 1, borderTop: '1px solid', borderColor: 'divider' }} data-testid={`follow-${player.id}`}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 700 }} noWrap>{player.name}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>{club}</Typography>
        {onUnfollow && <IconButton size="small" aria-label={`Stop following ${player.name}`} data-tip="Stop following this athlete on this phone." onClick={onUnfollow}><Close fontSize="small" /></IconButton>}
      </Stack>
      {/* gap, not spacing: a wrapped line starts at the edge. */}
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, rowGap: 0.5 }}>
        {now && <Chip size="small" color="error" label={`● On Mat ${now.mat} now`} />}
        {now && <Typography variant="body2">{now.bout.matchNumber} against {now.against}{score ? ` · ${score}` : ''}</Typography>}
        {!now && next?.bout.calledAt && <Chip size="small" color="warning" label="Called" />}
        {!now && next && <Typography variant="body2">Mat {next.mat} · {next.bout.matchNumber} against {next.against} · {next.ahead ? `${plural(next.ahead, 'bout')} before it` : 'next on the mat'}</Typography>}
        {later && <Typography variant="body2">Mat {later.mat} · {later.bout.matchNumber} against {later.against} · once {EVENT_NAME[later.bout.event] || 'its event'} is on the mats</Typography>}
        {!now && !next && !later && <Typography variant="body2" color="text.secondary">{status.bouts ? 'No bout to come' : 'No bouts yet'}</Typography>}
      </Stack>
      {latest && (
        <Typography variant="body2" color="text.secondary">
          {/* A walkover or kiken was not scored: its way of ending says more than 0–0. */}
          Last: {latest.result} {latest.bout.resultType && latest.bout.resultType !== 'COMPLETED' ? `(${humanize(latest.bout.resultType)})` : latest.score} against {latest.against} · {latest.bout.matchNumber}
        </Typography>
      )}
    </Box>
  )
}
