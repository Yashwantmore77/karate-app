import { useEffect, useMemo, useState } from 'react'
import {
  Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, IconButton, Tooltip,
  Typography, Box, ToggleButtonGroup, ToggleButton, Alert,
} from '@mui/material'
import { Add, Edit, Delete, Check, Close, Undo, Payments, Category } from '@mui/icons-material'
import { formFields } from '@kumite/shared/registration.js'
import { REGISTRATION_STATUS } from '@kumite/shared/lifecycle.js'
import { PAYMENT_STATUS } from '@kumite/shared/tms.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import PlayerForm from '../../components/tms/PlayerForm'
import BulkUpload from '../../components/tms/BulkUpload'
import { openStoredFile } from '../../components/tms/download'

const TEAM_FIELDS = [
  ['name', 'Team name', 6], ['club', 'Club / Dojo name', 6], ['code', 'Club code', 4], ['coachName', 'Coach name', 4],
  ['contactPerson', 'Contact person', 4], ['mobile', 'Mobile', 4], ['email', 'Email', 4], ['district', 'District', 4],
  ['state', 'State', 4], ['country', 'Country', 4], ['address', 'Address', 12],
]

const blank = (fields) => ({ events: [], gender: '', ...Object.fromEntries(fields.filter((f) => f.type !== 'checkbox').map((f) => [f.key, ''])) })
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined))

/** Sections 13, 15-18 and 40-41: teams, players, verification, payment, search and filters. */
export default function RegistrationsTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const fields = useMemo(() => formFields(tournament), [tournament])
  const [view, setView] = useState('players')
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [groups, setGroups] = useState([])
  const [weights, setWeights] = useState([])
  const [filter, setFilter] = useState({ registrationStatus: '', teamId: '', gender: '', event: '', paymentStatus: '' })
  const [teamEdit, setTeamEdit] = useState(null)
  const [playerEdit, setPlayerEdit] = useState(null)
  const [playerErrors, setPlayerErrors] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [payment, setPayment] = useState(null)
  const [override, setOverride] = useState(null)
  const manage = can(role, P.REGISTRATION_MANAGE)
  const locked = !!tournament.entriesLocked

  const load = () => Promise.all([
    tms.teams.list(tid), tms.players.list(tid, clean(filter)), tms.ageGroups.list(tid), tms.weightCategories.list(tid),
  ]).then(([t, p, g, w]) => { setTeams(t); setPlayers(p); setGroups(g); setWeights(w) })
  useEffect(() => { load() }, [tid, version, JSON.stringify(filter)])

  const teamName = (id) => teams.find((t) => t.id === id)?.name || '—'
  const entryLabel = (p) => Object.entries(p.entries || {}).map(([event, e]) => {
    const g = groups.find((x) => x.id === e.ageGroupId)
    const w = weights.find((x) => x.id === e.weightCategoryId)
    return `${event === 'kata' ? 'Kata' : 'Kumite'}: ${g ? g.name : '?'}${event === 'kumite' ? ` ${w ? (w.label || w.name) : '?'}` : ''}${e.override ? ' (override)' : ''}`
  }).join(' · ')

  const regAction = (p, act) => {
    const needsReason = act !== 'approve'
    setConfirm({
      title: `${act === 'approve' ? 'Approve' : act === 'reject' ? 'Reject' : 'Request correction for'} ${p.name}?`,
      requireReason: needsReason,
      reasonLabel: act === 'reject' ? 'Rejection reason' : 'What needs correcting',
      danger: act === 'reject',
      run: (reason) => action.run(() => tms.registration(tid, p.id, act, reason), `${p.name}: ${act === 'approve' ? 'approved' : act === 'reject' ? 'rejected' : 'returned for correction'}`).then(load),
    })
  }

  const savePlayer = async () => {
    const { id, ...doc } = playerEdit
    const body = Object.fromEntries(Object.entries(doc).filter(([k]) => !['tournamentId', 'createdAt', 'updatedAt', 'registrationStatus', 'entries', 'payment', 'weighIn', 'age', 'playerNumber', 'rejectionReason', 'categoryIssues'].includes(k)))
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k]
    try {
      if (id) await tms.players.update(tid, id, body)
      else await tms.players.create(tid, body)
      setPlayerEdit(null)
      setPlayerErrors([])
      action.notify({ severity: 'success', text: 'Player saved' })
      load()
    } catch (err) {
      setPlayerErrors(err?.details?.errors || [])
      action.run(() => Promise.reject(err))
    }
  }

  const approveAll = () => {
    const pending = players.filter((p) => ['SUBMITTED', 'PENDING_VERIFICATION'].includes(p.registrationStatus))
    setConfirm({
      title: `Approve ${pending.length} pending players?`,
      message: 'Each approval is recorded in the audit log.',
      run: async () => {
        for (const p of pending) await action.run(() => tms.registration(tid, p.id, 'approve'))
        action.notify({ severity: 'success', text: `${pending.length} approved` })
        load()
      },
    })
  }

  const filters = (
    <>
      {[
        ['registrationStatus', 'Status', Object.values(REGISTRATION_STATUS)],
        ['paymentStatus', 'Payment', PAYMENT_STATUS],
        ['gender', 'Gender', ['M', 'F']],
        ['event', 'Event', ['kata', 'kumite']],
      ].map(([key, label, values]) => (
        <TextField key={key} select size="small" label={label} value={filter[key]} sx={{ minWidth: 130 }} onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}>
          <MenuItem value="">All</MenuItem>
          {values.map((v) => <MenuItem key={v} value={v}>{humanize(v)}</MenuItem>)}
        </TextField>
      ))}
      <TextField select size="small" label="Team" value={filter.teamId} sx={{ minWidth: 150 }} onChange={(e) => setFilter({ ...filter, teamId: e.target.value })}>
        <MenuItem value="">All</MenuItem>
        {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
      </TextField>
    </>
  )

  return (
    <Stack spacing={2}>
      <ToggleButtonGroup exclusive value={view} onChange={(_e, v) => v && setView(v)} size="small">
        <ToggleButton value="players">Players ({players.length})</ToggleButton>
        <ToggleButton value="teams">Teams ({teams.length})</ToggleButton>
        {manage && <ToggleButton value="bulk">Bulk upload</ToggleButton>}
      </ToggleButtonGroup>

      {locked && <Alert severity="info">Entries are locked: no new players, and DOB, gender, weight, events and team cannot change.</Alert>}

      {view === 'teams' && (
        <DataTable
          rows={teams}
          empty="No teams yet. Coaches register through the registration link, or add one here."
          toolbar={manage && <Button variant="contained" startIcon={<Add />} disabled={locked} onClick={() => setTeamEdit({})}>Add team</Button>}
          columns={[
            { key: 'name', label: 'Team' }, { key: 'club', label: 'Club' }, { key: 'code', label: 'Code' }, { key: 'coachName', label: 'Coach' },
            { key: 'mobile', label: 'Mobile' }, { key: 'state', label: 'State' },
            { key: 'players', label: 'Players', value: (t) => players.filter((p) => p.teamId === t.id).length, render: (t) => players.filter((p) => p.teamId === t.id).length },
            { key: 'actions', label: '', sortable: false, render: (t) => manage && (
              <Stack direction="row">
                <IconButton size="small" aria-label="Edit team" onClick={() => setTeamEdit(t)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Delete team" disabled={locked} onClick={() => setConfirm({
                  title: `Delete ${t.name}?`, danger: true, message: 'Its players are deleted too.', confirmLabel: 'Delete',
                  run: () => action.run(() => tms.teams.remove(tid, t.id), 'Team deleted').then(load),
                })}><Delete fontSize="small" /></IconButton>
              </Stack>
            ) },
          ]}
        />
      )}

      {view === 'players' && (
        <DataTable
          rows={players}
          searchPlaceholder="Search name, player ID, team, club"
          empty="No players match."
          toolbar={(
            <>
              {filters}
              {manage && <Button variant="outlined" onClick={approveAll} disabled={!players.some((p) => ['SUBMITTED', 'PENDING_VERIFICATION'].includes(p.registrationStatus))}>Approve all pending</Button>}
              {can(role, P.PLAYER_EDIT) && <Button variant="contained" startIcon={<Add />} disabled={locked || !teams.length} onClick={() => { setPlayerErrors([]); setPlayerEdit({ ...blank(fields), teamId: teams[0]?.id }) }}>Add player</Button>}
            </>
          )}
          columns={[
            { key: 'playerNumber', label: 'ID' },
            { key: 'name', label: 'Name' },
            { key: 'teamId', label: 'Team', value: (p) => teamName(p.teamId), render: (p) => teamName(p.teamId) },
            { key: 'gender', label: 'G' },
            { key: 'age', label: 'Age', render: (p) => p.age ?? '—' },
            { key: 'weight', label: 'Kg', render: (p) => p.weight ?? '—' },
            { key: 'entries', label: 'Category', value: entryLabel, render: (p) => (
              <Box>
                <Typography variant="body2">{entryLabel(p) || '—'}</Typography>
                {p.categoryIssues?.length > 0 && <Typography variant="body2" color="warning.main">{p.categoryIssues[0].message}</Typography>}
              </Box>
            ) },
            { key: 'registrationStatus', label: 'Status', render: (p) => (
              <Box>
                <StatusBadge status={p.registrationStatus} />
                {p.rejectionReason && <Typography variant="body2" color="text.secondary">{p.rejectionReason}</Typography>}
              </Box>
            ) },
            { key: 'payment', label: 'Payment', value: (p) => p.payment?.status, render: (p) => <StatusBadge status={p.payment?.status || 'PENDING'} label={`${humanize(p.payment?.status || 'PENDING')}${p.payment?.amount ? ` · ₹${p.payment.amount}` : ''}`} /> },
            { key: 'actions', label: '', sortable: false, render: (p) => (
              <Stack direction="row" sx={{ flexWrap: 'nowrap' }}>
                {manage && ['SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(p.registrationStatus) && (
                  <Tooltip title="Approve"><IconButton size="small" color="success" onClick={() => regAction(p, 'approve')}><Check fontSize="small" /></IconButton></Tooltip>
                )}
                {manage && !['REJECTED', 'DRAFT', 'COMPLETED', 'DRAW_ASSIGNED'].includes(p.registrationStatus) && (
                  <Tooltip title="Reject"><IconButton size="small" color="error" onClick={() => regAction(p, 'reject')}><Close fontSize="small" /></IconButton></Tooltip>
                )}
                {manage && ['SUBMITTED', 'PENDING_VERIFICATION', 'REJECTED'].includes(p.registrationStatus) && (
                  <Tooltip title="Request correction"><IconButton size="small" onClick={() => regAction(p, 'request_correction')}><Undo fontSize="small" /></IconButton></Tooltip>
                )}
                {can(role, P.PLAYER_EDIT) && (
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => { setPlayerErrors([]); setPlayerEdit({ ...p }) }}><Edit fontSize="small" /></IconButton></Tooltip>
                )}
                {can(role, P.PLAYER_EDIT) && !locked && (
                  <Tooltip title="Change category"><IconButton size="small" onClick={() => setOverride({ player: p, event: p.events?.[0] || 'kumite', ageGroupId: p.entries?.[p.events?.[0]]?.ageGroupId || '', weightCategoryId: p.entries?.[p.events?.[0]]?.weightCategoryId || '' })}><Category fontSize="small" /></IconButton></Tooltip>
                )}
                {manage && (
                  <Tooltip title="Payment"><IconButton size="small" onClick={() => setPayment({ player: p, status: p.payment?.status || 'PENDING', amount: p.payment?.amount ?? 0, method: p.payment?.method || '', transactionId: p.payment?.transactionId || '', date: p.payment?.date || '', receipt: p.payment?.receipt || '' })}><Payments fontSize="small" /></IconButton></Tooltip>
                )}
                {manage && !locked && (
                  <Tooltip title="Delete"><IconButton size="small" onClick={() => setConfirm({
                    title: `Delete ${p.name}?`, danger: true, confirmLabel: 'Delete',
                    run: () => action.run(() => tms.players.remove(tid, p.id), 'Player deleted').then(load),
                  })}><Delete fontSize="small" /></IconButton></Tooltip>
                )}
              </Stack>
            ) },
          ]}
        />
      )}

      {view === 'bulk' && (
        <Stack spacing={2}>
          <Alert severity="info">Each row names its team in the Team column (by team name or club code). Excel: save the sheet as CSV.</Alert>
          <BulkUpload fields={fields} action={action}
            onPreview={(csv) => tms.bulkPreview(tid, csv, null)} onImport={(csv) => tms.bulkImport(tid, csv, null)}
            onDone={() => { setView('players'); load() }} />
        </Stack>
      )}

      <Dialog open={!!teamEdit} onClose={() => setTeamEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{teamEdit?.id ? 'Edit team' : 'Add team'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {TEAM_FIELDS.map(([k, label, w]) => (
              <Grid key={k} size={{ xs: 12, sm: w }}>
                <TextField fullWidth required={k === 'name'} label={label} value={teamEdit?.[k] || ''} onChange={(e) => setTeamEdit({ ...teamEdit, [k]: e.target.value })} />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTeamEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={async () => {
            const doc = Object.fromEntries(TEAM_FIELDS.map(([k]) => [k, teamEdit[k] || null]).filter(([k, v]) => v !== null || teamEdit.id))
            const ok = await action.run(() => (teamEdit.id ? tms.teams.update(tid, teamEdit.id, doc) : tms.teams.create(tid, doc)), 'Team saved')
            if (ok) { setTeamEdit(null); load() }
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!playerEdit} onClose={() => setPlayerEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{playerEdit?.id ? `Edit ${playerEdit.name}` : 'Add player'}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {playerEdit && <PlayerForm fields={fields} value={playerEdit} onChange={setPlayerEdit} errors={playerErrors} teams={teams}
              onUpload={(file) => tms.uploadFile(tid, { ...file, purpose: 'player' })}
              onOpenFile={(id) => action.run(() => tms.readFile(tid, id).then(openStoredFile))} />}
            {playerEdit && (
              <TextField sx={{ mt: 2 }} type="number" label="Seed (optional, 1 = strongest)" value={playerEdit.seed ?? ''}
                onChange={(e) => setPlayerEdit({ ...playerEdit, seed: e.target.value === '' ? null : Number(e.target.value) })} helperText="Used by the seeded draw" />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlayerEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={savePlayer}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!payment} onClose={() => setPayment(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Payment — {payment?.player.name}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Amount" value={payment?.amount ?? ''} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></Grid>
            <Grid size={{ xs: 6 }}>
              <TextField select fullWidth label="Status" value={payment?.status || 'PENDING'} onChange={(e) => setPayment({ ...payment, status: e.target.value })}>
                {PAYMENT_STATUS.map((s) => <MenuItem key={s} value={s}>{humanize(s)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth label="Method" value={payment?.method || ''} onChange={(e) => setPayment({ ...payment, method: e.target.value })} placeholder="Cash / UPI / Bank" /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth label="Transaction ID" value={payment?.transactionId || ''} onChange={(e) => setPayment({ ...payment, transactionId: e.target.value })} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth type="date" label="Payment date" slotProps={{ inputLabel: { shrink: true } }} value={payment?.date || ''} onChange={(e) => setPayment({ ...payment, date: e.target.value })} /></Grid>
            <Grid size={{ xs: 6 }}><TextField fullWidth label="Receipt no." value={payment?.receipt || ''} onChange={(e) => setPayment({ ...payment, receipt: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayment(null)}>Cancel</Button>
          <Button variant="contained" onClick={async () => {
            const { player, ...p } = payment
            const body = { status: p.status, amount: Number(p.amount) || 0, method: p.method || null, transactionId: p.transactionId || null, date: p.date || null, receipt: p.receipt || null }
            const ok = await action.run(() => tms.payment(tid, player.id, body), 'Payment recorded')
            if (ok) { setPayment(null); load() }
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!override} onClose={() => setOverride(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Change category — {override?.player.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Calculated age {override?.player.age ?? '—'} (as of {tournament.masterAgeDate || 'master date not set'}). An override is recorded in the audit log and kept until cleared.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField select fullWidth label="Event" value={override?.event || ''} onChange={(e) => {
                const ev = e.target.value
                const entry = override.player.entries?.[ev] || {}
                setOverride({ ...override, event: ev, ageGroupId: entry.ageGroupId || '', weightCategoryId: entry.weightCategoryId || '' })
              }}>
                {(override?.player.events || []).map((ev) => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Age group" value={override?.ageGroupId || ''} onChange={(e) => setOverride({ ...override, ageGroupId: e.target.value, weightCategoryId: '' })}>
                <MenuItem value="">Automatic (clear override)</MenuItem>
                {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </TextField>
            </Grid>
            {override?.event === 'kumite' && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Weight category" value={override?.weightCategoryId || ''} onChange={(e) => setOverride({ ...override, weightCategoryId: e.target.value })} disabled={!override?.ageGroupId}>
                  {weights.filter((w) => w.ageGroupId === override?.ageGroupId).map((w) => <MenuItem key={w.id} value={w.id}>{w.label || w.name}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required label="Reason (audit log)" value={override?.reason || ''} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverride(null)}>Cancel</Button>
          <Button variant="contained" disabled={!override?.reason?.trim()} onClick={async () => {
            const o = override
            const ok = await action.run(() => tms.overrideCategory(tid, o.player.id, o.event, { ageGroupId: o.ageGroupId || null, weightCategoryId: o.weightCategoryId || null }, o.reason), 'Category updated')
            if (ok) { setOverride(null); load() }
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} requireReason={confirm?.requireReason}
        reasonLabel={confirm?.reasonLabel} danger={confirm?.danger} confirmLabel={confirm?.confirmLabel}
        onClose={() => setConfirm(null)} onConfirm={(reason) => { const c = confirm; setConfirm(null); c.run(reason) }} />
    </Stack>
  )
}
