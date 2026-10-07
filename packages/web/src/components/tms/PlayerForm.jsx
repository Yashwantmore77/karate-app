import { Grid, Stack, TextField, MenuItem, FormControl, FormLabel, RadioGroup, Radio, FormControlLabel, Checkbox, FormGroup, FormHelperText, Button, Typography, Autocomplete } from '@mui/material'
import { useState } from 'react'
import { BUILT_IN_KEYS, fieldShown, CALCULATED_FORMULAS, SYSTEM_SOURCES } from '@kumite/shared/registration.js'
import { COUNTRIES, statesOf } from '@kumite/shared/geography.js'
import { checkFile } from '@kumite/shared/files.js'
import { readFileBase64 } from './download'

const ACCEPT = 'image/png,image/jpeg,application/pdf'
const MAX_FILE = 2 * 1024 * 1024

const valueOf = (value, key) => (BUILT_IN_KEYS.has(key) ? value[key] : value.extra?.[key])

// PRD v1 §8: what a calculated or system field shows. Worked out by the
// server; until the player is saved there is nothing to show yet.
function computedValue(field, value, categoryOf) {
  if (field.type === 'system') return value[field.source] ?? null
  if (field.formula === 'age') return value.age ?? null
  if (['category', 'ageGroup', 'weightCategory'].includes(field.formula) && categoryOf) return categoryOf(value, field.formula)
  return null
}

/**
 * Renders a tournament's registration form (sections 11-12) from its field
 * list, so the admin's form builder and the coach's screen show the same thing.
 */
export default function PlayerForm({ fields, value, onChange, errors = [], teams = null, disabled = false, onUpload = null, onOpenFile = null, coach = false, categoryOf = null }) {
  const [uploading, setUploading] = useState(null)
  const [uploadError, setUploadError] = useState({})
  const set = (key, v) => {
    if (BUILT_IN_KEYS.has(key)) onChange({ ...value, [key]: v })
    else onChange({ ...value, extra: { ...(value.extra || {}), [key]: v } })
  }
  const errorFor = (key) => errors.find((e) => e.field === key)?.message

  return (
    <Grid container spacing={2}>
      {teams && (
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select fullWidth required label="Team" value={value.teamId || ''} disabled={disabled}
            onChange={(e) => onChange({ ...value, teamId: e.target.value })} error={!!errorFor('teamId')} helperText={errorFor('teamId')}>
            {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
        </Grid>
      )}
      {fields.filter((f) => f.visible !== false && fieldShown(f, (key) => valueOf(value, key))).map((field) => {
        const v = valueOf(value, field.key)
        const err = errorFor(field.key)
        if (field.type === 'calculated' || field.type === 'system') {
          const shown = computedValue(field, value, categoryOf)
          return (
            <Grid key={field.key} size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth disabled label={field.label} value={shown ?? 'Worked out when the player is saved'}
                helperText={field.helpText || CALCULATED_FORMULAS[field.formula] || SYSTEM_SOURCES[field.source] || 'Filled in by the system'} />
            </Grid>
          )
        }
        // PRD point 4: the system's Player ID is shown, never typed, and a
        // read-only field is the organisers' to fill in.
        if (field.generated) {
          return (
            <Grid key={field.key} size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth disabled label={field.label} value={v || 'Given when the player is saved'} />
            </Grid>
          )
        }
        const off = disabled || (coach && field.readOnly)
        const label = `${field.label}${field.required && !(coach && field.readOnly) ? ' *' : ''}${coach && field.readOnly ? ' (filled by organisers)' : ''}`
        const help = err || field.helpText || (field.defaultValue != null && (v == null || v === '') ? `Default: ${[].concat(field.defaultValue).join(', ')}` : undefined)
        const common = { fullWidth: true, label, disabled: off, error: !!err, helperText: help, placeholder: field.placeholder }
        let input
        if (field.type === 'multiselect') {
          input = (
            <Autocomplete multiple disabled={off} options={field.options || []} value={Array.isArray(v) ? v : []}
              onChange={(_e, list) => set(field.key, list)} renderInput={(params) => <TextField {...params} {...common} />} />
          )
        } else if (field.type === 'country') {
          input = (
            <Autocomplete disabled={off} options={COUNTRIES} value={v || null} autoHighlight
              onChange={(_e, c) => onChange(BUILT_IN_KEYS.has(field.key)
                ? { ...value, [field.key]: c || '', ...(field.key === 'country' && c !== value.country ? { state: '' } : {}) }
                : { ...value, extra: { ...(value.extra || {}), [field.key]: c || '' } })}
              renderInput={(params) => <TextField {...params} {...common} />} />
          )
        } else if (field.type === 'state' && statesOf(value.country).length) {
          input = (
            <Autocomplete disabled={off} options={statesOf(value.country)} value={v || null} autoHighlight
              onChange={(_e, st) => set(field.key, st || '')} renderInput={(params) => <TextField {...params} {...common} />} />
          )
        } else if (field.type === 'textarea') {
          input = <TextField {...common} multiline minRows={3} value={v ?? ''} onChange={(e) => set(field.key, e.target.value)} />
        } else if (field.key === 'events' || (field.type === 'checkbox' && field.options?.length)) {
          const list = Array.isArray(v) ? v : []
          input = (
            <FormControl error={!!err} disabled={off}>
              <FormLabel>{label}</FormLabel>
              <FormGroup row>
                {(field.options || []).map((opt) => (
                  <FormControlLabel key={opt} label={opt.charAt(0).toUpperCase() + opt.slice(1)} control={
                    <Checkbox checked={list.includes(opt)} onChange={(e) => set(field.key, e.target.checked ? [...list, opt] : list.filter((x) => x !== opt))} />
                  } />
                ))}
              </FormGroup>
              {err && <FormHelperText>{err}</FormHelperText>}
            </FormControl>
          )
        } else if (field.type === 'checkbox') {
          input = <FormControlLabel disabled={off} label={label} control={<Checkbox checked={!!v} onChange={(e) => set(field.key, e.target.checked)} />} />
        } else if (field.type === 'radio') {
          input = (
            <FormControl error={!!err} disabled={off}>
              <FormLabel>{label}</FormLabel>
              <RadioGroup row value={v ?? ''} onChange={(e) => set(field.key, e.target.value)}>
                {(field.options || []).map((opt) => (
                  <FormControlLabel key={opt} value={opt} control={<Radio />} label={field.key === 'gender' ? (opt === 'M' ? 'Male' : 'Female') : opt} />
                ))}
              </RadioGroup>
              {err && <FormHelperText>{err}</FormHelperText>}
            </FormControl>
          )
        } else if (field.type === 'dropdown') {
          input = (
            <TextField select {...common} value={v ?? ''} onChange={(e) => set(field.key, e.target.value)}>
              <MenuItem value="">—</MenuItem>
              {(field.options || []).map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
            </TextField>
          )
        } else if (field.type === 'file') {
          // Section 49: PNG, JPEG or PDF up to 2 MB, checked here for a quick
          // answer and again by the server against the file's real content.
          // The player keeps the stored file's id.
          const fileErr = uploadError[field.key] || err
          input = (
            <FormControl error={!!fileErr} disabled={off}>
              <FormLabel>{label}</FormLabel>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
                <Button variant="outlined" component="label" size="small" disabled={off || !onUpload || uploading === field.key}>
                  {uploading === field.key ? 'Uploading…' : v ? 'Replace file' : 'Upload file'}
                  <input hidden type="file" accept={ACCEPT} onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    if (!ACCEPT.split(',').includes(file.type) || file.size > MAX_FILE) {
                      setUploadError((x) => ({ ...x, [field.key]: 'Only PNG, JPEG or PDF up to 2 MB' }))
                      return
                    }
                    setUploading(field.key)
                    try {
                      const data = await readFileBase64(file)
                      const problem = checkFile({ name: file.name, type: file.type, data })
                      if (problem) throw Object.assign(new Error(problem), { code: problem })
                      const stored = await onUpload({ name: file.name, type: file.type, data })
                      setUploadError((x) => ({ ...x, [field.key]: null }))
                      set(field.key, stored.id)
                    } catch (error) {
                      setUploadError((x) => ({ ...x, [field.key]: error?.code === 'content_does_not_match_type' ? 'That file is not really a PNG, JPEG or PDF' : 'Upload failed' }))
                    } finally {
                      setUploading(null)
                    }
                  }} />
                </Button>
                {v && onOpenFile && <Button size="small" onClick={() => onOpenFile(v)}>View</Button>}
                {v && <Typography variant="body2" color="text.secondary">✓ Attached</Typography>}
              </Stack>
              {!onUpload && <FormHelperText>Uploads are available once the player is being registered online.</FormHelperText>}
              {fileErr && <FormHelperText>{fileErr}</FormHelperText>}
            </FormControl>
          )
        } else {
          const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'
          input = (
            <TextField {...common} type={type} value={v ?? ''}
              slotProps={{ inputLabel: type === 'date' ? { shrink: true } : undefined, htmlInput: type === 'number' ? { step: '0.1', min: field.min ?? 0, max: field.max } : type === 'date' ? undefined : { maxLength: field.max } }}
              onChange={(e) => set(field.key, type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
          )
        }
        const wide = field.key === 'events' || field.type === 'radio' || field.type === 'checkbox' || field.type === 'textarea'
        return <Grid key={field.key} size={{ xs: 12, sm: wide ? 12 : 6 }}>{input}</Grid>
      })}
    </Grid>
  )
}
