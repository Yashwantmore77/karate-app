import { useEffect, useMemo, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Container, Paper, Typography, TextField, Button, Stack, Alert, Grid, Box, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, ToggleButtonGroup, ToggleButton, List, ListItem, ListItemText, CircularProgress,
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import { tms, describeError } from '../../data/tms'
import PlayerForm from '../../components/tms/PlayerForm'
import BulkUpload from '../../components/tms/BulkUpload'
import DataTable from '../../components/tms/DataTable'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import useAction from '../../components/tms/useAction'
import { openStoredFile } from '../../components/tms/download'

const TEAM_FIELDS = [
  ['name', 'Team name', 6, true], ['club', 'Club / Dojo name', 6], ['code', 'Club code', 4], ['coachName', 'Coach name', 4],
  ['contactPerson', 'Contact person', 4], ['mobile', 'Mobile', 4], ['email', 'Email', 4], ['district', 'District', 4],
  ['state', 'State', 4], ['country', 'Country', 4], ['address', 'Address', 12],
]
const sessionKey = (token) => `kt:coach:${token}`

/**
 * PRD sections 14 and 52: a coach opens the tournament's registration link,
 * gives the password if there is one, registers their team and its players,
 * and follows their status. No account needed; the session lasts this tab.
 */
export default function RegisterPortal() {
  const { token } = useParams()
  const action = useAction()
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState(null)
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey(token)) || 'null') } catch { return null }
  })
  const [password, setPassword] = useState('')
  const [me, setMe] = useState(null)
  const [team, setTeam] = useState({})
  const [view, setView] = useState('players')
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState([])
  const [removing, setRemoving] = useState(null)

  useEffect(() => { tms.public.linkInfo(token).then(setInfo).catch(setInfoError) }, [token])

  const keep = (s) => {
    setSession(s)
    try { sessionStorage.setItem(sessionKey(token), JSON.stringify(s)) } catch { /* this tab only */ }
  }

  const load = () => session && tms.coach.me(session).then(setMe).catch((err) => {
    if (err?.status === 401) { keep(null); setMe(null) } else action.notify({ severity: 'error', text: describeError(err) })
  })
  useEffect(() => { load() }, [session])

  const fields = useMemo(() => me?.form || info?.form || [], [me, info])

  if (infoError) {
    return <Container maxWidth="sm" sx={{ py: 6 }}><Alert severity="error">{describeError(infoError)}</Alert></Container>
  }
  if (!info) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>

  const open = async () => {
    const s = await action.run(() => tms.public.openLink(token, password))
    if (s) keep(s)
  }

  const header = (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h1">{info.tournament.name}</Typography>
      <Typography color="text.secondary">Team registration · {[info.tournament.venue || info.tournament.location, info.tournament.startDate || info.tournament.date].filter(Boolean).join(' · ')}</Typography>
    </Box>
  )

  if (!session) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        {header}
        <Paper sx={{ p: 3 }}>
          {!info.registrationOpen && <Alert severity="warning" sx={{ mb: 2 }}>Registration is currently closed. You can still sign in to see your team's status.</Alert>}
          {info.requiresPassword ? (
            <Stack spacing={2}>
              <TextField type="password" label="Registration password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && open()} autoFocus />
              <Button size="large" variant="contained" onClick={open} disabled={action.busy}>Continue</Button>
            </Stack>
          ) : (
            <Button size="large" variant="contained" onClick={open} disabled={action.busy}>Start registration</Button>
          )}
        </Paper>
        {action.feedback}
      </Container>
    )
  }

  if (!me) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>

  const canWrite = me.registrationOpen

  if (!me.team) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        {header}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h3" gutterBottom>Register your team</Typography>
          <Grid container spacing={2}>
            {TEAM_FIELDS.map(([k, label, w, required]) => (
              <Grid key={k} size={{ xs: 12, sm: w }}>
                <TextField fullWidth required={required} label={label} value={team[k] || ''} onChange={(e) => setTeam({ ...team, [k]: e.target.value })} />
              </Grid>
            ))}
          </Grid>
          <Button size="large" variant="contained" sx={{ mt: 2 }} disabled={!canWrite || !team.name?.trim() || action.busy} onClick={async () => {
            const doc = Object.fromEntries(Object.entries(team).filter(([, v]) => v))
            const out = await action.run(() => tms.coach.createTeam(session, doc), 'Team registered')
            if (out) keep(out.session)
          }}>Register team</Button>
        </Paper>
        {action.feedback}
      </Container>
    )
  }

  const save = async () => {
    const { id, ...doc } = edit
    const body = Object.fromEntries(Object.entries(doc).filter(([k, v]) => v !== '' && !['tournamentId', 'teamId', 'createdAt', 'updatedAt', 'registrationStatus', 'entries', 'payment', 'weighIn', 'age', 'playerNumber', 'rejectionReason', 'categoryIssues', 'seed'].includes(k)))
    try {
      if (id) await tms.coach.updatePlayer(session, id, body)
      else await tms.coach.createPlayer(session, body)
      setEdit(null)
      setErrors([])
      action.notify({ severity: 'success', text: 'Player saved and submitted' })
      load()
    } catch (err) {
      setErrors(err?.details?.errors || [])
      action.notify({ severity: 'error', text: describeError(err) })
    }
  }

  const players = me.players

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {header}
      {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>{me.tournament.entriesLocked ? 'Entries are locked: player details can no longer change (Rule 7).' : 'Registration is not open.'} You can still follow your players' status.</Alert>}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h3">{me.team.name}</Typography>
        <Typography color="text.secondary">{[me.team.club, me.team.coachName && `Coach ${me.team.coachName}`, me.team.state].filter(Boolean).join(' · ')}</Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Typography><b>{players.length}</b> players</Typography>
          <Typography><b>{players.filter((p) => !['DRAFT', 'SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(p.registrationStatus)).length}</b> approved</Typography>
          <Typography><b>{players.filter((p) => p.payment?.status === 'PAID').length}</b> paid</Typography>
          <Button size="small" component={RouterLink} to={`/tournament/${me.tournament.slug || me.tournament.id}`} target="_blank">Draw & results</Button>
        </Stack>
      </Paper>

      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, v) => v && setView(v)} sx={{ mb: 2 }}>
        <ToggleButton value="players">Players</ToggleButton>
        <ToggleButton value="bulk" disabled={!canWrite}>Bulk upload</ToggleButton>
        <ToggleButton value="notes">Notifications ({me.notifications.length})</ToggleButton>
      </ToggleButtonGroup>

      {view === 'players' && (
        <DataTable rows={players} empty="No players yet. Add them one by one or with a bulk upload."
          toolbar={<Button variant="contained" startIcon={<Add />} disabled={!canWrite} onClick={() => { setErrors([]); setEdit({ events: [] }) }}>Add player</Button>}
          columns={[
            { key: 'playerNumber', label: 'ID' },
            { key: 'name', label: 'Name' },
            { key: 'age', label: 'Age', render: (p) => p.age ?? '—' },
            { key: 'events', label: 'Events', value: (p) => (p.events || []).join(', '), render: (p) => (p.events || []).join(', ') },
            { key: 'weight', label: 'Kg', render: (p) => p.weight ?? '—' },
            { key: 'registrationStatus', label: 'Registration', render: (p) => (
              <Box><StatusBadge status={p.registrationStatus} />{p.rejectionReason && <Typography variant="body2" color="warning.main">{p.rejectionReason}</Typography>}</Box>
            ) },
            { key: 'payment', label: 'Payment', value: (p) => p.payment?.status, render: (p) => <StatusBadge status={p.payment?.status || 'PENDING'} label={`${humanize(p.payment?.status || 'PENDING')}${p.payment?.amount ? ` · ₹${p.payment.amount}` : ''}`} /> },
            { key: 'weighIn', label: 'Weigh-in', value: (p) => p.weighIn?.status, render: (p) => (p.weighIn ? <StatusBadge status={p.weighIn.status} /> : 'n/a') },
            { key: 'actions', label: '', sortable: false, render: (p) => canWrite && (
              <Stack direction="row">
                <Tooltip title="Edit"><IconButton size="small" onClick={() => { setErrors([]); setEdit({ ...p }) }}><Edit fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Remove"><IconButton size="small" onClick={() => setRemoving(p)}><Delete fontSize="small" /></IconButton></Tooltip>
              </Stack>
            ) },
          ]} />
      )}

      {view === 'bulk' && (
        <BulkUpload fields={fields} withTeamColumn={false} action={action}
          onPreview={(csv) => tms.coach.bulkPreview(session, csv)} onImport={(csv) => tms.coach.bulkImport(session, csv)}
          onDone={() => { setView('players'); load() }} />
      )}

      {view === 'notes' && (
        <Paper sx={{ p: 2 }}>
          {!me.notifications.length && <Typography color="text.secondary">Nothing yet.</Typography>}
          <List dense>
            {me.notifications.map((n) => <ListItem key={n.id} disableGutters><ListItemText primary={n.message} secondary={new Date(n.at).toLocaleString()} /></ListItem>)}
          </List>
        </Paper>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{edit?.id ? `Edit ${edit.name}` : 'Add player'}</DialogTitle>
        <DialogContent><Box sx={{ mt: 1 }}>{edit && <PlayerForm fields={fields} value={edit} onChange={setEdit} errors={errors} disabled={!canWrite}
          onUpload={(file) => tms.coach.uploadFile(session, file)}
          onOpenFile={(id) => action.run(() => tms.coach.readFile(session, id).then(openStoredFile))} />}</Box></DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!removing} danger title={`Remove ${removing?.name}?`} confirmLabel="Remove" onClose={() => setRemoving(null)}
        onConfirm={async () => { const p = removing; setRemoving(null); await action.run(() => tms.coach.removePlayer(session, p.id), 'Player removed'); load() }} />
      {action.feedback}
    </Container>
  )
}
