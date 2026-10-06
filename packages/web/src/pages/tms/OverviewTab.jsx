import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Stack, Button, Box, List, ListItem, ListItemText, Divider, Alert, Link } from '@mui/material'
import { TOURNAMENT_STATUS, tournamentLifecycle } from '@kumite/shared/lifecycle.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms } from '../../data/tms'
import StatCard from '../../components/tms/StatCard'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { LockIcon } from './TournamentManager'

const ORDER = Object.values(TOURNAMENT_STATUS)

/** Section 46 dashboard plus the controls that move the tournament along (sections 6, 21, 24). */
export default function OverviewTab({ tournament, reload, version, action, role }) {
  const [stats, setStats] = useState(null)
  const [notes, setNotes] = useState([])
  const [confirm, setConfirm] = useState(null)
  const tid = tournament.id
  const status = tournament.lifecycleStatus || 'DRAFT'
  const manage = can(role, P.TOURNAMENT_MANAGE)

  useEffect(() => {
    tms.dashboard(tid).then(setStats).catch(() => setStats(null))
    tms.notifications(tid).then(setNotes).catch(() => setNotes([]))
  }, [tid, version])

  const move = (to) => setConfirm({
    title: `Move to ${humanize(to)}?`,
    message: ORDER.indexOf(to) < ORDER.indexOf(status) ? 'This steps the tournament back. A reason is recorded.' : 'Every status change is recorded in the audit log.',
    requireReason: ORDER.indexOf(to) < ORDER.indexOf(status),
    run: (reason) => action.run(() => tms.setLifecycle(tid, to, reason), `Tournament is now ${humanize(to)}`).then(reload),
  })

  const lock = (which, locked) => setConfirm({
    title: `${locked ? 'Lock' : 'Unlock'} ${which === 'draw' ? 'the draw' : 'entries'}?`,
    message: locked
      ? which === 'draw' ? 'Players can no longer be moved between pools (Rule 5). Matches can then be generated.' : 'Coaches can no longer change players, categories are frozen and no entries can be added (Rule 7).'
      : 'Unlocking is recorded in the audit log with your reason.',
    requireReason: !locked,
    danger: !locked,
    run: (reason) => action.run(() => tms.setLock(tid, which, locked, reason), `${which === 'draw' ? 'Draw' : 'Entries'} ${locked ? 'locked' : 'unlocked'}`).then(reload),
  })

  const publicUrl = `${window.location.origin}/tournament/${tournament.slug || tid}`
  const s = stats || {}

  return (
    <Stack spacing={3}>
      {!tournament.masterAgeDate && (
        <Alert severity="warning">Set the Master Age Calculation Date in Settings before opening registration — every age is calculated against it (Rule 1).</Alert>
      )}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Tournament status</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {ORDER.map((st) => (
            <Box key={st} sx={{ opacity: st === status ? 1 : ORDER.indexOf(st) < ORDER.indexOf(status) ? 0.75 : 0.4 }}>
              <StatusBadge status={st === status ? st : ORDER.indexOf(st) < ORDER.indexOf(status) ? 'COMPLETED' : 'DRAFT'} label={`${ORDER.indexOf(st) + 1}. ${humanize(st)}`} />
            </Box>
          ))}
        </Box>
        {manage && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {tournamentLifecycle.next(status).map((to) => (
              <Button key={to} size="large" variant={ORDER.indexOf(to) > ORDER.indexOf(status) ? 'contained' : 'outlined'} onClick={() => move(to)}>
                {ORDER.indexOf(to) > ORDER.indexOf(status) ? '→ ' : '← '}{humanize(to)}
              </Button>
            ))}
          </Stack>
        )}
        {can(role, P.POOL_MANAGE) && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
            <Button size="large" variant="outlined" startIcon={<LockIcon locked={!tournament.entriesLocked} />} onClick={() => lock('entries', !tournament.entriesLocked)}>
              {tournament.entriesLocked ? 'Unlock entries' : 'Lock entries'}
            </Button>
            <Button size="large" variant="outlined" startIcon={<LockIcon locked={!tournament.drawLocked} />} onClick={() => lock('draw', !tournament.drawLocked)} disabled={!tournament.entriesLocked && !tournament.drawLocked}>
              {tournament.drawLocked ? 'Unlock draw' : 'Lock draw'}
            </Button>
          </Stack>
        )}
        {status !== 'DRAFT' && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            Public page: <Link href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</Link>
          </Typography>
        )}
      </Paper>

      <Grid container spacing={2}>
        {[
          ['Teams', s.teams], ['Players', s.players], ['Kata players', s.kataPlayers], ['Kumite players', s.kumitePlayers],
          ['Pending verification', s.pendingVerification, 'warning'], ['Pending payment', s.pendingPayment, 'warning'],
          ['Pending weigh-in', s.pendingWeighIn, 'warning'], ['Pools', s.pools], ['Matches', s.matches],
          ['Completed matches', s.completedMatches, 'success'], ['Pending matches', s.pendingMatches],
          ['Gold', s.gold], ['Silver', s.silver], ['Bronze', s.bronze],
        ].map(([label, value, tone]) => (
          <Grid key={label} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}><StatCard label={label} value={value} tone={tone} /></Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h3" gutterBottom>Next matches</Typography>
            {!s.nextMatches?.length && <Typography color="text.secondary">No pending matches.</Typography>}
            <List dense>
              {(s.nextMatches || []).map((m) => (
                <ListItem key={m.id} disableGutters>
                  <ListItemText primary={`${m.matchNumber} · Mat ${m.mat || '—'} · ${m.categoryName}`} secondary={`AKA ${m.akaName || 'TBD'}  vs  AO ${m.aoName || 'TBD'}`} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h3">Notifications</Typography>
              {notes.some((n) => !n.read) && <Button size="small" onClick={() => tms.markRead(tid).then(() => tms.notifications(tid)).then(setNotes)}>Mark all read</Button>}
            </Stack>
            {!notes.length && <Typography color="text.secondary">Nothing new.</Typography>}
            <List dense>
              {notes.slice(0, 12).map((n, i) => (
                <Box key={n.id}>
                  {i > 0 && <Divider />}
                  <ListItem disableGutters>
                    <ListItemText primary={`${n.read ? '' : '● '}${n.message}`} secondary={new Date(n.at).toLocaleString()} />
                  </ListItem>
                </Box>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} requireReason={confirm?.requireReason}
        danger={confirm?.danger} onClose={() => setConfirm(null)}
        onConfirm={(reason) => { const c = confirm; setConfirm(null); c.run(reason) }} />
    </Stack>
  )
}
