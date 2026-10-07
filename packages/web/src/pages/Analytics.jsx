import { useEffect, useState } from 'react'
import {
  Container, Typography, Tabs, Tab, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Stack, Box, Alert,
} from '@mui/material'
import { request } from '../data/http'
import DataTable from '../components/tms/DataTable'
import { PageLoader } from '../components/Loader'

const medalCols = [
  { key: 'gold', label: '🥇' }, { key: 'silver', label: '🥈' }, { key: 'bronze', label: '🥉' },
  { key: 'medals', label: 'Medals' },
]
const winCols = [
  { key: 'won', label: 'Won' }, { key: 'lost', label: 'Lost' },
  { key: 'winRate', label: 'Win %', render: (r) => (r.winRate == null ? '—' : `${r.winRate}%`) },
]

/**
 * Phase 2 "advanced analytics": how athletes and clubs do across every
 * tournament this account can see — medals, bouts won and lost, and each
 * one's history event by event. Medals count once results are published.
 */
export default function Analytics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('clubs')
  const [detail, setDetail] = useState(null) // { kind, row }

  useEffect(() => { request('/analytics').then(setData).catch(setError) }, [])

  if (error) return <Container sx={{ py: 4 }}><Alert severity="error">Analytics could not be loaded.</Alert></Container>
  if (!data) return <PageLoader label="Working out the analytics…" />

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>Analytics</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Across {data.tournaments.length} tournament{data.tournaments.length === 1 ? '' : 's'}. An athlete is recognised across events by name and date of birth; medals count once results are published.
      </Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="clubs" label={`Clubs (${data.clubs.length})`} />
        <Tab value="athletes" label={`Athletes (${data.athletes.length})`} />
        <Tab value="tournaments" label={`Tournaments (${data.tournaments.length})`} />
      </Tabs>

      {tab === 'clubs' && (
        <DataTable rows={data.clubs} rowKey={(r) => r.key} exportName="club-analytics" exportTitle="Club analytics"
          searchPlaceholder="Search club" empty="No clubs yet." onRowClick={(row) => setDetail({ kind: 'club', row })}
          columns={[{ key: 'name', label: 'Club' }, { key: 'tournaments', label: 'Tournaments' }, { key: 'entries', label: 'Entries' }, ...medalCols, ...winCols]} />
      )}
      {tab === 'athletes' && (
        <DataTable rows={data.athletes} rowKey={(r) => r.key} exportName="athlete-analytics" exportTitle="Athlete analytics"
          searchPlaceholder="Search athlete or club" empty="No athletes yet." onRowClick={(row) => setDetail({ kind: 'athlete', row })}
          columns={[{ key: 'name', label: 'Athlete' }, { key: 'club', label: 'Club', render: (r) => r.club || '—' }, { key: 'gender', label: 'G', render: (r) => r.gender || '—' }, { key: 'tournaments', label: 'Tournaments' }, ...medalCols, ...winCols]} />
      )}
      {tab === 'tournaments' && (
        <DataTable rows={data.tournaments} exportName="tournament-analytics" exportTitle="Tournaments"
          empty="No tournaments with players yet."
          columns={[{ key: 'date', label: 'Date', render: (r) => r.date || '—' }, { key: 'name', label: 'Tournament' }, { key: 'players', label: 'Athletes' }, { key: 'teams', label: 'Teams' }, { key: 'bouts', label: 'Bouts fought' }, { key: 'medals', label: 'Medals' }]} />
      )}

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail?.row.name}{detail?.kind === 'athlete' && detail.row.club ? ` · ${detail.row.club}` : ''}</DialogTitle>
        <DialogContent>
          {detail && (
            <>
              <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap' }}>
                {[['Tournaments', detail.row.tournaments], ['🥇', detail.row.gold], ['🥈', detail.row.silver], ['🥉', detail.row.bronze], ['Won', detail.row.won], ['Lost', detail.row.lost], ['Win %', detail.row.winRate == null ? '—' : `${detail.row.winRate}%`]].map(([k, v]) => (
                  <Box key={k}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography variant="h3">{v}</Typography></Box>
                ))}
              </Stack>
              <Paper variant="outlined">
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell><TableCell>Tournament</TableCell>
                        {detail.kind === 'club' ? <><TableCell align="right">Entries</TableCell><TableCell align="right">🥇</TableCell><TableCell align="right">🥈</TableCell><TableCell align="right">🥉</TableCell></> : <TableCell>Medals</TableCell>}
                        <TableCell align="right">Won</TableCell><TableCell align="right">Lost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.row.history.map((h) => (
                        <TableRow key={h.tournamentId}>
                          <TableCell>{h.date || '—'}</TableCell>
                          <TableCell>{h.tournament}</TableCell>
                          {detail.kind === 'club'
                            ? <><TableCell align="right">{h.entries}</TableCell><TableCell align="right">{h.gold}</TableCell><TableCell align="right">{h.silver}</TableCell><TableCell align="right">{h.bronze}</TableCell></>
                            : <TableCell>{h.medals.length ? h.medals.map((m) => `${m.medal} (${m.category})`).join(', ') : '—'}</TableCell>}
                          <TableCell align="right">{h.won}</TableCell><TableCell align="right">{h.lost}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetail(null)}>Close</Button></DialogActions>
      </Dialog>
    </Container>
  )
}
