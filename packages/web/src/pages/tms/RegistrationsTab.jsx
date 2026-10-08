import { useEffect, useMemo, useState } from 'react'
import {
  Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, IconButton, Tooltip,
  Typography, Box, ToggleButtonGroup, ToggleButton, Alert, Switch, FormControlLabel, Chip,
} from '@mui/material'
import { Add, Edit, Delete, Check, Close, Undo, Payments, Category, DirectionsWalk } from '@mui/icons-material'
import { formFields } from '@kumite/shared/registration.js'
import { REGISTRATION_STATUS } from '@kumite/shared/lifecycle.js'
import { PAYMENT_STATUS, teamProblems } from '@kumite/shared/tms.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import StatusBadge, { humanize } from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import PlayerForm from '../../components/tms/PlayerForm'
import BulkUpload from '../../components/tms/BulkUpload'
import { openStoredFile } from '../../components/tms/download'
import { useLoading } from '../../components/Loader'
import InfoTip from '../../components/help/InfoTip'

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
  // One page of players at a time, paged on the server (section 62).
  const [paged, setPaged] = useState({ rows: [], total: 0, page: 0, pageSize: 25 })
  const [pageQuery, setPageQuery] = useState({ page: 0, pageSize: 25, q: '', sort: 'name', dir: 'asc' })
  const [teamCounts, setTeamCounts] = useState({})
  const players = paged.rows
  const [groups, setGroups] = useState([])
  const [weights, setWeights] = useState([])
  const [filter, setFilter] = useState({ registrationStatus: '', teamId: '', gender: '', event: '', paymentStatus: '', ageGroupId: '', weightCategoryId: '', district: '', state: '' })
  const [places, setPlaces] = useState({ district: [], state: [] })
  const [teamEdit, setTeamEdit] = useState(null)
  const [playerEdit, setPlayerEdit] = useState(null)
  const [playerErrors, setPlayerErrors] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [payment, setPayment] = useState(null)
  const [teamTouched, setTeamTouched] = useState(false)
  const [override, setOverride] = useState(null)
  const [duplicates, setDuplicates] = useState(null)
  const [dupeRows, setDupeRows] = useState([])
  const manage = can(role, P.REGISTRATION_MANAGE)
  const locked = !!tournament.entriesLocked

  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(Promise.all([
    tms.teams.list(tid), tms.players.page(tid, clean({ ...filter, q: pageQuery.q }), pageQuery), tms.ageGroups.list(tid), tms.weightCategories.list(tid),
  ]).then(([t, p, g, w]) => { setTeams(t); setPaged(p); setGroups(g); setWeights(w) }))
  useEffect(() => { load() }, [tid, version, JSON.stringify(filter), JSON.stringify(pageQuery)])
  // A filter change starts again from the first page.
  useEffect(() => { setPageQuery((q) => ({ ...q, page: 0 })) }, [JSON.stringify(filter)])
  // District and state choices come from the players registered so far.
  useEffect(() => {
    tms.players.list(tid).then((all) => {
      const distinct = (key) => [...new Set(all.map((p) => p[key]).filter(Boolean))].sort()
      setPlaces({ district: distinct('district'), state: distinct('state') })
    }).catch(() => {})
  }, [tid, version])
  // PRD v1 §21: players registered although they looked like someone already entered.
  useEffect(() => {
    if (view !== 'duplicates') return
    tms.players.list(tid).then((all) => setDupeRows(all.filter((p) => p.duplicateOf?.length).map((p) => ({ ...p, of: p.duplicateOf.map((id) => all.find((x) => x.id === id)).filter(Boolean) }))))
  }, [view, tid, version])
  useEffect(() => {
    if (view !== 'teams') return
    tms.players.list(tid).then((all) => setTeamCounts(all.reduce((m, p) => ({ ...m, [p.teamId]: (m[p.teamId] || 0) + 1 }), {})))
  }, [view, tid, version])

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

  const SERVER_KEYS = ['tournamentId', 'createdAt', 'updatedAt', 'registrationStatus', 'entries', 'payment', 'weighIn', 'age', 'playerNumber', 'rejectionReason',
    'categoryIssues', 'duplicateOf', 'withdrawnAt', 'withdrawalReason', 'statusBeforeWithdrawal', 'notices']
  const savePlayer = async (confirmDuplicate = false) => {
    const { id, ...doc } = playerEdit
    const body = Object.fromEntries(Object.entries(doc).filter(([k]) => !SERVER_KEYS.includes(k)))
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k]
    if (confirmDuplicate) body.confirmDuplicate = true
    try {
      const saved = id ? await tms.players.update(tid, id, body) : await tms.players.create(tid, body)
      setPlayerEdit(null)
      setPlayerErrors([])
      setDuplicates(null)
      action.notify({ severity: saved?.notices?.length ? 'warning' : 'success', text: saved?.notices?.length ? `Player saved. ${saved.notices.join(' ')}` : 'Player saved' })
      load()
    } catch (err) {
      // PRD v1 §21: a possible duplicate is shown for review, then saved only if confirmed.
      if (err?.code === 'possible_duplicate') return setDuplicates(err.details?.matches || [])
      setPlayerErrors(err?.details?.errors || [])
      action.run(() => Promise.reject(err))
    }
  }

  const approveAll = async () => {
    const pending = [
      ...(await tms.players.list(tid, { registrationStatus: 'SUBMITTED' })),
      ...(await tms.players.list(tid, { registrationStatus: 'PENDING_VERIFICATION' })),
    ]
    if (!pending.length) return action.notify({ severity: 'info', text: 'No registrations are waiting for approval.' })
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
      <TextField select size="small" label="Age group" value={filter.ageGroupId} sx={{ minWidth: 150 }} onChange={(e) => setFilter({ ...filter, ageGroupId: e.target.value, weightCategoryId: '' })}>
        <MenuItem value="">All</MenuItem>
        {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Weight" value={filter.weightCategoryId} sx={{ minWidth: 130 }} onChange={(e) => setFilter({ ...filter, weightCategoryId: e.target.value })}>
        <MenuItem value="">All</MenuItem>
        {weights.filter((w) => !filter.ageGroupId || w.ageGroupId === filter.ageGroupId).map((w) => <MenuItem key={w.id} value={w.id}>{w.label || w.name}</MenuItem>)}
      </TextField>
      {['district', 'state'].map((key) => (
        <TextField key={key} select size="small" label={key === 'district' ? 'District' : 'State'} value={filter[key]} sx={{ minWidth: 130 }} onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}>
          <MenuItem value="">All</MenuItem>
          {places[key].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
        </TextField>
      ))}
    </>
  )

  const teamErrors = teamEdit ? teamProblems(teamEdit) : {}

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <ToggleButtonGroup exclusive value={view} onChange={(_e, v) => v && setView(v)} size="small">
        <ToggleButton value="players">Players ({loading ? '…' : paged.total})</ToggleButton>
        <ToggleButton value="teams">Teams ({loading ? '…' : teams.length})</ToggleButton>
        <ToggleButton value="duplicates">Possible duplicates</ToggleButton>
        {manage && <ToggleButton value="bulk">Bulk upload</ToggleButton>}
      </ToggleButtonGroup>
      <InfoTip id="registrations.views" />
      </Stack>

      {locked && <Alert severity="info">Entries are locked: no new players, and DOB, gender, weight, events and team cannot change.</Alert>}

      {view === 'teams' && (
        <DataTable
          rows={teams}
          loading={loading} refreshing={refreshing}
          exportName={`${tournament.slug || 'tournament'}-teams`} exportTitle={`${tournament.name} — Teams`}
          filters={[{ key: 'district', label: 'District' }, { key: 'state', label: 'State' }]}
          empty="No teams yet. Coaches register through the registration link, or add one here."
          toolbar={manage && <Button variant="contained" startIcon={<Add />} disabled={locked} onClick={() => setTeamEdit({})}>Add team</Button>}
          columns={[
            { key: 'teamNumber', label: 'Ref' },
            { key: 'name', label: 'Team' }, { key: 'club', label: 'Club' }, { key: 'code', label: 'Code' }, { key: 'coachName', label: 'Coach' },
            { key: 'mobile', label: 'Mobile' }, { key: 'state', label: 'State' },
            { key: 'players', label: 'Players', value: (t) => teamCounts[t.id] || 0, render: (t) => teamCounts[t.id] || 0 },
            // PRD v1 §7: an inactive team cannot add players.
            { key: 'active', label: 'Active', value: (t) => (t.active === false ? 'No' : 'Yes'), render: (t) => (manage
              ? <Switch size="small" checked={t.active !== false} slotProps={{ input: { 'aria-label': `${t.name} active` } }}
                onChange={(e) => action.run(() => tms.teams.update(tid, t.id, { active: e.target.checked }), e.target.checked ? 'Team activated' : 'Team deactivated').then(load)} />
              : (t.active === false ? 'No' : 'Yes')) },
            { key: 'actions', label: '', sortable: false, render: (t) => manage && (
              <Stack direction="row">
                <IconButton size="small" aria-label="Edit team" onClick={() => setTeamEdit(t)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Delete team" disabled={locked} onClick={() => setConfirm({
                  title: `Delete ${t.name}?`, danger: true, confirmLabel: 'Delete',
                  // Deleting players is recorded with a reason; an empty team goes without one.
                  message: teamCounts[t.id] ? `Its ${teamCounts[t.id]} player${teamCounts[t.id] === 1 ? ' is' : 's are'} deleted too. Give a reason; it is kept in the audit log.` : 'This team has no players.',
                  requireReason: !!teamCounts[t.id],
                  run: (reason) => action.run(() => tms.teams.remove(tid, t.id, reason || null), 'Team deleted').then(load),
                })}><Delete fontSize="small" /></IconButton>
              </Stack>
            ) },
          ]}
        />
      )}

      {view === 'duplicates' && (
        <DataTable
          rows={dupeRows}
          exportName={`${tournament.slug || 'tournament'}-possible-duplicates`} exportTitle={`${tournament.name} — Possible duplicates`}
          empty="No possible duplicates. A player who looks like someone already registered (same name and date of birth) is listed here once confirmed."
          columns={[
            { key: 'playerNumber', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'dob', label: 'DOB' },
            { key: 'teamId', label: 'Team', value: (p) => teamName(p.teamId), render: (p) => teamName(p.teamId) },
            { key: 'of', label: 'Looks like', sortable: false, value: (p) => p.of.map((d) => `${d.name} (${d.playerNumber})`).join(', '),
              render: (p) => <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>{p.of.map((d) => <Chip key={d.id} size="small" label={`${d.name} · ${d.playerNumber} · ${teamName(d.teamId)}`} />)}</Stack> },
            { key: 'registrationStatus', label: 'Status', render: (p) => <StatusBadge status={p.registrationStatus} /> },
            { key: 'actions', label: '', sortable: false, render: (p) => manage && !locked && (
              <Tooltip title="Delete the duplicate"><IconButton size="small" onClick={() => setConfirm({
                title: `Delete ${p.name} (${p.playerNumber})?`, danger: true, confirmLabel: 'Delete',
                run: () => action.run(() => tms.players.remove(tid, p.id), 'Duplicate deleted').then(() => setDupeRows((r) => r.filter((x) => x.id !== p.id))),
              })}><Delete fontSize="small" /></IconButton></Tooltip>
            ) },
          ]}
        />
      )}

      {view === 'players' && (
        <DataTable
          rows={players}
          loading={loading} refreshing={refreshing}
          server={{ ...paged, onChange: (next) => setPageQuery((q) => ({ ...q, ...next })) }}
          exportName={`${tournament.slug || 'tournament'}-players`} exportTitle={`${tournament.name} — Players`}
          exportRows={() => tms.players.list(tid, clean({ ...filter, q: pageQuery.q }))}
          searchPlaceholder="Search name, player ID, team, club"
          empty="No players match."
          toolbar={(
            <>
              {filters}
              {manage && <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}><Button variant="outlined" onClick={approveAll}>Approve all pending</Button><InfoTip id="registrations.approveAll" /></Box>}
              {can(role, P.PLAYER_EDIT) && <Button variant="contained" startIcon={<Add />} disabled={locked || !teams.length} onClick={() => { setPlayerErrors([]); setPlayerEdit({ ...blank(fields), teamId: teams[0]?.id }) }}>Add player</Button>}
            </>
          )}
          columns={[
            { key: 'playerNumber', label: 'ID' },
            { key: 'name', label: 'Name' },
            { key: 'teamId', label: 'Team', value: (p) => teamName(p.teamId), render: (p) => teamName(p.teamId) },
            { key: 'gender', label: 'G' },
            { key: 'age', label: 'Age', render: (p) => p.age ?? '—' },
            { key: 'district', label: 'District', render: (p) => p.district || '—' },
            { key: 'state', label: 'State', render: (p) => p.state || '—' },
            { key: 'weight', label: 'Kg', render: (p) => p.weight ?? '—' },
            { key: 'entries', label: 'Category', sortable: false, value: entryLabel, render: (p) => (
              <Box>
                <Typography variant="body2">{entryLabel(p) || '—'}</Typography>
                {p.categoryIssues?.length > 0 && <Typography variant="body2" color="warning.main">{p.categoryIssues[0].message}</Typography>}
              </Box>
            ) },
            { key: 'registrationStatus', label: 'Status', render: (p) => (
              <Box>
                <StatusBadge status={p.registrationStatus} />
                {p.rejectionReason && <Typography variant="body2" color="text.secondary">{p.rejectionReason}</Typography>}
                {p.withdrawalReason && <Typography variant="body2" color="text.secondary">{p.withdrawalReason}</Typography>}
                {p.duplicateOf?.length > 0 && <Typography variant="body2" color="warning.main">Possible duplicate</Typography>}
              </Box>
            ) },
            { key: 'payment', label: 'Payment', sortKey: 'payment.status', value: (p) => p.payment?.status, render: (p) => (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                <StatusBadge status={p.payment?.status || 'PENDING'} label={`${humanize(p.payment?.status || 'PENDING')}${p.payment?.amount ? ` · ₹${p.payment.amount}` : ''}`} />
                {/* Events changed after payment: what is still owed, or owed back. */}
                {p.payment?.balanceDue > 0 && <Typography variant="caption" color="warning.main">₹{p.payment.balanceDue} still due (paid ₹{p.payment.paidAmount})</Typography>}
                {p.payment?.refundDue > 0 && <Typography variant="caption" color="info.main">Refund due ₹{p.payment.refundDue}</Typography>}
              </Stack>
            ) },
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
                {can(role, P.RESULT_MANAGE) && !['WITHDRAWN', 'REJECTED', 'DRAFT'].includes(p.registrationStatus) && (
                  <Tooltip title="Withdraw (injury, no-show)"><IconButton size="small" onClick={() => setConfirm({
                    title: `Withdraw ${p.name}?`, danger: true, confirmLabel: 'Withdraw', requireReason: true, reasonLabel: 'Why (e.g. injured after the first bout)',
                    message: 'Bouts they still have are completed as walkovers for the opponent; finished results stay.',
                    run: (reason) => action.run(() => tms.withdrawPlayer(tid, p.id, reason), `${p.name} withdrawn`).then(load),
                  })}><DirectionsWalk fontSize="small" /></IconButton></Tooltip>
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
            onPreview={(csv) => tms.bulkPreview(tid, csv, null)} onImport={(csv, opts) => tms.bulkImport(tid, csv, null, opts)}
            onDone={() => { setView('players'); load() }} />
        </Stack>
      )}

      <Dialog open={!!teamEdit} onClose={() => { setTeamEdit(null); setTeamTouched(false) }} maxWidth="md" fullWidth>
        <DialogTitle>{teamEdit?.id ? 'Edit team' : 'Add team'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {teamEdit?.teamNumber && (
              <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth disabled label="Team reference" value={teamEdit.teamNumber} /></Grid>
            )}
            {TEAM_FIELDS.map(([k, label, w]) => (
              <Grid key={k} size={{ xs: 12, sm: w }}>
                <TextField fullWidth required={k === 'name'} label={label} value={teamEdit?.[k] || ''} onChange={(e) => setTeamEdit({ ...teamEdit, [k]: e.target.value })}
                  error={!!teamErrors[k] && teamTouched} helperText={teamTouched ? teamErrors[k] : undefined} />
              </Grid>
            ))}
            <Grid size={{ xs: 12 }}>
              <FormControlLabel control={<Switch checked={teamEdit?.active !== false} onChange={(e) => setTeamEdit({ ...teamEdit, active: e.target.checked })} />} label="Active (can add players)" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTeamEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={action.busy} onClick={async () => {
            // Checked here first, with the same rules the server applies.
            setTeamTouched(true)
            if (Object.keys(teamErrors).length) return
            const doc = { ...Object.fromEntries(TEAM_FIELDS.map(([k]) => [k, teamEdit[k] || null]).filter(([, v]) => v !== null || teamEdit.id)), active: teamEdit.active !== false }
            const ok = await action.run(() => (teamEdit.id ? tms.teams.update(tid, teamEdit.id, doc) : tms.teams.create(tid, doc)), 'Team saved')
            if (ok) { setTeamEdit(null); setTeamTouched(false); load() }
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
          <Button variant="contained" disabled={action.busy} onClick={() => savePlayer()}>Save</Button>
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
          <Button variant="contained" disabled={action.busy} onClick={async () => {
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
          <Button variant="contained" disabled={action.busy || !override?.reason?.trim()} onClick={async () => {
            const o = override
            const ok = await action.run(() => tms.overrideCategory(tid, o.player.id, o.event, { ageGroupId: o.ageGroupId || null, weightCategoryId: o.weightCategoryId || null }, o.reason), 'Category updated')
            if (ok) { setOverride(null); load() }
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!duplicates} title="Possible duplicate" confirmLabel="Register anyway"
        message={duplicates ? `This player looks like ${duplicates.map((d) => `${d.name} (${d.playerNumber || 'no ID'}, born ${d.dob}${d.club ? `, ${d.club}` : ''})`).join('; ')}. Register them anyway? The confirmation is recorded in the audit log.` : ''}
        onClose={() => setDuplicates(null)} onConfirm={() => savePlayer(true)} />
      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} requireReason={confirm?.requireReason}
        reasonLabel={confirm?.reasonLabel} danger={confirm?.danger} confirmLabel={confirm?.confirmLabel}
        onClose={() => setConfirm(null)} onConfirm={(reason) => { const c = confirm; setConfirm(null); c.run(reason) }} />
    </Stack>
  )
}
