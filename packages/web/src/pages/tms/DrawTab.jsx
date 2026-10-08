import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, Alert, Grid, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, List, ListItem, ListItemText, IconButton, Chip,
} from '@mui/material'
import { SwapHoriz, Shuffle, Lock, Print } from '@mui/icons-material'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { useLoading } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { printBracketSheets, sheetsForPlayers } from '../../components/tms/bracketSheet'

/** Sections 20-25: categorise, lock, draw pools, confirm the draw, generate matches. */
export default function DrawTab({ tournament, reload, version, action, goTab }) {
  const tid = tournament.id
  // The sheet carries the organising association's name, as the paper form does.
  const sheetTitle = String(tournament.association || tournament.organizer || tournament.name || '').toUpperCase()
  const settings = settingsOf(tournament)
  const [divisions, setDivisions] = useState([])
  const [pools, setPools] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [issues, setIssues] = useState(null)
  const [drawDialog, setDrawDialog] = useState(null)
  const [moving, setMoving] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [outcome, setOutcome] = useState(null)

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

  // PRD v1 §28: show what a redraw throws away before it happens.
  const openDraw = async (dialog) => {
    setDrawDialog({ ...dialog, impact: null })
    const impact = await tms.drawImpact(tid, dialog.divisionKey || null).catch(() => null)
    setDrawDialog((d) => (d ? { ...d, impact } : d))
  }
  const generate = async () => {
    const { divisionKey, method, poolSize, impact } = drawDialog
    setDrawDialog(null)
    const out = await action.run(() => tms.generatePools(tid, { divisionKey: divisionKey || null, method, poolSize: Number(poolSize) || null, confirm: !!impact?.regenerates }),
      (r) => `${r.pools.length} pools drawn`)
    if (out) setOutcome({ excluded: out.excluded || [], singles: out.singles || [], uncategorized: out.uncategorized || [] })
    await reload()
    load()
  }
  const move = async (body) => {
    try {
      await tms.movePlayer(tid, body)
      action.notify({ severity: 'success', text: 'Player moved' })
      load()
    } catch (err) {
      // PRD v1 §21: over the pool maximum only on purpose.
      if (err?.code === 'pool_full') {
        return setConfirm({
          title: 'That pool is full', message: `It already has ${err.details?.max ?? 'the maximum'} players. Move anyway? Your reason is recorded.`,
          run: () => action.run(() => tms.movePlayer(tid, { ...body, force: true }), 'Player moved over the pool maximum').then(load),
        })
      }
      action.run(() => Promise.reject(err))
    }
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <HelpTitle id="draw.categorise" variant="h3" gutterBottom>1. Categorise players</HelpTitle>
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
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <HelpTitle id="draw.pools" variant="h3" gutterBottom>2. Lock entries and draw pools</HelpTitle>
          <Button size="small" startIcon={<Print />} onClick={() => printBracketSheets([{ title: sheetTitle, event: '', size: 16, columns: [] }], 'Blank draw sheet')}>Blank draw sheet</Button>
        </Stack>
        {!locked && <Alert severity="info" sx={{ mb: 2 }}>Lock entries on the Dashboard before drawing pools (section 21).</Alert>}
        {drawLocked && <Alert severity="success" sx={{ mb: 2 }} icon={<Lock />}>The draw is locked. Unlock it on the Dashboard (with a reason) to change pools.</Alert>}
        {settings.requireWeighInForDraw && <Alert severity="info" sx={{ mb: 2 }}>Only kumite players with a verified weigh-in enter the draw (Settings → Entries and weigh-in).</Alert>}
        {outcome && (outcome.excluded.length > 0 || outcome.singles.length > 0 || outcome.uncategorized.length > 0) && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setOutcome(null)}>
            {outcome.excluded.length > 0 && <Box>Left out (no verified weigh-in): {outcome.excluded.map((x) => `${x.name} (${x.division})`).join(', ')}</Box>}
            {outcome.uncategorized.length > 0 && <Box>Left out (no category): {outcome.uncategorized.map((x) => `${x.name} (${x.event === 'kata' ? 'Kata' : 'Kumite'})`).join(', ')}</Box>}
            {outcome.singles.length > 0 && <Box>Only one player, so no pool: {outcome.singles.map((x) => x.label).join(', ')}. Decide each on the Results tab.</Box>}
          </Alert>
        )}
        <DataTable
          rows={divisions}
          loading={loading} refreshing={refreshing}
          rowKey={(d) => d.key}
          empty="No categorised, approved players yet."
          toolbar={<Button variant="contained" startIcon={<Shuffle />} disabled={!locked || drawLocked || !divisions.length}
            onClick={() => openDraw({ divisionKey: '', method: settings.drawMethod || 'random', poolSize: settings.poolSize })}>Draw all categories</Button>}
          columns={[
            { key: 'label', label: 'Category' },
            { key: 'count', label: 'Players', render: (d) => (
              <Box>
                {d.count}
                {d.unweighed?.length > 0 && <Typography variant="body2" color="warning.main">{d.unweighed.length} not weighed in</Typography>}
                {d.singleEntry && <Typography variant="body2" color="warning.main">Single entry</Typography>}
              </Box>
            ) },
            { key: 'expected', label: 'Pools at current size', value: (d) => Math.ceil(d.count / settings.poolSize), render: (d) => Math.ceil(d.count / settings.poolSize) },
            { key: 'pools', label: 'Drawn', render: (d) => (d.pools ? <Chip size="small" color="success" variant="outlined" label={`✓ ${d.pools} pool${d.pools > 1 ? 's' : ''}`} /> : '—') },
            { key: 'actions', label: '', sortable: false, render: (d) => (
              <Button size="small" disabled={!locked || drawLocked} onClick={() => openDraw({ divisionKey: d.key, label: d.label, method: settings.drawMethod || 'random', poolSize: settings.poolSize })}>
                {d.pools ? 'Redraw' : 'Draw'}
              </Button>
            ) },
          ]}
        />
      </Paper>

      {divisions.filter((d) => d.pools).map((d) => (
        <Paper key={d.key} sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            <Typography variant="h3">{d.label}</Typography>
            <Button size="small" variant="outlined" startIcon={<Print />} onClick={() => printBracketSheets(sheetsForPlayers({
              title: sheetTitle, event: d.label,
              groups: pools.filter((p) => p.divisionKey === d.key).map((p) => ({ label: `Pool ${p.name}`, names: p.playerIds.map((id) => nameOf(id)) })),
            }), `${d.label} — draw sheet`)}>Print draw sheet</Button>
          </Stack>
          <Grid container spacing={2}>
            {pools.filter((p) => p.divisionKey === d.key).map((pool) => (
              <Grid key={pool.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                  <Typography variant="h4">Pool {pool.name} <Typography component="span" color="text.secondary">({pool.playerIds.length})</Typography></Typography>
                  <List dense>
                    {pool.playerIds.map((id) => (
                      <ListItem key={id} disableGutters secondaryAction={!drawLocked && (
                        <IconButton aria-label="Move to another pool" edge="end" size="small" onClick={() => setMoving({ playerId: id, fromPoolId: pool.id, divisionKey: d.key, toPoolId: '' })}><SwapHoriz fontSize="small" /></IconButton>
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
        <HelpTitle id="draw.matches" variant="h3" gutterBottom>3. Generate matches</HelpTitle>
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
              <MenuItem value="seeded" disabled={settings.allowSeeding === false}>Seeded draw{settings.allowSeeding === false ? ' (disabled in Settings)' : ''}</MenuItem>
            </TextField>
            <TextField type="number" label="Maximum pool size" value={drawDialog?.poolSize ?? ''} onChange={(e) => setDrawDialog({ ...drawDialog, poolSize: e.target.value })}
              helperText="Players are spread as evenly as possible (Rule 4)." />
            {!drawDialog?.impact && <Typography variant="body2" color="text.secondary">Checking what this would replace…</Typography>}
            {drawDialog?.impact?.blocked && <Alert severity="error">Bouts have been fought in {drawDialog.impact.divisions.filter((d) => d.blocked).map((d) => d.label).join(', ')}; those categories cannot be redrawn.</Alert>}
            {drawDialog?.impact && !drawDialog.impact.blocked && drawDialog.impact.regenerates && (
              <Alert severity="warning">This replaces {drawDialog.impact.pools} existing pool{drawDialog.impact.pools === 1 ? '' : 's'} and {drawDialog.impact.matches} unplayed match{drawDialog.impact.matches === 1 ? '' : 'es'}. It needs the draw-regeneration privilege and is audited.</Alert>
            )}
            {drawDialog?.impact && !drawDialog.impact.regenerates && <Alert severity="info">A first draw: nothing is replaced.</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrawDialog(null)}>Cancel</Button>
          <Button variant="contained" disabled={!drawDialog?.impact || drawDialog.impact.blocked} onClick={generate}>{drawDialog?.impact?.regenerates ? 'Confirm redraw' : 'Generate pools'}</Button>
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
            move(body)
          }}>Move</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); c.run() }} />
    </Stack>
  )
}
