import { useEffect, useState } from 'react'
import {
  Paper, Typography, Grid, TextField, MenuItem, Button, Stack, Switch, FormControlLabel, IconButton, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Checkbox, Alert, InputAdornment, Tooltip, Box, Autocomplete,
} from '@mui/material'
import { ArrowUpward, ArrowDownward, Delete, Add, ContentCopy, Tune } from '@mui/icons-material'
import { formFields, FIELD_TYPES } from '@kumite/shared/registration.js'
import { settingsOf, POOL_SYSTEMS, KATA_METHODS, registrationReadiness } from '@kumite/shared/tms.js'
import { DEFAULT_TIME_ZONE } from '@kumite/shared/timezone.js'
import AdvancedSettings, { advancedPayload } from '../../components/tms/AdvancedSettings'
import FieldPropertiesDialog from '../../components/tms/FieldPropertiesDialog'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import { POOL_MODES } from '@kumite/shared/pools.js'
import { KATA_METHOD_LABEL } from '@kumite/shared/kata.js'
import { tms } from '../../data/tms'
import { readFileBase64 } from '../../components/tms/download'
import { checkFile } from '@kumite/shared/files.js'
import { HelpTitle } from '../../components/help/InfoTip'

const DETAIL_FIELDS = [
  ['name', 'Tournament name', 12], ['description', 'Description', 12],
  ['organizer', 'Organizer', 6], ['association', 'Organizing association', 6],
  ['venue', 'Venue', 6], ['location', 'Location (shown in lists)', 6], ['address', 'Address', 12],
  ['city', 'City', 3], ['district', 'District', 3], ['state', 'State', 3], ['country', 'Country', 3],
  ['contactPerson', 'Contact person', 4], ['contactMobile', 'Contact mobile', 4], ['contactEmail', 'Contact email', 4],
  ['logoUrl', 'Logo URL', 6], ['slug', 'Public address (slug)', 6],
]
const DATE_FIELDS = [
  ['weighInDate', 'Weigh-in date'], ['startDate', 'Tournament start'], ['endDate', 'Tournament end'],
]
// PRD v1 §6: registration opens and closes at a time, in the tournament's zone.
const WINDOW_FIELDS = [['registrationStart', 'Registration opens', 'T00:00'], ['registrationClose', 'Registration closes', 'T23:59']]
const TIME_ZONES = (() => {
  try { return Intl.supportedValuesOf('timeZone') } catch { return [DEFAULT_TIME_ZONE, 'UTC'] }
})()
const NUMBER_SETTINGS = [
  ['poolSize', 'Maximum pool size', 'Rule 3: default 8'], ['qualifiersPerPool', 'Qualifiers per pool', 'Into the final stage'],
  ['pointsForWin', 'Standing points for a win'], ['pointsForDraw', 'Standing points for a draw'],
  ['bronzeCount', 'Bronze medals per category', '0, 1 or 2'], ['mats', 'Number of mats'],
  ['matchDurationSec', 'Match duration (seconds)'], ['pointGap', 'Winning point gap'],
]

const KATA_SETTINGS = [
  ['kataJudges', 'Kata judges on a panel', '3 to 7'], ['kataQualifiers', 'Kata qualifiers per round', 'Into the next round'],
  ['kataRounds', 'Kata rounds', 'The last one is the final'],
]
export const POINT_LABEL = { yuko: 'Yuko', wazaAri: 'Waza-ari', ippon: 'Ippon' }
export const POOL_MODE_LABEL = { max: 'Even pools (17 → 6 + 6 + 5)', overflow: 'Fewest pools (17 → 9 + 8)' }
export const POOL_SYSTEM_LABEL = { round_robin: 'Round robin in pools, then knockout', knockout: 'Straight knockout' }

const pick = (t) => Object.fromEntries([...DETAIL_FIELDS.map(([k]) => k), ...DATE_FIELDS.map(([k]) => k), ...WINDOW_FIELDS.map(([k]) => k), 'timezone', 'masterAgeDate', 'type', 'date', 'rules', 'terms']
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
  const [rulesets, setRulesets] = useState([])
  const [rulesetId, setRulesetId] = useState(tournament.rulesetId || '')
  const [editing, setEditing] = useState(null)
  const [masterPreview, setMasterPreview] = useState(null)
  const [partnerKey, setPartnerKey] = useState(null)
  const [issuedKey, setIssuedKey] = useState(null)

  useEffect(() => {
    tms.link(tid).then((l) => { setLink(l); setLinkExpiry(l?.expiresAt?.slice(0, 10) || '') }).catch(() => {})
    tms.rulesets().then(setRulesets).catch(() => {})
    tms.partnerKey(tid).then(setPartnerKey).catch(() => {})
  }, [tid])

  const detailsPatch = () => {
    const patch = {}
    for (const [k, v] of Object.entries(details)) {
      const before = tournament[k] ?? ''
      if (v !== before) patch[k] = v === '' ? (['name', 'location', 'date'].includes(k) ? before : null) : v
    }
    if (patch.slug) patch.slug = String(patch.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    return patch
  }
  const saveDetails = async (confirmImpact = false) => {
    const patch = detailsPatch()
    if (!Object.keys(patch).length) return
    // PRD v1 §9: changing the master date re-ages players, so show who first.
    if (patch.masterAgeDate && !confirmImpact) {
      const preview = await action.run(() => tms.previewMasterDate(tid, patch.masterAgeDate))
      if (preview?.players) return setMasterPreview(preview)
    }
    await action.run(() => tms.updateTournament(tid, confirmImpact ? { ...patch, confirmImpact: true } : patch), 'Tournament saved')
    setMasterPreview(null)
    reload()
  }
  const readiness = (tournament.lifecycleStatus || 'DRAFT') === 'DRAFT' ? registrationReadiness({ ...tournament }) : []

  const saveSettings = () => {
    const out = {}
    for (const [k] of NUMBER_SETTINGS) out[k] = Number(settings[k])
    out.weighInAutoMove = !!settings.weighInAutoMove
    out.emailNotifications = settings.emailNotifications !== false
    out.fees = Object.fromEntries(Object.entries(settings.fees).map(([k, v]) => [k, Number(v) || 0]))
    out.points = Object.fromEntries(Object.entries(settings.points).map(([k, v]) => [k, Number(v)]))
    for (const [k] of KATA_SETTINGS) out[k] = Number(settings[k])
    for (const k of ['poolMode', 'poolSystem', 'kataMode', 'kataMethod']) out[k] = settings[k]
    out.ruleset = String(settings.ruleset || 'WKF')
    out.officialsSeeAssignedOnly = !!settings.officialsSeeAssignedOnly
    Object.assign(out, advancedPayload(settings))
    action.run(() => tms.updateSettings(tid, out), 'Settings saved').then((t) => { if (t) setSettings(settingsOf(t)); reload() })
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
      {readiness.length > 0 && (
        <Alert severity="warning">
          Before registration can open, fill in: {readiness.map((r) => r.message).join(' · ')}
        </Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <HelpTitle id="setup.details" variant="h3" gutterBottom>Tournament details</HelpTitle>
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
          {WINDOW_FIELDS.map(([k, label, suffix]) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth type="datetime-local" label={label} slotProps={{ inputLabel: { shrink: true } }}
                value={details[k] ? (details[k].length === 10 ? `${details[k]}${suffix}` : details[k]) : ''}
                onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
            </Grid>
          ))}
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete options={TIME_ZONES} value={details.timezone || null} onChange={(_e, v) => setDetails({ ...details, timezone: v || '' })}
              renderInput={(params) => <TextField {...params} label="Time zone" helperText={`Registration times are read in this zone (default ${DEFAULT_TIME_ZONE})`} />} />
          </Grid>
          {DATE_FIELDS.map(([k, label]) => (
            <Grid key={k} size={{ xs: 12, sm: 4 }}>
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
          {/* PRD point 2: shown on the public page; coaches accept the terms when registering. */}
          {[['rules', 'Tournament rules'], ['terms', 'Terms & conditions']].map(([k, label]) => (
            <Grid key={k} size={{ xs: 12, md: 6 }}>
              <TextField fullWidth multiline minRows={4} maxRows={14} label={label} value={details[k] || ''}
                helperText={k === 'terms' ? 'Coaches must accept these before registering players' : 'Shown on the public tournament page'}
                onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
            </Grid>
          ))}
        </Grid>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2, alignItems: { sm: 'center' } }}>
          <Button size="large" variant="contained" onClick={() => saveDetails()} disabled={action.busy}>Save details</Button>
          <Button variant="outlined" component="label">
            Upload logo
            <input hidden type="file" accept="image/png,image/jpeg" onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const data = await readFileBase64(file)
              const problem = checkFile({ name: file.name, type: file.type, data })
              if (problem || file.type === 'application/pdf') return action.notify({ severity: 'error', text: 'Use a PNG or JPEG of at most 2 MB.' })
              // The logo is a public file the tournament links to.
              const stored = await action.run(() => tms.uploadFile(tid, { name: file.name, type: file.type, data, purpose: 'logo' }))
              if (!stored) return
              const logoUrl = tms.publicFileUrl(stored.id)
              setDetails((d) => ({ ...d, logoUrl }))
              await action.run(() => tms.updateTournament(tid, { logoUrl }), 'Logo uploaded')
              reload()
            }} />
          </Button>
          {details.logoUrl && <Box component="img" src={details.logoUrl} alt="Tournament logo" sx={{ height: 48, borderRadius: 1 }} />}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <HelpTitle id="setup.rules" variant="h3" gutterBottom>Competition rules</HelpTitle>
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
          {/* PRD point 16: what each score is worth on the console. */}
          {Object.keys(POINT_LABEL).map((k) => (
            <Grid key={k} size={{ xs: 4, md: 2 }}>
              <TextField fullWidth type="number" label={`${POINT_LABEL[k]} points`} value={settings.points[k]}
                slotProps={{ htmlInput: { min: 1, max: 10 } }}
                onChange={(e) => setSettings({ ...settings, points: { ...settings.points, [k]: e.target.value } })} />
            </Grid>
          ))}
          <Grid size={{ xs: 12, md: 6 }}>
            {/* PRD v1 §6: a versioned ruleset fills in scoring, overtime, penalties and kata; the settings below may still adjust it. */}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField select fullWidth label="Ruleset" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}
                helperText={tournament.rulesetId ? `Applied: ${tournament.rulesetName || tournament.rulesetId}${tournament.rulesetVersion ? ` v${tournament.rulesetVersion}` : ''}` : 'Pick one, then apply'}>
                {rulesets.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}{r.version ? ` (v${r.version})` : ''}</MenuItem>)}
              </TextField>
              <Button variant="outlined" sx={{ mt: 1 }} disabled={!rulesetId || action.busy}
                onClick={() => action.run(() => tms.applyRuleset(tid, rulesetId), 'Ruleset applied').then((t) => { if (t) setSettings(settingsOf(t)); reload() })}>Apply</Button>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField select fullWidth label="Splitting entries into pools" value={settings.poolMode} onChange={(e) => setSettings({ ...settings, poolMode: e.target.value })}>
              {POOL_MODES.map((m) => <MenuItem key={m} value={m}>{POOL_MODE_LABEL[m] || m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField select fullWidth label="Competition system" value={settings.poolSystem} onChange={(e) => setSettings({ ...settings, poolSystem: e.target.value })}>
              {POOL_SYSTEMS.map((m) => <MenuItem key={m} value={m}>{POOL_SYSTEM_LABEL[m] || m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField select fullWidth label="Kata is decided by" value={settings.kataMode} onChange={(e) => setSettings({ ...settings, kataMode: e.target.value })}>
              <MenuItem value="panel">A judging panel scoring each performance</MenuItem>
              <MenuItem value="bouts">Head-to-head bouts (flags)</MenuItem>
            </TextField>
          </Grid>
          {settings.kataMode === 'panel' && (
            <>
              {KATA_SETTINGS.map(([k, label, help]) => (
                <Grid key={k} size={{ xs: 12, sm: 4, md: 2 }}>
                  <TextField fullWidth type="number" label={label} helperText={help} value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
                </Grid>
              ))}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField select fullWidth label="Kata score calculation" value={settings.kataMethod} onChange={(e) => setSettings({ ...settings, kataMethod: e.target.value })}>
                  {KATA_METHODS.map((m) => <MenuItem key={m} value={m}>{KATA_METHOD_LABEL[m]}</MenuItem>)}
                </TextField>
              </Grid>
            </>
          )}
          <Grid size={{ xs: 12 }}>
            <FormControlLabel control={<Switch checked={!!settings.officialsSeeAssignedOnly} onChange={(e) => setSettings({ ...settings, officialsSeeAssignedOnly: e.target.checked })} />}
              label="Referees and judges see only the matches they are assigned to" />
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
          <Grid size={{ xs: 12 }}>
            <FormControlLabel control={<Switch checked={settings.emailNotifications !== false} onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })} />}
              label="Email notifications to teams (their team email) and organisers (contact email)" />
          </Grid>
          <AdvancedSettings settings={settings} setSettings={setSettings} />
        </Grid>
        <Button size="large" variant="contained" sx={{ mt: 1 }} onClick={saveSettings} disabled={action.busy}>Save rules</Button>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <HelpTitle id="setup.link" variant="h3" gutterBottom>Registration link</HelpTitle>
        {(tournament.lifecycleStatus || 'DRAFT') === 'DRAFT' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Coaches can open this link, but cannot register until you move the tournament to <b>Registration open</b> on the Dashboard tab.
          </Alert>
        )}
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
        <HelpTitle id="setup.form" variant="h3" gutterBottom>Registration form</HelpTitle>
        <Alert severity="info" sx={{ mb: 2 }}>Name, DOB, gender, event and weight drive categorisation: they can be renamed but not removed or hidden. Player ID is given by the system. Read-only fields are shown to coaches but filled in by the organisers.</Alert>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell><TableCell>Label</TableCell><TableCell>Type</TableCell><TableCell>Options (comma separated)</TableCell>
                <TableCell>Required</TableCell><TableCell>Shown</TableCell><TableCell>Coach can edit</TableCell><TableCell />
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
                    {['dropdown', 'radio', 'checkbox', 'multiselect'].includes(f.type) && (
                      <TextField size="small" disabled={f.system} value={(f.options || []).join(', ')} onChange={(e) => patchField(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                    )}
                  </TableCell>
                  <TableCell><Checkbox checked={!!f.required} disabled={f.system} onChange={(e) => patchField(i, { required: e.target.checked })} /></TableCell>
                  <TableCell><Checkbox checked={f.visible !== false} disabled={f.system} onChange={(e) => patchField(i, { visible: e.target.checked })} /></TableCell>
                  <TableCell>
                    {/* PRD point 4: read-only fields are shown to coaches and filled by the organisers. */}
                    <TextField select size="small" value={f.readOnly ? 'readonly' : 'editable'} disabled={f.system || f.generated}
                      onChange={(e) => patchField(i, { readOnly: e.target.value === 'readonly' })}>
                      <MenuItem value="editable">Editable</MenuItem>
                      <MenuItem value="readonly">Read-only</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Properties: help, default, validation, show when…">
                      <IconButton size="small" aria-label={`Properties of ${f.label}`} onClick={() => setEditing(i)}><Tune fontSize="small" /></IconButton>
                    </Tooltip>
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

      <Paper sx={{ p: 2 }}>
        <HelpTitle id="setup.partner" variant="h3" gutterBottom>Partner API</HelpTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A federation or club system can send entries with this tournament&apos;s key (POST /api/v1/partner/tournaments/{tid}/players, header X-API-Key).
          Entries go through the same checks and duplicate review as any other.
        </Typography>
        {issuedKey && (
          <Alert severity="success" sx={{ mb: 2, wordBreak: 'break-all' }}>
            Copy this key now; it is not shown again: <strong>{issuedKey}</strong>
          </Alert>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Typography>{partnerKey ? `Key ending …${partnerKey.hint}, issued ${String(partnerKey.createdAt).slice(0, 10)}` : 'No key issued.'}</Typography>
          <Button variant="outlined" onClick={() => action.run(() => tms.issuePartnerKey(tid), 'Key issued').then((r) => { if (r) { setIssuedKey(r.key); setPartnerKey(r.partnerKey) } })}>
            {partnerKey ? 'Replace key' : 'Issue key'}
          </Button>
          {partnerKey && <Button color="error" onClick={() => action.run(() => tms.revokePartnerKey(tid), 'Key revoked').then(() => { setPartnerKey(null); setIssuedKey(null) })}>Revoke</Button>}
        </Stack>
      </Paper>

      <FieldPropertiesDialog field={editing === null ? null : fields[editing]} fields={fields}
        onClose={() => setEditing(null)} onSave={(f) => { patchField(editing, f); setEditing(null) }} />
      <ConfirmDialog open={!!masterPreview} title="Change the Master Age Date?" confirmLabel="Change and re-calculate"
        message={masterPreview ? `${masterPreview.players} players are re-aged against ${masterPreview.masterAgeDate}. ${masterPreview.changes.length} change age or age group${masterPreview.changes.length ? ` (${masterPreview.approvedAffected} already approved): ${masterPreview.changes.slice(0, 6).map((c) => `${c.name} ${c.ageBefore ?? '—'} → ${c.ageAfter ?? '—'}${c.moves.length ? ` (${c.moves.map((m) => `${m.from} → ${m.to}`).join(', ')})` : ''}`).join('; ')}${masterPreview.changes.length > 6 ? '…' : ''}` : ''}.` : ''}
        onClose={() => setMasterPreview(null)} onConfirm={() => saveDetails(true)} />
    </Stack>
  )
}
