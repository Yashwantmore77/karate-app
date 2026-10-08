import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container, Typography, Grid, Paper, Button, Stack, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Box,
} from '@mui/material'
import { Add, People, EmojiEvents, LiveTv, Public, Login, Business } from '@mui/icons-material'
import { tournaments as tournamentStore } from '../../data/domain'
import { tms } from '../../data/tms'
import StatCard from '../../components/tms/StatCard'
import StatusBadge from '../../components/tms/StatusBadge'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { paymentsEnabled } from '@kumite/shared/features.js'

const SUM_KEYS = ['teams', 'players', 'kataPlayers', 'kumitePlayers', 'pendingVerification', 'pendingPayment', 'pendingWeighIn', 'matches', 'completedMatches', 'liveMatches', 'pendingMatches', 'gold', 'silver', 'bronze']

/**
 * PRD point 1: the administrator's home. Every tournament at a glance, the
 * totals across them, what needs attention, and the common actions one click
 * away.
 */
export default function AdminDashboard({ profile }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = await tournamentStore.list().catch(() => [])
      const out = await Promise.all(list.map(async (t) => ({ t, d: await tms.dashboard(t.id).catch(() => null) })))
      if (alive) setRows(out)
    })()
    return () => { alive = false }
  }, [])

  if (!rows) return <PageLoader label="Loading dashboard…" />

  const total = Object.fromEntries(SUM_KEYS.map((k) => [k, rows.reduce((n, r) => n + (r.d?.[k] || 0), 0)]))
  const status = (t) => t.lifecycleStatus || 'DRAFT'
  const running = rows.filter((r) => !['DRAFT', 'COMPLETED', 'ARCHIVED'].includes(status(r.t))).length
  const manage = (t, tab) => navigate(`/admin/tournament/${t.id}/manage${tab ? `?tab=${tab}` : ''}`)

  const actions = [
    { label: 'New tournament', icon: <Add />, to: '/admin?create=1', primary: true },
    { label: 'Accounts', icon: <People />, to: '/admin/accounts' },
    ...(profile?.role === 'super_admin' ? [{ label: 'Organisations', icon: <Business />, to: '/admin/organizations' }] : []),
    { label: 'Live board', icon: <LiveTv />, to: '/live' },
    { label: 'Public site', icon: <Public />, to: '/tournaments' },
    { label: 'Sign-ins', icon: <Login />, to: '/admin/sign-ins' },
  ]

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <HelpTitle id="admin.dashboard" variant="h1" sx={{ mb: 2 }}>Dashboard</HelpTitle>

      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
        {actions.map((a) => (
          <Button key={a.label} variant={a.primary ? 'contained' : 'outlined'} startIcon={a.icon} onClick={() => navigate(a.to)} sx={{ ml: '0 !important' }}>{a.label}</Button>
        ))}
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Tournaments', rows.length], ['Running now', running], ['Teams', total.teams], ['Players', total.players],
          ['Kata entries', total.kataPlayers], ['Kumite entries', total.kumitePlayers],
          ['Awaiting approval', total.pendingVerification, total.pendingVerification ? 'warning' : null],
          ...(paymentsEnabled() ? [['Payment pending', total.pendingPayment, total.pendingPayment ? 'warning' : null]] : []),
          ['Weigh-in pending', total.pendingWeighIn, total.pendingWeighIn ? 'warning' : null],
          ['Matches live', total.liveMatches, total.liveMatches ? 'error' : null],
          ['Matches done', `${total.completedMatches} / ${total.matches}`],
          ['Medals', total.gold + total.silver + total.bronze],
        ].map(([label, value, tone]) => (
          <Grid key={label} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}><StatCard label={label} value={value} tone={tone} /></Grid>
        ))}
      </Grid>

      <Paper>
        <Typography variant="h3" sx={{ p: 2, pb: 0 }}>Tournaments</Typography>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tournament</TableCell><TableCell>Status</TableCell><TableCell align="right">Players</TableCell>
                <TableCell align="right">To approve</TableCell><TableCell align="right">To weigh</TableCell>
                <TableCell align="right">Matches</TableCell><TableCell align="right">Live</TableCell><TableCell align="right"><EmojiEvents fontSize="inherit" /> Medals</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ t, d }) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{[t.venue || t.location, t.startDate || t.date].filter(Boolean).join(' · ')}</Typography>
                  </TableCell>
                  <TableCell><StatusBadge status={status(t)} /></TableCell>
                  <TableCell align="right">{d?.players ?? '—'}</TableCell>
                  <TableCell align="right">{d?.pendingVerification ? <Button size="small" color="warning" onClick={() => manage(t, 'registrations')}>{d.pendingVerification}</Button> : 0}</TableCell>
                  <TableCell align="right">{d?.pendingWeighIn ? <Button size="small" onClick={() => manage(t, 'weighin')}>{d.pendingWeighIn}</Button> : 0}</TableCell>
                  <TableCell align="right">{d ? `${d.completedMatches}/${d.matches}` : '—'}</TableCell>
                  <TableCell align="right">{d?.liveMatches || 0}</TableCell>
                  <TableCell align="right">{d ? d.gold + d.silver + d.bronze : '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" variant="outlined" onClick={() => manage(t)}>Manage</Button>
                    <Button size="small" onClick={() => manage(t, 'matches')}>Matches</Button>
                    <Button size="small" onClick={() => manage(t, 'results')}>Results</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={9}><Typography color="text.secondary" sx={{ py: 2 }}>No tournaments yet. Start with "New tournament".</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  )
}
