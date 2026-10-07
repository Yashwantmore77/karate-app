import { useEffect, useState } from 'react'
import {
  Paper, Typography, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid,
  Switch, FormControlLabel, IconButton, Alert, Box,
} from '@mui/material'
import { Add, Edit, Delete, Tune } from '@mui/icons-material'
import { settingsOf, POOL_SYSTEMS, KATA_METHODS } from '@kumite/shared/tms.js'
import { POOL_MODES } from '@kumite/shared/pools.js'
import { KATA_METHOD_LABEL } from '@kumite/shared/kata.js'
import { tms } from '../../data/tms'
import { POOL_MODE_LABEL, POOL_SYSTEM_LABEL } from './SetupTab'
import DataTable from '../../components/tms/DataTable'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import StatusBadge from '../../components/tms/StatusBadge'
import { useLoading } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

const GENDER = { M: 'Boys / Men', F: 'Girls / Women', Mixed: 'Mixed' }
const num = (v) => (v === '' || v == null ? null : Number(v))

// PRD point 3: what one category may set for itself. Blank inherits from the
// age group, then the tournament.
const NUMBER_RULES = [
  ['poolSize', 'Maximum pool size'], ['qualifiersPerPool', 'Qualifiers per pool'], ['matchDurationSec', 'Match duration (s)'],
  ['pointGap', 'Winning point gap'], ['kataJudges', 'Kata judges'], ['kataQualifiers', 'Kata qualifiers'], ['kataRounds', 'Kata rounds'],
]
const CHOICE_RULES = [
  ['poolMode', 'Pool split', POOL_MODES, POOL_MODE_LABEL], ['poolSystem', 'Competition system', POOL_SYSTEMS, POOL_SYSTEM_LABEL],
  ['kataMethod', 'Kata calculation', KATA_METHODS, KATA_METHOD_LABEL],
]
const rulesSummary = (settings = {}) => Object.entries(settings).map(([k, v]) => {
  const choice = CHOICE_RULES.find(([key]) => key === k)
  const label = (NUMBER_RULES.find(([key]) => key === k) || choice || [k, k])[1]
  return `${label}: ${choice ? (choice[3][v] || v) : v}`
}).join(' · ')

/** Sections 7 and 9: age groups, and the weight categories inside each. */
export default function CategoriesTab({ tournament, version, action }) {
  const tid = tournament.id
  const [groups, setGroups] = useState([])
  const [weights, setWeights] = useState([])
  const [editing, setEditing] = useState(null) // { kind, row }
  const [removing, setRemoving] = useState(null)
  const [rules, setRules] = useState(null) // { kind, row, settings }
  const locked = !!tournament.entriesLocked
  const base = settingsOf(tournament)

  const saveRules = async () => {
    const { kind, row, settings } = rules
    const api = kind === 'group' ? tms.ageGroups : tms.weightCategories
    const clean = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, NUMBER_RULES.some(([key]) => key === k) ? Number(v) : v]))
    const ok = await action.run(() => api.update(tid, row.id, { settings: clean }), 'Category rules saved')
    if (ok) { setRules(null); load() }
  }
  const rulesButton = (kind, row) => (
    <IconButton size="small" aria-label="Category rules" title="Category rules (pool size, duration, rounds)" onClick={() => setRules({ kind, row, settings: { ...(row.settings || {}) } })}><Tune fontSize="small" /></IconButton>
  )

  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(Promise.all([tms.ageGroups.list(tid), tms.weightCategories.list(tid)]).then(([g, w]) => { setGroups(g); setWeights(w) }))
  useEffect(() => { load() }, [tid, version])

  const save = async () => {
    const { kind, row } = editing
    const api = kind === 'group' ? tms.ageGroups : tms.weightCategories
    const doc = kind === 'group'
      ? { name: row.name, gender: row.gender, minAge: Number(row.minAge), maxAge: Number(row.maxAge), active: row.active !== false }
      : { ageGroupId: row.ageGroupId, name: row.name, label: row.label || null, minWeight: num(row.minWeight), maxWeight: num(row.maxWeight), active: row.active !== false }
    const ok = await action.run(() => (row.id ? api.update(tid, row.id, doc) : api.create(tid, doc)), 'Saved')
    if (ok) { setEditing(null); load() }
  }

  const groupName = (id) => groups.find((g) => g.id === id)?.name || '—'
  const r = editing?.row || {}
  const set = (patch) => setEditing({ ...editing, row: { ...r, ...patch } })

  return (
    <Stack spacing={3}>
      {locked && <Alert severity="info">Entries are locked, so categories are frozen (section 21).</Alert>}
      <Box>
        <HelpTitle id="categories.age" variant="h3" gutterBottom>Age groups</HelpTitle>
        <DataTable
          rows={groups}
          loading={loading} refreshing={refreshing}
          empty="No age groups yet. Add e.g. Boys 12-13."
          toolbar={<Button variant="contained" startIcon={<Add />} disabled={locked} onClick={() => setEditing({ kind: 'group', row: { gender: 'M', minAge: '', maxAge: '', active: true } })}>Add age group</Button>}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'gender', label: 'Gender', render: (g) => GENDER[g.gender] || g.gender },
            { key: 'minAge', label: 'Min age' },
            { key: 'maxAge', label: 'Max age' },
            { key: 'weights', label: 'Weight categories', value: (g) => weights.filter((w) => w.ageGroupId === g.id).length, render: (g) => weights.filter((w) => w.ageGroupId === g.id).map((w) => w.label || w.name).join(', ') || '—' },
            { key: 'rules', label: 'Own rules', sortable: false, value: (g) => rulesSummary(g.settings), render: (g) => rulesSummary(g.settings) || 'Tournament defaults' },
            { key: 'active', label: 'Status', render: (g) => <StatusBadge status={g.active !== false ? 'APPROVED' : 'DRAFT'} label={g.active !== false ? 'Active' : 'Inactive'} /> },
            { key: 'actions', label: '', sortable: false, render: (g) => (
              <Stack direction="row">
                {rulesButton('group', g)}
                <IconButton size="small" aria-label="Edit" disabled={locked} onClick={() => setEditing({ kind: 'group', row: g })}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Delete" disabled={locked} onClick={() => setRemoving({ kind: 'group', row: g })}><Delete fontSize="small" /></IconButton>
              </Stack>
            ) },
          ]}
        />
      </Box>

      <Box>
        <HelpTitle id="categories.weight" variant="h3" gutterBottom>Weight categories (Kumite)</HelpTitle>
        <DataTable
          rows={weights}
          loading={loading} refreshing={refreshing}
          empty="No weight categories yet. Add e.g. -35 KG under Boys 12-13."
          toolbar={<Button variant="contained" startIcon={<Add />} disabled={locked || !groups.length} onClick={() => setEditing({ kind: 'weight', row: { ageGroupId: groups[0]?.id, active: true } })}>Add weight category</Button>}
          columns={[
            { key: 'ageGroupId', label: 'Age group', value: (w) => groupName(w.ageGroupId), render: (w) => groupName(w.ageGroupId) },
            { key: 'name', label: 'Name' },
            { key: 'label', label: 'Display label', render: (w) => w.label || w.name },
            { key: 'minWeight', label: 'Above (kg)', render: (w) => w.minWeight ?? '—' },
            { key: 'maxWeight', label: 'Up to (kg)', render: (w) => w.maxWeight ?? '—' },
            { key: 'rules', label: 'Own rules', sortable: false, value: (w) => rulesSummary(w.settings), render: (w) => rulesSummary(w.settings) || 'As age group' },
            { key: 'active', label: 'Status', render: (w) => <StatusBadge status={w.active !== false ? 'APPROVED' : 'DRAFT'} label={w.active !== false ? 'Active' : 'Inactive'} /> },
            { key: 'actions', label: '', sortable: false, render: (w) => (
              <Stack direction="row">
                {rulesButton('weight', w)}
                <IconButton size="small" aria-label="Edit" disabled={locked} onClick={() => setEditing({ kind: 'weight', row: w })}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Delete" disabled={locked} onClick={() => setRemoving({ kind: 'weight', row: w })}><Delete fontSize="small" /></IconButton>
              </Stack>
            ) },
          ]}
        />
      </Box>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{r.id ? 'Edit' : 'Add'} {editing?.kind === 'group' ? 'age group' : 'weight category'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {editing?.kind === 'group' ? (
              <>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Name" value={r.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="Boys 12-13" /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField select fullWidth label="Gender" value={r.gender || 'M'} onChange={(e) => set({ gender: e.target.value })}>
                    {Object.entries(GENDER).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Minimum age" value={r.minAge ?? ''} onChange={(e) => set({ minAge: e.target.value })} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Maximum age" value={r.maxAge ?? ''} onChange={(e) => set({ maxAge: e.target.value })} /></Grid>
              </>
            ) : (
              <>
                <Grid size={{ xs: 12 }}>
                  <TextField select fullWidth label="Age group" value={r.ageGroupId || ''} onChange={(e) => set({ ageGroupId: e.target.value })}>
                    {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Category name" value={r.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="-35 KG" /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Display label" value={r.label || ''} onChange={(e) => set({ label: e.target.value })} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Above (kg)" helperText="Blank for no lower bound" value={r.minWeight ?? ''} onChange={(e) => set({ minWeight: e.target.value })} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Up to (kg)" helperText="Blank for +KG (open)" value={r.maxWeight ?? ''} onChange={(e) => set({ maxWeight: e.target.value })} /></Grid>
              </>
            )}
            <Grid size={{ xs: 12 }}>
              <FormControlLabel control={<Switch checked={r.active !== false} onChange={(e) => set({ active: e.target.checked })} />} label="Active" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={action.busy}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!rules} onClose={() => setRules(null)} maxWidth="md" fullWidth>
        <DialogTitle>Rules for {rules?.row?.label || rules?.row?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Leave a field blank to use {rules?.kind === 'weight' ? 'the age group\'s or ' : ''}the tournament's setting (shown in grey). Rules can change after entries are locked, until the draw is made.
          </Typography>
          <Grid container spacing={2}>
            {NUMBER_RULES.map(([k, label]) => (
              <Grid key={k} size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField fullWidth type="number" label={label} placeholder={String(base[k] ?? '')} value={rules?.settings[k] ?? ''}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onChange={(e) => setRules({ ...rules, settings: { ...rules.settings, [k]: e.target.value } })} />
              </Grid>
            ))}
            {CHOICE_RULES.map(([k, label, values, labels]) => (
              <Grid key={k} size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField select fullWidth label={label} value={rules?.settings[k] ?? ''}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => setRules({ ...rules, settings: { ...rules.settings, [k]: e.target.value } })}>
                  <MenuItem value="">Inherit ({labels[base[k]] || base[k]})</MenuItem>
                  {values.map((v) => <MenuItem key={v} value={v}>{labels[v] || v}</MenuItem>)}
                </TextField>
              </Grid>
            ))}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField fullWidth label="Ruleset" placeholder={base.ruleset} value={rules?.settings.ruleset ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) => setRules({ ...rules, settings: { ...rules.settings, ruleset: e.target.value } })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRules({ ...rules, settings: {} })}>Clear all</Button>
          <Button onClick={() => setRules(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveRules} disabled={action.busy || !!tournament.drawLocked}>Save rules</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!removing} danger title={`Delete ${removing?.row?.name}?`}
        message={removing?.kind === 'group' ? 'Its weight categories are deleted too, and players are re-categorised.' : 'Players in it are re-categorised.'}
        confirmLabel="Delete" onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const { kind, row } = removing
          setRemoving(null)
          await action.run(() => (kind === 'group' ? tms.ageGroups : tms.weightCategories).remove(tid, row.id), 'Deleted')
          load()
        }} />
    </Stack>
  )
}
