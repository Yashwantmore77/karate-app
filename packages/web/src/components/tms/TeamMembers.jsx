import { useState } from 'react'
import {
  Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, Stack, IconButton,
  FormControl, FormLabel, FormGroup, FormControlLabel, Checkbox, FormHelperText, Alert,
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import { TEAM_MEMBER_ROLES, TEAM_MEMBER_ROLE_LABEL, teamProblems } from '@kumite/shared/tms.js'
import DataTable from './DataTable'
import ConfirmDialog from './ConfirmDialog'
import { describeError } from '../../data/tms'

const ROLE_HINT = {
  team_manager: 'Looks after the team on the day',
  coach: 'Sits in the coach chair',
  judge: 'Can sit on a judging panel',
  referee: 'Can referee bouts',
}
const blank = (teamId) => ({ teamId: teamId || '', name: '', roles: ['coach'], mobile: '', email: '', gender: '', qualification: '' })

/**
 * A team's people besides its players: team managers, coaches, judges and
 * referees. One person may hold several roles (a manager who also coaches,
 * a coach who also referees). Used by organisers (every team, with a team
 * column) and by a coach (their own team).
 */
export default function TeamMembers({ members, teams = null, canEdit = true, onSave, onRemove, loading = false, exportName = 'team-members' }) {
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [saving, setSaving] = useState(false)
  const teamName = (id) => teams?.find((t) => t.id === id)?.name || '—'

  const problems = edit ? {
    ...(String(edit.name || '').trim().length < 2 ? { name: 'Enter the name' } : {}),
    ...(edit.roles?.length ? {} : { roles: 'Pick at least one role' }),
    ...(teams && !edit.teamId ? { teamId: 'Pick the team' } : {}),
    ...teamProblems({ email: edit.email, mobile: edit.mobile }, { partial: true }),
  } : {}

  const toggleRole = (role) => setEdit((e) => ({ ...e, roles: e.roles.includes(role) ? e.roles.filter((r) => r !== role) : [...e.roles, role] }))

  const save = async () => {
    if (Object.keys(problems).length) { setError('Fix the marked fields first.'); return }
    setSaving(true)
    setError(null)
    try {
      const { id, teamId, ...rest } = edit
      const doc = Object.fromEntries(Object.entries(rest).filter(([k]) => ['name', 'roles', 'mobile', 'email', 'gender', 'qualification'].includes(k)).map(([k, v]) => [k, v === '' ? null : v]))
      await onSave(id ? doc : { ...doc, ...(teams ? { teamId } : {}) }, id)
      setEdit(null)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DataTable
        rows={members}
        loading={loading}
        exportName={exportName}
        searchPlaceholder="Search name, role, team"
        empty="No team members yet. Add the team manager, coaches, and any judges or referees the team brings."
        filters={[
          ...(teams ? [{ key: 'teamId', label: 'Team', value: (m) => teamName(m.teamId) }] : []),
          { key: 'role', label: 'Role', value: (m) => (m.roles || []).map((r) => TEAM_MEMBER_ROLE_LABEL[r]).join(', ') },
        ]}
        toolbar={canEdit && <Button variant="contained" startIcon={<Add />} onClick={() => { setError(null); setEdit(blank(teams?.[0]?.id)) }}>Add team member</Button>}
        columns={[
          ...(teams ? [{ key: 'teamId', label: 'Team', value: (m) => teamName(m.teamId), render: (m) => teamName(m.teamId) }] : []),
          { key: 'name', label: 'Name' },
          { key: 'roles', label: 'Roles', value: (m) => (m.roles || []).map((r) => TEAM_MEMBER_ROLE_LABEL[r]).join(', '), render: (m) => (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {(m.roles || []).map((r) => <Chip key={r} size="small" label={TEAM_MEMBER_ROLE_LABEL[r]} color={['judge', 'referee'].includes(r) ? 'info' : 'default'} />)}
            </Stack>
          ) },
          { key: 'qualification', label: 'Grade / qualification', render: (m) => m.qualification || '—' },
          { key: 'mobile', label: 'Mobile', render: (m) => m.mobile || '—' },
          { key: 'email', label: 'Email', render: (m) => m.email || '—' },
          { key: 'actions', label: '', sortable: false, render: (m) => canEdit && (
            <Stack direction="row">
              <IconButton size="small" aria-label={`Edit ${m.name}`} onClick={() => { setError(null); setEdit({ ...blank(m.teamId), ...m }) }}><Edit fontSize="small" /></IconButton>
              <IconButton size="small" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)}><Delete fontSize="small" /></IconButton>
            </Stack>
          ) },
        ]}
      />

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{edit?.id ? `Edit ${edit.name}` : 'Add team member'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {teams && !edit?.id && (
              <Grid size={{ xs: 12 }}>
                <TextField select fullWidth required label="Team" value={edit?.teamId || ''} onChange={(e) => setEdit({ ...edit, teamId: e.target.value })} error={!!problems.teamId}>
                  {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField fullWidth required label="Full name" value={edit?.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                error={!!(edit?.name && problems.name)} helperText={edit?.name ? problems.name : undefined} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Gender" value={edit?.gender || ''} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}>
                <MenuItem value="">—</MenuItem><MenuItem value="M">Male</MenuItem><MenuItem value="F">Female</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl error={!!problems.roles} component="fieldset">
                <FormLabel component="legend">Roles (tick all that apply)</FormLabel>
                <FormGroup row>
                  {TEAM_MEMBER_ROLES.map((r) => (
                    <FormControlLabel key={r} control={<Checkbox checked={!!edit?.roles?.includes(r)} onChange={() => toggleRole(r)} />}
                      label={TEAM_MEMBER_ROLE_LABEL[r]} title={ROLE_HINT[r]} />
                  ))}
                </FormGroup>
                <FormHelperText>{problems.roles || 'One person can hold several roles, e.g. Team Manager and Coach, or Coach and Referee.'}</FormHelperText>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Mobile" value={edit?.mobile || ''} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })}
                error={!!problems.mobile} helperText={problems.mobile} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Email" value={edit?.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                error={!!problems.email} helperText={problems.email} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Grade / qualification" placeholder="e.g. 2nd Dan, State referee (Grade B)" value={edit?.qualification || ''}
                onChange={(e) => setEdit({ ...edit, qualification: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!removing} danger title={`Remove ${removing?.name}?`} message="They are taken off the team. Passes and certificates already issued stay." confirmLabel="Remove"
        onClose={() => setRemoving(null)} onConfirm={async () => { const m = removing; setRemoving(null); await onRemove(m.id) }} />
    </>
  )
}
