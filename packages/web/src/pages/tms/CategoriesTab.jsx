import { useEffect, useMemo, useState } from 'react'
import {
  Paper, Typography, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid,
  Switch, FormControlLabel, IconButton, Alert, AlertTitle, Box,
} from '@mui/material'
import { Add, Edit, Delete, Tune, PlaylistAdd } from '@mui/icons-material'
import { settingsOf, tournamentEvents, POOL_SYSTEMS, KATA_METHODS } from '@kumite/shared/tms.js'
import { POOL_MODES } from '@kumite/shared/pools.js'
import { weightCoverage } from '@kumite/shared/categories.js'
import { KATA_METHOD_LABEL } from '@kumite/shared/kata.js'
import { tms, describeError } from '../../data/tms'
import { CATEGORY_PRESETS, weightClasses } from '@kumite/shared/presets.js'
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
  const [editError, setEditError] = useState(null) // { text, overlap }
  const [preset, setPreset] = useState(null) // key of the set being previewed
  const locked = !!tournament.entriesLocked
  const base = settingsOf(tournament)
  // Weight categories are for Kumite only; a kata-only event has none to show.
  const hasKumite = tournamentEvents(tournament).includes('kumite')

  const saveRules = async () => {
    const { kind, row, settings } = rules
    const api = kind === 'group' ? tms.ageGroups : tms.weightCategories
    const clean = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, NUMBER_RULES.some(([key]) => key === k) ? Number(v) : v]))
    const ok = await action.run(() => api.update(tid, row.id, { settings: clean }), 'Category rules saved')
    if (ok) { setRules(null); load() }
  }
  const rulesButton = (kind, row) => (
    <IconButton size="small" aria-label="Category rules" onClick={() => setRules({ kind, row, settings: { ...(row.settings || {}) } })}><Tune fontSize="small" /></IconButton>
  )

  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(Promise.all([tms.ageGroups.list(tid), tms.weightCategories.list(tid)]).then(([g, w]) => { setGroups(g); setWeights(w) }))
  useEffect(() => { load() }, [tid, version])

  /** What is wrong with the form, said before the server has to. */
  const problemOf = ({ kind, row }) => {
    if (!String(row.name || '').trim()) return 'Give it a name.'
    if (kind === 'group') {
      if (row.minAge === '' || row.maxAge === '' || row.minAge == null || row.maxAge == null) return 'Enter the minimum and maximum age.'
      if (Number(row.maxAge) < Number(row.minAge)) return 'The maximum age must be the same as or above the minimum age.'
    } else {
      if (num(row.minWeight) == null && num(row.maxWeight) == null) return 'Enter at least one weight limit.'
      if (num(row.minWeight) != null && num(row.maxWeight) != null && num(row.maxWeight) <= num(row.minWeight)) return '"Up to" must be above "Above".'
    }
    return null
  }

  const closeEditor = () => { setEditing(null); setEditError(null) }

  const save = async () => {
    const { kind, row } = editing
    const problem = problemOf(editing)
    if (problem) { setEditError({ text: problem }); return }
    const api = kind === 'group' ? tms.ageGroups : tms.weightCategories
    const doc = kind === 'group'
      ? { name: row.name.trim(), gender: row.gender, minAge: Number(row.minAge), maxAge: Number(row.maxAge), active: row.active !== false }
      : { ageGroupId: row.ageGroupId, name: row.name.trim(), label: row.label || null, minWeight: num(row.minWeight), maxWeight: num(row.maxWeight), active: row.active !== false }
    if (row.allowOverlap !== undefined) doc.allowOverlap = !!row.allowOverlap
    try {
      await (row.id ? api.update(tid, row.id, doc) : api.create(tid, doc))
      action.notify({ severity: 'success', text: 'Saved' })
      closeEditor()
      load()
    } catch (err) {
      // An overlap is shown here, in the dialog, with the switch that allows it.
      setEditError({ text: describeError(err), overlap: /^overlapping_/.test(err?.code || '') })
    }
  }

  const loadPreset = async () => {
    const key = preset
    const done = await action.run(() => tms.applyCategoryPreset(tid, key), (r) => `Loaded ${r.ageGroups} age groups and ${r.weightCategories} weight categories`)
    if (done) { setPreset(null); load() }
  }

  const groupName = (id) => groups.find((g) => g.id === id)?.name || '—'
  // Weights an age group's classes leave without a class: gaps, and no open class at the top.
  const uncovered = useMemo(() => (!hasKumite ? [] : groups.filter((g) => g.active !== false).map((g) => {
    const cover = weightCoverage(weights.filter((w) => w.ageGroupId === g.id))
    if (!cover) return { name: g.name, notes: [] } // no classes: this group may be for kata only
    const notes = cover.gaps.map((gap) => (gap.from === 0 ? `nothing up to ${gap.to} kg` : `nothing between ${gap.from} and ${gap.to} kg`))
    if (cover.top != null) notes.push(`nothing above ${cover.top} kg (add an open class such as +${cover.top} KG)`)
    return { name: g.name, notes }
  }).filter((c) => c.notes.length)), [groups, weights, hasKumite])
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
          toolbar={(
            <>
              <Button variant="outlined" startIcon={<PlaylistAdd />} disabled={locked} onClick={() => setPreset('sgfi')}>Load standard categories</Button>
              <Button variant="contained" startIcon={<Add />} disabled={locked} onClick={() => setEditing({ kind: 'group', row: { gender: 'M', minAge: '', maxAge: '', active: true } })}>Add age group</Button>
            </>
          )}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'gender', label: 'Gender', render: (g) => GENDER[g.gender] || g.gender },
            { key: 'minAge', label: 'Min age' },
            { key: 'maxAge', label: 'Max age' },
            ...(!hasKumite ? [] : [{ key: 'weights', label: 'Weight categories', value: (g) => weights.filter((w) => w.ageGroupId === g.id).length, render: (g) => weights.filter((w) => w.ageGroupId === g.id).map((w) => w.label || w.name).join(', ') || '—' }]),
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

      {hasKumite && (
      <Box>
        <HelpTitle id="categories.weight" variant="h3" gutterBottom>Weight categories (Kumite)</HelpTitle>
        {uncovered.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Some kumite weights have no class</AlertTitle>
            {uncovered.map((c) => <Typography key={c.name} variant="body2"><b>{c.name}</b>: {c.notes.join('; ')}</Typography>)}
            <Typography variant="body2" sx={{ mt: 1 }}>A player at one of those weights gets no category, and the draw leaves them out. "-40 KG" means up to 40 kg; "+40 KG" means above 40 kg.</Typography>
          </Alert>
        )}
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
      )}

      <Dialog open={!!editing} onClose={closeEditor} maxWidth="sm" fullWidth>
        <DialogTitle>{r.id ? 'Edit' : 'Add'} {editing?.kind === 'group' ? 'age group' : 'weight category'}</DialogTitle>
        <DialogContent>
          {editError && <Alert severity={editError.overlap ? 'warning' : 'error'} sx={{ mt: 1 }}>{editError.text}</Alert>}
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
              {/* Overlap is allowed only on purpose (PRD v1 §9): offered once it happens, or kept if already set. */}
              {(editError?.overlap || r.overlapAllowed || r.allowOverlap) && (
                <FormControlLabel control={<Switch checked={!!(r.allowOverlap ?? r.overlapAllowed)} onChange={(e) => set({ allowOverlap: e.target.checked })} />}
                  label={editing?.kind === 'group' ? 'Allow overlap (a player may fit two age groups)' : 'Allow overlap with another weight class'} />
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditor}>Cancel</Button>
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

      <Dialog open={!!preset} onClose={() => setPreset(null)} maxWidth="md" fullWidth>
        <DialogTitle>Load standard categories</DialogTitle>
        <DialogContent>
          <TextField select fullWidth label="Category set" value={preset || ''} onChange={(e) => setPreset(e.target.value)} sx={{ mt: 1 }}>
            {Object.entries(CATEGORY_PRESETS).map(([key, p]) => <MenuItem key={key} value={key}>{p.label}</MenuItem>)}
          </TextField>
          {preset && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>{CATEGORY_PRESETS[preset].description} Everything can be edited after loading.</Typography>
              <Grid container spacing={1.5}>
                {CATEGORY_PRESETS[preset].groups.map((g) => (
                  <Grid key={g.name} size={{ xs: 12, sm: 6 }}>
                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                      <Typography sx={{ fontWeight: 700 }}>{g.name} <Typography component="span" variant="body2" color="text.secondary">ages {g.minAge}–{g.maxAge}</Typography></Typography>
                      {hasKumite && <Typography variant="body2" color="text.secondary">{weightClasses(g.weights).map((w) => w.name.replace(' KG', '')).join(', ')} kg</Typography>}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
              {groups.length > 0 && <Alert severity="info" sx={{ mt: 2 }}>Your existing age groups stay. If one overlaps a group in this set, you will be told which, so you can change or delete it first.</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreset(null)}>Cancel</Button>
          <Button variant="contained" onClick={loadPreset} disabled={action.busy || !preset}>Load {CATEGORY_PRESETS[preset]?.groups.length || ''} age groups</Button>
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
