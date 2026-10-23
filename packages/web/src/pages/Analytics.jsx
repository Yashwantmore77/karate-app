import { useCallback, useEffect, useState } from 'react'
import {
  Container, Typography, Tabs, Tab, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Stack, Box, Alert, Autocomplete, TextField, List, ListItem, ListItemText,
} from '@mui/material'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { request } from '../data/http'
import DataTable from '../components/tms/DataTable'
import useAction from '../components/tms/useAction'
import { PageLoader } from '../components/Loader'
import { HelpTitle } from '../components/help/InfoTip'

const medalCols = [
  { key: 'gold', label: '🥇' }, { key: 'silver', label: '🥈' }, { key: 'bronze', label: '🥉' },
  { key: 'medals', label: 'Medals' },
]
const winCols = [
  { key: 'won', label: 'Won' }, { key: 'lost', label: 'Lost' },
  { key: 'winRate', label: 'Win %', render: (r) => (r.winRate == null ? '—' : `${r.winRate}%`) },
  // Won without a bout (walkover, no-show, withdrawal): not in Won, Lost or Win %.
  { key: 'walkovers', label: 'Walkovers' },
]

// An organiser's decisions on which records are one athlete (KAN-369).
const decideAthletes = (kind, playerIds) => request('/analytics/athlete-links', { method: 'POST', body: { kind, playerIds } })
const undoDecision = (id) => request(`/analytics/athlete-links/${id}`, { method: 'DELETE' }).then(() => true)
const recordName = (r) => `${r.name} in ${r.tournament}`
const athleteLabel = (a) => `${a.name} · ${a.club || 'No club'} · ${a.tournaments} tournament${a.tournaments === 1 ? '' : 's'}`

/**
 * Phase 2 "advanced analytics": how athletes and clubs do across every
 * tournament this account can see — medals, bouts won and lost, and each
 * one's history event by event. Medals count once results are published.
 * An organiser joins two records of one athlete, or separates two people
 * that name and birthday took for one, from the athlete's detail.
 */
export default function Analytics({ profile = null }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('clubs')
  const [detail, setDetail] = useState(null) // { kind, row }
  const [joining, setJoining] = useState(null) // the athlete to join with the one open
  const action = useAction()
  const manage = can(profile?.role, P.TOURNAMENT_MANAGE)

  const load = useCallback(() => request('/analytics').then(setData).catch(setError), [])
  useEffect(() => { load() }, [load])
  const close = () => { setDetail(null); setJoining(null) }
  // A decision changes which athletes there are, so the open one may be gone.
  const decide = async (fn, message) => {
    if (await action.run(fn, message)) { close(); await load() }
  }
  const athlete = detail?.kind === 'athlete' ? detail.row : null
  // A line joined by hand leaves through Undo; any other can be set apart.
  const joinedByHand = new Set(athlete?.decisions.filter((d) => d.kind === 'same').flatMap((d) => d.records.map((r) => r.playerId)))
  const separable = manage && athlete?.history.length > 1 && athlete.history.some((h) => !joinedByHand.has(h.playerId))

  if (error) return <Container sx={{ py: 4 }}><Alert severity="error">Analytics could not be loaded.</Alert></Container>
  if (!data) return <PageLoader label="Working out the analytics…" />

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <HelpTitle id="analytics" variant="h1" gutterBottom>Analytics</HelpTitle>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Across {data.tournaments.length} tournament{data.tournaments.length === 1 ? '' : 's'}. An athlete is recognised across events by name and date of birth; medals count once results are published.
      </Typography>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="clubs" label={`Clubs (${data.clubs.length})`} data-tip="Medals and entries by club, across tournaments." />
        <Tab value="athletes" label={`Athletes (${data.athletes.length})`} data-tip="Each athlete's record across tournaments (matched by name and date of birth, unless an organiser decided otherwise)." />
        <Tab value="tournaments" label={`Tournaments (${data.tournaments.length})`} data-tip="Entries, bouts and medals for each tournament." />
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

      <Dialog open={!!detail} onClose={close} maxWidth="md" fullWidth>
        <DialogTitle>{detail?.row.name}{detail?.kind === 'athlete' && detail.row.club ? ` · ${detail.row.club}` : ''}</DialogTitle>
        <DialogContent>
          {detail && (
            <>
              <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap' }}>
                {[['Tournaments', detail.row.tournaments], ['🥇', detail.row.gold], ['🥈', detail.row.silver], ['🥉', detail.row.bronze], ['Won', detail.row.won], ['Lost', detail.row.lost], ['Win %', detail.row.winRate == null ? '—' : `${detail.row.winRate}%`], ['Walkovers', detail.row.walkovers]].map(([k, v]) => (
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
                        <TableCell align="right">Won</TableCell><TableCell align="right">Lost</TableCell><TableCell align="right">Walkovers</TableCell>
                        {separable && <TableCell />}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.row.history.map((h) => (
                        <TableRow key={h.playerId || h.tournamentId}>
                          <TableCell>{h.date || '—'}</TableCell>
                          <TableCell>{h.tournament}</TableCell>
                          {detail.kind === 'club'
                            ? <><TableCell align="right">{h.entries}</TableCell><TableCell align="right">{h.gold}</TableCell><TableCell align="right">{h.silver}</TableCell><TableCell align="right">{h.bronze}</TableCell></>
                            : <TableCell>{h.medals.length ? h.medals.map((m) => `${m.medal} (${m.category})`).join(', ') : '—'}</TableCell>}
                          <TableCell align="right">{h.won}</TableCell><TableCell align="right">{h.lost}</TableCell><TableCell align="right">{h.walkovers}</TableCell>
                          {separable && (
                            <TableCell align="right">
                              {!joinedByHand.has(h.playerId) && <Button size="small" disabled={action.busy} onClick={() => decide(() => decideAthletes('apart', [h.playerId]), `The ${h.tournament} record is now an athlete of its own`)}
                                data-tip="Says this record is someone else: it leaves this athlete and becomes an athlete of its own. You can undo it.">Not this athlete</Button>}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
              {athlete?.decisions.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h4">Decided by hand</Typography>
                  <List dense>
                    {athlete.decisions.map((d) => (
                      <ListItem key={d.id} disableGutters secondaryAction={manage && (
                        <Button size="small" disabled={action.busy} onClick={() => decide(() => undoDecision(d.id), 'Decision undone: name and date of birth decide again')}
                          data-tip="Takes this decision back: these records are matched by name and date of birth again.">Undo</Button>
                      )}>
                        <ListItemText primary={d.kind === 'same' ? `Same athlete: ${d.records.map(recordName).join(' and ')}` : `Not the same athlete: ${recordName(d.records[0])} was set apart`} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              {manage && athlete && (
                <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
                  <Autocomplete sx={{ flexGrow: 1 }} size="small" value={joining} onChange={(_e, v) => setJoining(v)}
                    options={data.athletes.filter((a) => a.key !== athlete.key)} getOptionLabel={athleteLabel} isOptionEqualToValue={(a, b) => a.key === b.key}
                    renderInput={(params) => <TextField {...params} label="Same athlete as…" helperText="The same person under another spelling or birth date: pick them to join the two." />} />
                  <Button variant="outlined" disabled={!joining || action.busy}
                    onClick={() => decide(() => decideAthletes('same', [athlete.history[0].playerId, joining.history[0].playerId]), `${athlete.name} and ${joining.name} are now one athlete`)}
                    data-tip="Makes the athlete you picked and this one the same person: their tournaments, medals and bouts add up together. You can undo it."
                    data-tip-needs={joining ? undefined : 'Pick the other athlete first.'}>Join</Button>
                </Stack>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={close}>Close</Button></DialogActions>
      </Dialog>
      {action.feedback}
    </Container>
  )
}
