import { useEffect, useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem, Typography } from '@mui/material'
import { CALCULATED_FORMULAS, SYSTEM_SOURCES, safePattern } from '@kumite/shared/registration.js'

const CHOICE_TYPES = ['dropdown', 'radio', 'checkbox', 'multiselect']

/**
 * PRD v1 §8 field properties: help text, placeholder, default, validation
 * (pattern, min / max), conditional display and, for computed fields, what
 * the system fills in. The server keeps only what is valid.
 */
export default function FieldPropertiesDialog({ field, fields, onSave, onClose }) {
  const [draft, setF] = useState(field)
  useEffect(() => { setF(field) }, [field])
  if (!field) return null
  // The first render of a newly opened field comes before the effect above.
  const f = draft && draft.key === field.key ? draft : field
  const set = (k, v) => setF((x) => ({ ...(x && x.key === field.key ? x : field), [k]: v }))
  const others = fields.filter((o) => o.key !== field.key)
  const trigger = others.find((o) => o.key === f.showIf?.field)
  const badPattern = f.pattern && !safePattern(f.pattern)
  const numeric = ['number', 'date'].includes(f.type)

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Field properties: {field.label}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {f.type === 'calculated' && (
            <Grid size={{ xs: 12 }}>
              <TextField select fullWidth label="Calculated from" value={f.formula || ''} onChange={(e) => set('formula', e.target.value)}>
                {Object.entries(CALCULATED_FORMULAS).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          {f.type === 'system' && (
            <Grid size={{ xs: 12 }}>
              <TextField select fullWidth label="Shows" value={f.source || ''} onChange={(e) => set('source', e.target.value)}>
                {Object.entries(SYSTEM_SOURCES).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          {CHOICE_TYPES.includes(f.type) && !f.system && (
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Options (comma separated)" value={(f.options || []).join(', ')}
                onChange={(e) => set('options', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label="Help text" value={f.helpText || ''} onChange={(e) => set('helpText', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Placeholder" value={f.placeholder || ''} onChange={(e) => set('placeholder', e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Default value" value={Array.isArray(f.defaultValue) ? f.defaultValue.join(', ') : f.defaultValue || ''}
              disabled={['calculated', 'system', 'file'].includes(f.type)} onChange={(e) => set('defaultValue', f.type === 'multiselect' ? e.target.value.split(',').map((x) => x.trim()).filter(Boolean) : e.target.value)} />
          </Grid>
          {['text', 'textarea', 'phone', 'email'].includes(f.type) && (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Pattern (regular expression)" value={f.pattern || ''} error={!!badPattern}
                  helperText={badPattern ? 'Not a valid pattern' : 'e.g. [A-Z]{2}[0-9]{6}'} onChange={(e) => set('pattern', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Message when it does not match" value={f.patternMessage || ''} onChange={(e) => set('patternMessage', e.target.value)} />
              </Grid>
            </>
          )}
          {(numeric || ['text', 'textarea'].includes(f.type)) && (
            <>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth type="number" label={numeric ? 'Minimum' : 'Minimum length'} value={f.min ?? ''} onChange={(e) => set('min', e.target.value === '' ? null : e.target.value)} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth type="number" label={numeric ? 'Maximum' : 'Maximum length'} value={f.max ?? ''} onChange={(e) => set('max', e.target.value === '' ? null : e.target.value)} />
              </Grid>
            </>
          )}
          {!f.system && (
            <>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2">Show only when</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth label="Field" value={f.showIf?.field || ''} onChange={(e) => set('showIf', e.target.value ? { field: e.target.value, equals: '' } : null)}>
                  <MenuItem value="">Always shown</MenuItem>
                  {others.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
                </TextField>
              </Grid>
              {f.showIf?.field && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  {trigger?.options?.length ? (
                    <TextField select fullWidth label="Equals" value={f.showIf.equals || ''} onChange={(e) => set('showIf', { ...f.showIf, equals: e.target.value })}>
                      {trigger.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </TextField>
                  ) : (
                    <TextField fullWidth label="Equals" value={f.showIf.equals || ''} onChange={(e) => set('showIf', { ...f.showIf, equals: e.target.value })} />
                  )}
                </Grid>
              )}
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!!badPattern} onClick={() => onSave(f)}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}
