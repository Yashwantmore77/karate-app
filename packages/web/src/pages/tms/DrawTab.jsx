import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, Alert, Grid, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, List, ListItem, ListItemText, IconButton, Tooltip, Chip,
} from '@mui/material'
import { SwapHoriz, Shuffle, Lock } from '@mui/icons-material'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { useLoading } from '../../components/Loader'

/** Sections 20-25: categorise, lock, draw pools, confirm the draw, generate matches. */
export default function DrawTab({ tournament, reload, version, action, goTab }) {
  const tid = tournament.id
  const settings = settingsOf(tournament)
  const [divisions, setDivisions] = useState([])
  const [pools, setPools] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [issues, setIssues] = useState(null)
  const [drawDialog, setDrawDialog] = useState(null)
  const [moving, setMoving] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(Promise.all([tms.divisions(tid), tms.pools(tid), tms.players.list(tid), tms.teams.list(tid)])
    .then(([d, p, pl, t]) => { setDivisions(d); setPools(p); setPlayers(pl); setTeams(t) }))
  useEffect(() => { load() }, [tid, version])

  const nameOf = (id) => players.find((p) => p.id === id)?.name || '?'
  const teamOf = (id) => teams.find((t) => t.id === players.find((p) => p.id === id)?.teamId)?.name || ''
  const locked = !!tournament.entriesLocked
  const drawLocked = !!tournament.drawLocked

  const categorize = async () => {
    const out = await action.run(() => tms.categorize(tid), (r) => `${r.categorized} players categorised${r.issues.length ? `, ${r.issues.length} need attention` : ''}`)
    if (out) { setIssues(out.issues); load() }
  }

  const generate = async () => {
    const { divisionKey, method, poolSize } = drawDialog
    setDrawDialog(null)
    await action.run(() => tms.generatePools(tid, { divisionKey: divisionKey || null, method, poolSize: Number(poolSize) || null }), (r) => `${r.length} pools drawn`)
    await reload()
    load()
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>1. Categorise players</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Gender + age (as of {tournament.masterAgeDate || 'the master date'}) + event + weight → category (Rule 2). Approved players only.
        </Typography>
        <Button size="large" variant="contained" onClick={categorize} disabled={locked}>Run categorisation</Button>
        {issues && !issues.length && <Alert severity="success" sx={{ mt: 2 }}>Every approved player has a category.</Alert>}
        {issues?.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <List dense disablePadding>
              {issues.slice(0, 20).map((i, n) => <ListItem key={n} disableGutters><ListItemText primary={`${i.name} (${i.event}): ${i.message}`} /></ListItem>)}
            </List>
            Fix these in Categories, or change the player's category in Registrations.
          </Alert>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>2. Lock entries and draw pools</Typography>
        {!locked && <Alert severity="info" sx={{ mb: 2 }}>Lock entries on the Dashboard before drawing pools (section 21).</Alert>}
        {drawLocked && <Alert severity="success" sx={{ mb: 2 }} icon={<Lock />}>The draw is locked. Unlock it on the Dashboard (with a reason) to change pools.</Alert>}
        <DataTable
          rows={divisions}
          loading={loading} refreshing={refreshing}
          rowKey={(d) => d.key}
          empty="No categorised, approved players yet."
          toolbar={<Button variant="contained" startIcon={<Shuffle />} disabled={!locked || drawLocked || !divisions.length}
            onClick={() => setDrawDialog({ divisionKey: '', method: 'random', poolSize: settings.poolSize })}>Draw all categories</Button>}
          columns={[
            { key: 'label', label: 'Category' },
            { key: 'count', label: 'Players' },
            { key: 'expected', label: 'Pools at current size', value: (d) => Math.ceil(d.count / settings.poolSize), render: (d) => Math.ceil(d.count / settings.poolSize) },
            { key: 'pools', label: 'Drawn', render: (d) => (d.pools ? <Chip size="small" color="success" variant="outlined" label={`✓ ${d.pools} pool${d.pools > 1 ? 's' : ''}`} /> : '—') },
            { key: 'actions', label: '', sortable: false, render: (d) => (
              <Button size="small" disabled={!locked || drawLocked} onClick={() => setDrawDialog({ divisionKey: d.key, label: d.label, method: 'random', poolSize: settings.poolSize })}>
                {d.pools ? 'Redraw' : 'Draw'}
              </Button>
            ) },
          ]}
        />
      </Paper>

      {divisions.filter((d) => d.pools).map((d) => (
        <Paper key={d.key} sx={{ p: 2 }}>
          <Typography variant="h3" gutterBottom>{d.label}</Typography>
          <Grid container spacing={2}>
            {pools.filter((p) => p.divisionKey === d.key).map((pool) => (
              <Grid key={pool.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                  <Typography variant="h4">Pool {pool.name} <Typography component="span" color="text.secondary">({pool.playerIds.length})</Typography></Typography>
                  <List dense>
                    {pool.playerIds.map((id) => (
                      <ListItem key={id} disableGutters secondaryAction={!drawLocked && (
                        <Tooltip title="Move to another pool"><IconButton edge="end" size="small" onClick={() => setMoving({ playerId: id, fromPoolId: pool.id, divisionKey: d.key, toPoolId: '' })}><SwapHoriz fontSize="small" /></IconButton></Tooltip>
                      )}>
                        <ListItemText primary={nameOf(id)} secondary={teamOf(id)} />
                      </ListItem>
                    ))}
                  </List>
                  <Typography variant="body2" color="text.secondary">{pool.method === 'seeded' ? 'Seeded' : 'Random'} draw · seed {pool.drawSeed}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      ))}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>3. Generate matches</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Every pool fights a round robin. AKA (red) and AO (blue) are stored on each match, numbered M-001 onwards and spread across {settings.mats} mat{settings.mats > 1 ? 's' : ''}.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="large" variant="contained" disabled={!drawLocked} onClick={() => setConfirm({
            title: 'Generate matches?', message: 'Matches are created for every drawn category that has none yet.',
            run: () => action.run(() => tms.generateMatches(tid), (r) => `${r.created} matches generated`).then(() => goTab('matches')),
          })}>Generate matches</Button>
          {!drawLocked && <Typography sx={{ alignSelf: 'center' }} color="text.secondary">Lock the draw on the Dashboard first (Rule 5).</Typography>}
        </Stack>
      </Paper>

      <Dialog open={!!drawDialog} onClose={() => setDrawDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{drawDialog?.label ? `Draw ${drawDialog.label}` : 'Draw all categories'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Method" value={drawDialog?.method || 'random'} onChange={(e) => setDrawDialog({ ...drawDialog, method: e.target.value })}
              helperText={drawDialog?.method === 'seeded' ? 'Players with a seed (set on the player) are spread first: seeds 1 and 2 land in different pools.' : 'Players are placed at random, keeping clubmates apart where possible.'}>
              <MenuItem value="random">Random draw</MenuItem>
              <MenuItem value="seeded">Seeded draw</MenuItem>
            </TextField>
            <TextField type="number" label="Maximum pool size" value={drawDialog?.poolSize ?? ''} onChange={(e) => setDrawDialog({ ...drawDialog, poolSize: e.target.value })}
              helperText="Players are spread as evenly as possible (Rule 4)." />
            <Alert severity="warning">Existing pools{drawDialog?.label ? ' in this category' : ''} and their unplayed matches are replaced.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrawDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={generate}>Generate pools</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!moving} onClose={() => setMoving(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Move {moving && nameOf(moving.playerId)}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="To pool" value={moving?.toPoolId || ''} onChange={(e) => setMoving({ ...moving, toPoolId: e.target.value })}>
              {pools.filter((p) => moving && p.divisionKey === moving.divisionKey && p.id !== moving.fromPoolId).map((p) => <MenuItem key={p.id} value={p.id}>Pool {p.name}</MenuItem>)}
            </TextField>
            <TextField label="Reason (audit log)" value={moving?.reason || ''} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoving(null)}>Cancel</Button>
          <Button variant="contained" disabled={!moving?.toPoolId || !moving?.reason?.trim()} onClick={async () => {
            const { divisionKey, ...body } = moving
            setMoving(null)
            await action.run(() => tms.movePlayer(tid, body), 'Player moved')
            load()
          }}>Move</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c.run() }} />
    </Stack>
  )
}
