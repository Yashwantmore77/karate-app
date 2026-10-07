import { useEffect, useMemo, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Container, Paper, Typography, TextField, Button, Stack, Alert, Grid, Box, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, ToggleButtonGroup, ToggleButton, List, ListItem, ListItemText,
  FormControlLabel, Checkbox,
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
import { PageLoader } from '../../components/Loader'

const TEAM_FIELDS = [
  ['name', 'Team name', 6, true], ['club', 'Club / Dojo name', 6], ['code', 'Club code', 4], ['coachName', 'Coach name', 4],
  ['contactPerson', 'Contact person', 4], ['mobile', 'Mobile', 4], ['email', 'Email', 4], ['district', 'District', 4],
  ['state', 'State', 4], ['country', 'Country', 4], ['address', 'Address', 12],
]
const sessionKey = (token) => `kt:coach:${token}`

// PRD v1 §6/§11: why a coach cannot register right now, in their words.
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
export function closedMessage(w) {
  switch (w?.closedReason) {
    case 'registration_not_yet_open': return `Registration opens ${when(w.opensAt)}.`
    case 'registration_closed': return w.closesAt && new Date(w.closesAt) < new Date() ? `Registration closed ${when(w.closesAt)}.` : 'Registration is not open.'
    case 'entry_lock_deadline_passed': return 'The deadline for changing entries has passed.'
    case 'entries_soft_locked': return 'The organisers have closed entries for coaches.'
    case 'entries_locked': return 'Entries are locked: player details can no longer change (Rule 7).'
    default: return 'Registration is not open.'
  }
}

/**
 * PRD sections 14 and 52: a coach opens the tournament's registration link,
 * gives the password if there is one, registers their team and its players,
 * and follows their status. No account needed; the session lasts this tab.
 */
export default function RegisterPortal({ accountToken = null, onSignOut = null }) {
  const { token } = useParams()
  const action = useAction()
  const [linkInfo, setInfo] = useState(null)
  const [infoError, setInfoError] = useState(null)
  // PRD v1 §7: a coach signed in with their own account needs no link.
  const [session, setSession] = useState(() => {
    if (accountToken) return { token: accountToken }
    try { return JSON.parse(sessionStorage.getItem(sessionKey(token)) || 'null') } catch { return null }
  })
  const [duplicates, setDuplicates] = useState(null)
  const [account, setAccount] = useState(null)
  const [certificates, setCertificates] = useState(null)
  const [password, setPassword] = useState('')
  const [me, setMe] = useState(null)
  const [team, setTeam] = useState({})
  const [accepted, setAccepted] = useState(false)
  const [view, setView] = useState('players')
  const [edit, setEdit] = useState(null)
  const [errors, setErrors] = useState([])
  const [removing, setRemoving] = useState(null)

  useEffect(() => { if (!accountToken) tms.public.linkInfo(token).then(setInfo).catch(setInfoError) }, [token, accountToken])

  const keep = (s) => {
    if (accountToken) { if (!s) onSignOut?.(); setSession(s); return }
    setSession(s)
    try { sessionStorage.setItem(sessionKey(token), JSON.stringify(s)) } catch { /* this tab only */ }
  }

  const load = () => session && tms.coach.me(session).then(setMe).catch((err) => {
    if (err?.status === 401) { keep(null); setMe(null) } else action.notify({ severity: 'error', text: describeError(err) })
  })
  useEffect(() => { load() }, [session])
  const info = accountToken ? (me && { ...me, requiresPassword: false }) : linkInfo

  const fields = useMemo(() => me?.form || info?.form || [], [me, info])

  if (infoError) {
    return <Container maxWidth="sm" sx={{ py: 6 }}><Alert severity="error">{describeError(infoError)}</Alert></Container>
  }
  if (!info) return <PageLoader label="Opening registration…" />

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
          {!info.registrationOpen && <Alert severity="warning" sx={{ mb: 2 }}>{closedMessage(info)} You can still sign in to see your team's status.</Alert>}
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

  if (!me) return <PageLoader label="Loading your team…" />

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
          {/* PRD point 2: the tournament's rules and terms, accepted before registering. */}
          {(info.tournament.rules || info.tournament.terms) && (
            <Box sx={{ mt: 3 }}>
              {info.tournament.rules && (
                <>
                  <Typography variant="h4" gutterBottom>Tournament rules</Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}><Typography variant="body2">{info.tournament.rules}</Typography></Paper>
                </>
              )}
              {info.tournament.terms && (
                <>
                  <Typography variant="h4" gutterBottom>Terms &amp; conditions</Typography>
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}><Typography variant="body2">{info.tournament.terms}</Typography></Paper>
                  <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />} label="I have read and accept the terms and conditions" />
                </>
              )}
            </Box>
          )}
          <Button size="large" variant="contained" sx={{ mt: 2 }} disabled={!canWrite || !team.name?.trim() || action.busy || (!!info.tournament.terms && !accepted)} onClick={async () => {
            const doc = { ...Object.fromEntries(Object.entries(team).filter(([, v]) => v)), ...(info.tournament.terms ? { termsAccepted: accepted } : {}) }
            const out = await action.run(() => tms.coach.createTeam(session, doc), 'Team registered')
            if (out) keep(out.session)
          }}>Register team</Button>
        </Paper>
        {action.feedback}
      </Container>
    )
  }

  const save = async (confirmDuplicate = false) => {
    const { id, ...doc } = edit
    const body = Object.fromEntries(Object.entries(doc).filter(([k, v]) => v !== '' && !['tournamentId', 'teamId', 'createdAt', 'updatedAt', 'registrationStatus', 'entries', 'payment', 'weighIn', 'age', 'playerNumber',
      'rejectionReason', 'categoryIssues', 'seed', 'duplicateOf', 'withdrawnAt', 'withdrawalReason', 'statusBeforeWithdrawal', 'notices'].includes(k)))
    if (confirmDuplicate) body.confirmDuplicate = true
    try {
      const saved = id ? await tms.coach.updatePlayer(session, id, body) : await tms.coach.createPlayer(session, body)
      setEdit(null)
      setErrors([])
      setDuplicates(null)
      action.notify({ severity: saved?.notices?.length ? 'warning' : 'success', text: saved?.notices?.length ? `Player saved. ${saved.notices.join(' ')}` : 'Player saved and submitted' })
      load()
    } catch (err) {
      // PRD v1 §21: looks like someone already registered — check before saving.
      if (err?.code === 'possible_duplicate') return setDuplicates(err.details?.matches || [])
      setErrors(err?.details?.errors || [])
      action.notify({ severity: 'error', text: describeError(err) })
    }
  }

  const players = me.players

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {header}
      {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>{closedMessage(me)} You can still follow your players' status.</Alert>}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h3">{me.team.name}</Typography>
        <Typography color="text.secondary">{[me.team.club, me.team.coachName && `Coach ${me.team.coachName}`, me.team.state].filter(Boolean).join(' · ')}</Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Typography><b>{players.length}</b> players</Typography>
          <Typography><b>{players.filter((p) => !['DRAFT', 'SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(p.registrationStatus)).length}</b> approved</Typography>
          <Typography><b>{players.filter((p) => p.payment?.status === 'PAID').length}</b> paid</Typography>
          <Button size="small" component={RouterLink} to={`/tournament/${me.tournament.slug || me.tournament.id}`} target="_blank">Draw & results</Button>
          {!accountToken && <Button size="small" onClick={() => setAccount({ email: me.team.email || '', password: '' })}>Create my own login</Button>}
          {accountToken && onSignOut && <Button size="small" onClick={onSignOut}>Sign out</Button>}
        </Stack>
      </Paper>

      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_e, v) => v && setView(v)} sx={{ mb: 2 }}>
        <ToggleButton value="players">Players</ToggleButton>
        <ToggleButton value="bulk" disabled={!canWrite}>Bulk upload</ToggleButton>
        <ToggleButton value="notes">Notifications ({me.notifications.length})</ToggleButton>
        <ToggleButton value="certificates" onClick={() => tms.coach.certificates(session).then(setCertificates).catch(() => setCertificates([]))}>Certificates</ToggleButton>
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
          onPreview={(csv) => tms.coach.bulkPreview(session, csv)} onImport={(csv, opts) => tms.coach.bulkImport(session, csv, opts)}
          onDone={() => { setView('players'); load() }} />
      )}

      {view === 'certificates' && (
        <DataTable rows={certificates || []} rowKey={(c) => c.certificateId} loading={!certificates}
          empty="No certificates yet. They appear once the organisers issue them after the results."
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type', render: (c) => (c.medal ? `${c.medal[0].toUpperCase()}${c.medal.slice(1)} medal` : c.type === 'coach' ? 'Coach' : c.type === 'participation' ? 'Participation' : c.title || 'Award') },
            { key: 'category', label: 'Category / award', value: (c) => c.award || c.category, render: (c) => c.award || c.category || '—' },
            { key: 'certificateId', label: 'Certificate ID' },
            { key: 'pdf', label: '', sortable: false, render: (c) => (
              <Button size="small" variant="outlined" onClick={() => action.run(() => tms.coach.certificatePdf(session, c.certificateId))}>Download</Button>
            ) },
          ]} />
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
        <DialogContent><Box sx={{ mt: 1 }}>{edit && <PlayerForm coach fields={fields} value={edit} onChange={setEdit} errors={errors} disabled={!canWrite}
          onUpload={(file) => tms.coach.uploadFile(session, file)}
          onOpenFile={(id) => action.run(() => tms.coach.readFile(session, id).then(openStoredFile))} />}</Box></DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => save()}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!duplicates} title="Possible duplicate" confirmLabel="Register anyway"
        message={duplicates ? `This player looks like someone already registered: ${duplicates.map((d) => `${d.name} (born ${d.dob}${d.club ? `, ${d.club}` : ''})`).join('; ')}. Register anyway? The organisers will review it.` : ''}
        onClose={() => setDuplicates(null)} onConfirm={() => save(true)} />
      <Dialog open={!!account} onClose={() => setAccount(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Your own login</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Sign in at the main login page next time instead of using the link. The login opens only this team in this tournament.</Typography>
          <Stack spacing={2}>
            <TextField label="Email" type="email" value={account?.email || ''} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
            <TextField label="Password (8+ characters)" type="password" value={account?.password || ''} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccount(null)}>Cancel</Button>
          <Button variant="contained" disabled={!account?.email || (account?.password || '').length < 8} onClick={async () => {
            const ok = await action.run(() => tms.coach.createAccount(session, account), 'Login created. Use it on the sign-in page.')
            if (ok) setAccount(null)
          }}>Create login</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!removing} danger title={`Remove ${removing?.name}?`} confirmLabel="Remove" onClose={() => setRemoving(null)}
        onConfirm={async () => { const p = removing; setRemoving(null); await action.run(() => tms.coach.removePlayer(session, p.id), 'Player removed'); load() }} />
      {action.feedback}
    </Container>
  )
}
