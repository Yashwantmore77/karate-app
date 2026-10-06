import { useEffect, useState } from 'react'
import {
  Paper, Typography, Grid, TextField, MenuItem, Button, Stack, Switch, FormControlLabel, IconButton, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Checkbox, Alert, InputAdornment, Tooltip, Box,
} from '@mui/material'
import { ArrowUpward, ArrowDownward, Delete, Add, ContentCopy } from '@mui/icons-material'
import { formFields, FIELD_TYPES } from '@kumite/shared/registration.js'
import { settingsOf } from '@kumite/shared/tms.js'
import { tms } from '../../data/tms'

const DETAIL_FIELDS = [
  ['name', 'Tournament name', 12], ['description', 'Description', 12],
  ['organizer', 'Organizer', 6], ['association', 'Organizing association', 6],
  ['venue', 'Venue', 6], ['location', 'Location (shown in lists)', 6], ['address', 'Address', 12],
  ['city', 'City', 3], ['district', 'District', 3], ['state', 'State', 3], ['country', 'Country', 3],
  ['contactPerson', 'Contact person', 4], ['contactMobile', 'Contact mobile', 4], ['contactEmail', 'Contact email', 4],
  ['logoUrl', 'Logo URL', 6], ['slug', 'Public address (slug)', 6],
]
const DATE_FIELDS = [
  ['registrationStart', 'Registration start'], ['registrationClose', 'Registration closing'], ['weighInDate', 'Weigh-in date'],
  ['startDate', 'Tournament start'], ['endDate', 'Tournament end'],
]
const NUMBER_SETTINGS = [
  ['poolSize', 'Maximum pool size', 'Rule 3: default 8'], ['qualifiersPerPool', 'Qualifiers per pool', 'Into the final stage'],
  ['pointsForWin', 'Standing points for a win'], ['pointsForDraw', 'Standing points for a draw'],
  ['bronzeCount', 'Bronze medals per category', '0, 1 or 2'], ['mats', 'Number of mats'],
  ['matchDurationSec', 'Match duration (seconds)'], ['pointGap', 'Winning point gap'],
]

const pick = (t) => Object.fromEntries([...DETAIL_FIELDS.map(([k]) => k), ...DATE_FIELDS.map(([k]) => k), 'masterAgeDate', 'type', 'date']
  .map((k) => [k, t[k] ?? '']))

/** Sections 5, 11, 14 and the configurable rules of section 29/34. */
export default function SetupTab({ tournament, reload, action }) {
  const tid = tournament.id
  const [details, setDetails] = useState(() => pick(tournament))
  const [settings, setSettings] = useState(() => settingsOf(tournament))
  const [fields, setFields] = useState(() => formFields(tournament))
  const [link, setLink] = useState(null)
  const [linkPassword, setLinkPassword] = useState('')
  const [linkExpiry, setLinkExpiry] = useState('')

  useEffect(() => {
    tms.link(tid).then((l) => { setLink(l); setLinkExpiry(l?.expiresAt?.slice(0, 10) || '') }).catch(() => {})
  }, [tid])

  const saveDetails = () => {
    const patch = {}
    for (const [k, v] of Object.entries(details)) {
      const before = tournament[k] ?? ''
      if (v !== before) patch[k] = v === '' ? (['name', 'location', 'date'].includes(k) ? before : null) : v
    }
    if (patch.slug) patch.slug = String(patch.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    if (!Object.keys(patch).length) return
    action.run(() => tms.updateTournament(tid, patch), 'Tournament saved').then(reload)
  }

  const saveSettings = () => {
    const out = {}
    for (const [k] of NUMBER_SETTINGS) out[k] = Number(settings[k])
    out.weighInAutoMove = !!settings.weighInAutoMove
    out.fees = Object.fromEntries(Object.entries(settings.fees).map(([k, v]) => [k, Number(v) || 0]))
    action.run(() => tms.updateSettings(tid, out), 'Settings saved').then(reload)
  }

  const saveLink = (body) => action.run(() => tms.saveLink(tid, body), 'Registration link saved').then((l) => { if (l) setLink(l) })
  const linkUrl = link ? `${window.location.origin}/register/${link.token}` : ''

  const move = (i, d) => setFields((fs) => {
    const next = [...fs]
    const j = i + d
    if (j < 0 || j >= next.length) return fs
    ;[next[i], next[j]] = [next[j], next[i]]
    return next.map((f, order) => ({ ...f, order }))
  })
  const patchField = (i, patch) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Tournament details</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField select fullWidth label="Tournament type" value={details.type || ''} onChange={(e) => setDetails({ ...details, type: e.target.value })}>
              <MenuItem value="kata">Kata</MenuItem>
              <MenuItem value="kumite">Kumite</MenuItem>
              <MenuItem value="kata_kumite">Kata + Kumite</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth required type="date" label="Master Age Calculation Date" slotProps={{ inputLabel: { shrink: true } }}
              value={details.masterAgeDate || ''} onChange={(e) => setDetails({ ...details, masterAgeDate: e.target.value })}
              helperText="Every age is calculated against this date (Rule 1)" disabled={tournament.entriesLocked} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth type="date" label="Listing date" slotProps={{ inputLabel: { shrink: true } }} value={details.date || ''}
              onChange={(e) => setDetails({ ...details, date: e.target.value })} />
          </Grid>
          {DATE_FIELDS.map(([k, label]) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 2.4 }}>
              <TextField fullWidth type="date" label={label} slotProps={{ inputLabel: { shrink: true } }} value={details[k] || ''}
                onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
            </Grid>
          ))}
          {DETAIL_FIELDS.map(([k, label, w]) => (
            <Grid key={k} size={{ xs: 12, sm: w }}>
              <TextField fullWidth label={label} value={details[k] || ''} multiline={k === 'description'}
                onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
            </Grid>
          ))}
        </Grid>
        <Button size="large" variant="contained" sx={{ mt: 2 }} onClick={saveDetails} disabled={action.busy}>Save details</Button>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Competition rules</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Configured per tournament, never hard-coded (sections 22, 29, 34, 35).</Typography>
        <Grid container spacing={2}>
          {NUMBER_SETTINGS.map(([k, label, help]) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth type="number" label={label} helperText={help} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
            </Grid>
          ))}
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" color="text.secondary">Tie-breakers, in order: {settings.tieBreakers.join(' → ')}</Typography>
          </Grid>
          {Object.keys(settings.fees).map((k) => (
            <Grid key={k} size={{ xs: 6, md: 3 }}>
              <TextField fullWidth type="number" label={`Fee: ${k === 'both' ? 'Kata + Kumite' : k}`} value={settings.fees[k]}
                onChange={(e) => setSettings({ ...settings, fees: { ...settings.fees, [k]: e.target.value } })}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
            </Grid>
          ))}
          <Grid size={{ xs: 12 }}>
            <FormControlLabel control={<Switch checked={!!settings.weighInAutoMove} onChange={(e) => setSettings({ ...settings, weighInAutoMove: e.target.checked })} />}
              label="Weigh-in may move a player to the weight category their actual weight fits" />
          </Grid>
        </Grid>
        <Button size="large" variant="contained" sx={{ mt: 1 }} onClick={saveSettings} disabled={action.busy}>Save rules</Button>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Registration link</Typography>
        {!link && <Button variant="contained" onClick={() => saveLink({})}>Generate link</Button>}
        {link && (
          <Stack spacing={2}>
            <TextField fullWidth label="Link for coaches" value={linkUrl} slotProps={{
              input: {
                readOnly: true,
                endAdornment: <InputAdornment position="end"><Tooltip title="Copy"><IconButton aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(linkUrl)}><ContentCopy /></IconButton></Tooltip></InputAdornment>,
              },
            }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={link.hasPassword ? 'New password (leave blank to keep)' : 'Password (optional)'} type="password" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} />
              <Button variant="outlined" onClick={() => { saveLink({ password: linkPassword }); setLinkPassword('') }} disabled={!linkPassword}>Set password</Button>
              {link.hasPassword && <Button variant="outlined" color="warning" onClick={() => saveLink({ password: '' })}>Remove password</Button>}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <TextField type="date" label="Expires on" slotProps={{ inputLabel: { shrink: true } }} value={linkExpiry} onChange={(e) => setLinkExpiry(e.target.value)} />
              <Button variant="outlined" onClick={() => saveLink({ expiresAt: linkExpiry ? `${linkExpiry}T23:59:59.000Z` : null })}>Save expiry</Button>
              <FormControlLabel control={<Switch checked={!!link.active} onChange={(e) => saveLink({ active: e.target.checked })} />} label={link.active ? 'Enabled' : 'Disabled'} />
              <Button color="warning" onClick={() => saveLink({ regenerate: true })}>Regenerate link</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {link.hasPassword ? 'Password protected.' : 'No password.'} Coaches can register only while the tournament is in Registration open and entries are not locked.
            </Typography>
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" gutterBottom>Registration form</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>Name, DOB, gender, event and weight drive categorisation: they can be renamed but not removed or hidden.</Alert>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell><TableCell>Label</TableCell><TableCell>Type</TableCell><TableCell>Options (comma separated)</TableCell>
                <TableCell>Required</TableCell><TableCell>Shown</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((f, i) => (
                <TableRow key={f.key}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUpward fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDownward fontSize="small" /></IconButton>
                  </TableCell>
                  <TableCell><TextField size="small" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} /></TableCell>
                  <TableCell>
                    <TextField select size="small" value={f.type} disabled={f.system} onChange={(e) => patchField(i, { type: e.target.value })}>
                      {FIELD_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    {['dropdown', 'radio', 'checkbox'].includes(f.type) && (
                      <TextField size="small" disabled={f.system} value={(f.options || []).join(', ')} onChange={(e) => patchField(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                    )}
                  </TableCell>
                  <TableCell><Checkbox checked={!!f.required} disabled={f.system} onChange={(e) => patchField(i, { required: e.target.checked })} /></TableCell>
                  <TableCell><Checkbox checked={f.visible !== false} disabled={f.system} onChange={(e) => patchField(i, { visible: e.target.checked })} /></TableCell>
                  <TableCell>
                    {!f.system && <IconButton size="small" aria-label="Remove field" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><Delete fontSize="small" /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Button startIcon={<Add />} onClick={() => setFields((fs) => [...fs, { key: `custom${Date.now().toString(36)}`, label: 'New field', type: 'text', required: false, visible: true, order: fs.length }])}>Add field</Button>
          <Button variant="contained" onClick={() => action.run(() => tms.saveForm(tid, fields), 'Registration form saved').then((t) => { if (t) setFields(formFields(t)); reload() })}>Save form</Button>
        </Box>
      </Paper>
    </Stack>
  )
}
