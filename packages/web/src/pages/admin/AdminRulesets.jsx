import { useEffect, useState } from 'react'
import {
  Container, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Grid, MenuItem, Switch,
  FormControlLabel, IconButton, Tooltip, Alert,
} from '@mui/material'
import { Add, Edit, ContentCopy } from '@mui/icons-material'
import { OVERTIME_MODES, KATA_TIE_BREAKS } from '@kumite/shared/rulesets.js'
import { KATA_METHODS } from '@kumite/shared/tms.js'
import { KATA_METHOD_LABEL, KATA_TIE_BREAK_LABEL } from '@kumite/shared/kata.js'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import StatusBadge from '../../components/tms/StatusBadge'
import useAction from '../../components/tms/useAction'
import { useLoading } from '../../components/Loader'
import { OVERTIME_LABEL } from '../../components/tms/AdvancedSettings'

const KUMITE_NUMBERS = [['matchDurationSec', 'Bout length (seconds)'], ['pointGap', 'Winning point gap'], ['extraTimeSec', 'Extra time (seconds)'], ['penaltyCategories', 'Penalty categories (1 or 2)']]
const KATA_NUMBERS = [['kataJudges', 'Judges'], ['kataMinScore', 'Lowest score'], ['kataMaxScore', 'Highest score'], ['kataPrecision', 'Decimals'], ['kataRounds', 'Rounds'], ['kataQualifiers', 'Qualifiers'], ['kataTechnicalWeight', 'Technical weight']]

/**
 * PRD v1 §6, §14, §24: versioned rulesets. Editing a ruleset a tournament
 * already uses makes a new version; tournaments keep the version they applied.
 */
export default function AdminRulesets() {
  const action = useAction()
  const [rows, setRows] = useState([])
  const [all, setAll] = useState(false)
  const [edit, setEdit] = useState(null)
  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(tms.rulesets(all).then(setRows).catch(() => setRows([])))
  useEffect(() => { load() }, [all])

  const setK = (k, v) => setEdit({ ...edit, kumite: { ...edit.kumite, [k]: v } })
  const setKata = (k, v) => setEdit({ ...edit, kata: { ...edit.kata, [k]: v } })
  const numeric = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v]))
  const save = async () => {
    const body = {
      name: edit.name, description: edit.description || null,
      kumite: { ...numeric(edit.kumite), points: numeric(edit.kumite.points || {}), penaltyLadder: String(edit.kumite.penaltyLadder || '').split(',').map((x) => x.trim()).filter(Boolean) },
      kata: numeric(edit.kata),
    }
    const ok = await action.run(() => (edit.id ? tms.updateRuleset(edit.id, body) : tms.createRuleset(body)), (r) => `Saved ${r.name} v${r.version}`)
    if (ok) { setEdit(null); load() }
  }
  const open = (r, copy = false) => setEdit({
    ...(copy ? {} : { id: r.id }), name: copy ? `${r.name} (copy)` : r.name, description: r.description || '',
    kumite: { ...r.kumite, penaltyLadder: (r.kumite.penaltyLadder || []).join(', ') }, kata: { ...r.kata },
  })

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>Rulesets</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>A tournament applies a ruleset in Settings. Changing one that is in use creates a new version; tournaments keep the version they applied until they apply again. Built-in rulesets cannot be edited — copy one instead.</Alert>
      <DataTable rows={rows} loading={loading} refreshing={refreshing} empty="No rulesets."
        toolbar={(
          <>
            <FormControlLabel control={<Switch checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Show older versions" />
            <Button variant="contained" startIcon={<Add />} onClick={() => rows[0] && open(rows[0], true)}>New ruleset</Button>
          </>
        )}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'version', label: 'Version', render: (r) => `v${r.version}` },
          { key: 'kumite', label: 'Kumite', sortable: false, value: (r) => `${r.kumite.matchDurationSec}s, gap ${r.kumite.pointGap}, ${r.kumite.overtime}`, render: (r) => `${r.kumite.matchDurationSec}s · gap ${r.kumite.pointGap} · ${OVERTIME_LABEL[r.kumite.overtime] || r.kumite.overtime}` },
          { key: 'kata', label: 'Kata', sortable: false, value: (r) => `${r.kata.kataJudges} judges`, render: (r) => `${r.kata.kataJudges} judges · ${r.kata.kataMinScore}–${r.kata.kataMaxScore}${r.kata.kataComponents ? ' · technical/athletic' : ''}` },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.supersededBy ? 'DRAFT' : r.active === false ? 'REJECTED' : 'APPROVED'} label={r.supersededBy ? 'Superseded' : r.active === false ? 'Inactive' : r.builtIn ? 'Built-in' : 'Active'} /> },
          { key: 'actions', label: '', sortable: false, render: (r) => (
            <Stack direction="row">
              {!r.builtIn && !r.supersededBy && <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${r.name}`} onClick={() => open(r)}><Edit fontSize="small" /></IconButton></Tooltip>}
              <Tooltip title="Copy"><IconButton size="small" aria-label={`Copy ${r.name}`} onClick={() => open(r, true)}><ContentCopy fontSize="small" /></IconButton></Tooltip>
              {!r.builtIn && !r.supersededBy && (
                <Switch size="small" checked={r.active !== false} slotProps={{ input: { 'aria-label': `${r.name} active` } }}
                  onChange={(e) => action.run(() => tms.setRulesetActive(r.id, e.target.checked), e.target.checked ? 'Activated' : 'Deactivated').then(load)} />
              )}
            </Stack>
          ) },
        ]} />

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{edit?.id ? `Edit ${edit.name}` : 'New ruleset'}</DialogTitle>
        <DialogContent>
          {edit && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Grid>
              <Grid size={{ xs: 12 }}><Typography variant="h4">Kumite</Typography></Grid>
              {KUMITE_NUMBERS.map(([k, label]) => (
                <Grid key={k} size={{ xs: 6, md: 3 }}><TextField fullWidth type="number" label={label} value={edit.kumite[k] ?? ''} onChange={(e) => setK(k, e.target.value)} /></Grid>
              ))}
              {['yuko', 'wazaAri', 'ippon'].map((k) => (
                <Grid key={k} size={{ xs: 4, md: 2 }}><TextField fullWidth type="number" label={`${k === 'wazaAri' ? 'Waza-ari' : k[0].toUpperCase() + k.slice(1)} points`} value={edit.kumite.points?.[k] ?? ''}
                  onChange={(e) => setK('points', { ...edit.kumite.points, [k]: e.target.value })} /></Grid>
              ))}
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField select fullWidth label="Tie at time" value={edit.kumite.overtime || 'senshu'} onChange={(e) => setK('overtime', e.target.value)}>
                  {OVERTIME_MODES.map((m) => <MenuItem key={m} value={m}>{OVERTIME_LABEL[m]}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}><TextField fullWidth label="Penalty ladder" value={edit.kumite.penaltyLadder} onChange={(e) => setK('penaltyLadder', e.target.value)} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><FormControlLabel control={<Switch checked={edit.kumite.senshu !== false} onChange={(e) => setK('senshu', e.target.checked)} />} label="Senshu" /></Grid>
              <Grid size={{ xs: 12 }}><Typography variant="h4">Kata</Typography></Grid>
              {KATA_NUMBERS.map(([k, label]) => (
                <Grid key={k} size={{ xs: 6, md: 12 / 7 }}><TextField fullWidth type="number" label={label} value={edit.kata[k] ?? ''} onChange={(e) => setKata(k, e.target.value)} /></Grid>
              ))}
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select fullWidth label="Calculation" value={edit.kata.kataMethod || KATA_METHODS[0]} onChange={(e) => setKata('kataMethod', e.target.value)}>
                  {KATA_METHODS.map((m) => <MenuItem key={m} value={m}>{KATA_METHOD_LABEL[m]}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select fullWidth label="Tie-break" value={edit.kata.kataTieBreak || KATA_TIE_BREAKS[0]} onChange={(e) => setKata('kataTieBreak', e.target.value)}>
                  {KATA_TIE_BREAKS.map((m) => <MenuItem key={m} value={m}>{KATA_TIE_BREAK_LABEL[m]}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={!!edit.kata.kataComponents} onChange={(e) => setKata('kataComponents', e.target.checked)} />} label="Technical + athletic" /></Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={!edit?.name?.trim() || action.busy} onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
      {action.feedback}
    </Container>
  )
}
