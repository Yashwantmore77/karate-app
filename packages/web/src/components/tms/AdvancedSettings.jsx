import { Grid, TextField, MenuItem, Switch, FormControlLabel, Typography, Divider } from '@mui/material'
import { SETTING_CHOICES } from '@kumite/shared/tms.js'
import { OVERTIME_MODES, KATA_TIE_BREAKS } from '@kumite/shared/rulesets.js'
import { KATA_TIE_BREAK_LABEL } from '@kumite/shared/kata.js'

// PRD v1 §6 tournament settings, grouped the way an organiser thinks about
// them. Everything here is saved with the rest of the competition rules.

export const OVERTIME_LABEL = {
  none: 'No overtime (a draw stands)',
  senshu: 'Senshu (first unopposed score wins)',
  extra_time: 'Extra time',
  golden_score: 'Golden score (first score wins)',
  hantei: 'Hantei (referee decision)',
}
const CHOICE_LABEL = {
  random: 'Random draw', seeded: 'Seeded draw',
  top_n: 'Top N of each pool', points: 'Points threshold', manual: 'Chosen by the admin',
  knockout: 'Knockout bracket', master_pool: 'Master pool (round robin)',
  manual_pub: 'When the admin publishes', auto: 'As each category is verified',
  public: 'Public (listed)', unlisted: 'Unlisted (by link only)', private: 'Private',
  no_competition: 'No competition', auto_award: 'Award gold automatically', admin_decision: 'Admin decides',
  classic: 'Classic', modern: 'Modern', minimal: 'Minimal',
}

/** Settings keys this panel owns, with how each is sent to the API. */
export const ADVANCED_KEYS = {
  boolean: ['allowUnevenPools', 'allowByes', 'allowSeeding', 'thirdPlaceMatch', 'senshu', 'publicCertificates', 'requireWeighInForDraw',
    'weightUpperInclusive', 'groupByDivision', 'allowDuplicatePlayers', 'attendanceEnabled', 'kataComponents'],
  number: ['extraTimeSec', 'penaltyCategories', 'qualificationPoints', 'weightPrecision', 'kataMinScore', 'kataMaxScore', 'kataPrecision', 'kataTechnicalWeight'],
  choice: ['drawMethod', 'overtime', 'qualificationMode', 'finalStage', 'resultPublishing', 'publicVisibility', 'singlePlayerPolicy', 'kataTieBreak'],
}

export function advancedPayload(settings) {
  const out = {}
  for (const k of ADVANCED_KEYS.boolean) out[k] = !!settings[k]
  for (const k of ADVANCED_KEYS.number) out[k] = Number(settings[k])
  for (const k of ADVANCED_KEYS.choice) out[k] = settings[k]
  out.penaltyLadder = String(Array.isArray(settings.penaltyLadder) ? settings.penaltyLadder.join(',') : settings.penaltyLadder || '')
    .split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6)
  out.entryLockAt = settings.entryLockAt || null
  out.certificate = { ...settings.certificate }
  out.notificationChannels = { ...settings.notificationChannels }
  return out
}

const Section = ({ children }) => (
  <Grid size={{ xs: 12 }}>
    <Divider sx={{ my: 1 }} />
    <Typography variant="h4" sx={{ fontSize: '1rem', fontWeight: 600 }}>{children}</Typography>
  </Grid>
)

export default function AdvancedSettings({ settings, setSettings }) {
  const set = (k, v) => setSettings({ ...settings, [k]: v })
  const toggle = (k, label, help) => (
    <Grid key={k} size={{ xs: 12, sm: 6, md: 4 }}>
      <FormControlLabel control={<Switch checked={!!settings[k]} onChange={(e) => set(k, e.target.checked)} />} label={label} />
      {help && <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 6, mt: -0.5 }}>{help}</Typography>}
    </Grid>
  )
  const choice = (k, label, values, labels = CHOICE_LABEL) => (
    <Grid key={k} size={{ xs: 12, sm: 6, md: 4 }}>
      <TextField select fullWidth label={label} value={settings[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
        {values.map((v) => <MenuItem key={v} value={v}>{(k === 'resultPublishing' && v === 'manual' ? CHOICE_LABEL.manual_pub : labels[v]) || v}</MenuItem>)}
      </TextField>
    </Grid>
  )
  const number = (k, label, help, step) => (
    <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
      <TextField fullWidth type="number" label={label} helperText={help} value={settings[k] ?? ''} slotProps={{ htmlInput: { step } }} onChange={(e) => set(k, e.target.value)} />
    </Grid>
  )

  return (
    <>
      <Section>Draw and qualification</Section>
      {choice('drawMethod', 'Draw method', SETTING_CHOICES.drawMethod)}
      {choice('qualificationMode', 'Who qualifies from a pool', SETTING_CHOICES.qualificationMode)}
      {settings.qualificationMode === 'points' && number('qualificationPoints', 'Points needed to qualify')}
      {choice('finalStage', 'Final stage', SETTING_CHOICES.finalStage)}
      {choice('singlePlayerPolicy', 'Category with one player', SETTING_CHOICES.singlePlayerPolicy)}
      {toggle('allowUnevenPools', 'Allow uneven pools')}
      {toggle('allowByes', 'Allow byes in the bracket')}
      {toggle('allowSeeding', 'Allow seeding')}
      {toggle('thirdPlaceMatch', 'Third-place match', 'One bronze from a bout instead of two')}
      {toggle('groupByDivision', 'Separate divisions (e.g. Novice / Advanced)')}

      <Section>Kumite scoring</Section>
      {choice('overtime', 'When a bout is tied at time', OVERTIME_MODES, OVERTIME_LABEL)}
      {settings.overtime === 'extra_time' && number('extraTimeSec', 'Extra time (seconds)')}
      {toggle('senshu', 'Senshu applies')}
      {number('penaltyCategories', 'Penalty categories', '1 (combined) or 2 (C1 / C2)')}
      <Grid size={{ xs: 12, sm: 6, md: 5 }}>
        <TextField fullWidth label="Penalty ladder" helperText="In order, comma separated (last one disqualifies)"
          value={Array.isArray(settings.penaltyLadder) ? settings.penaltyLadder.join(', ') : settings.penaltyLadder || ''}
          onChange={(e) => set('penaltyLadder', e.target.value)} />
      </Grid>

      <Section>Kata scoring</Section>
      {number('kataMinScore', 'Lowest score', null, 0.1)}
      {number('kataMaxScore', 'Highest score', null, 0.1)}
      {number('kataPrecision', 'Decimal places', '0 to 2')}
      {choice('kataTieBreak', 'Kata tie-break', KATA_TIE_BREAKS, KATA_TIE_BREAK_LABEL)}
      {toggle('kataComponents', 'Score technical and athletic separately')}
      {settings.kataComponents && number('kataTechnicalWeight', 'Technical weight', 'e.g. 0.7 (athletic is the rest)', 0.05)}

      <Section>Entries and weigh-in</Section>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <TextField fullWidth type="datetime-local" label="Coach entries lock at" slotProps={{ inputLabel: { shrink: true } }}
          helperText="Soft lock: coaches stop editing; organisers still can" value={settings.entryLockAt || ''} onChange={(e) => set('entryLockAt', e.target.value || null)} />
      </Grid>
      {number('weightPrecision', 'Weight decimal places', '0 to 3')}
      {toggle('requireWeighInForDraw', 'Only verified weigh-ins enter the draw')}
      {toggle('weightUpperInclusive', 'Upper weight limit is inclusive', 'e.g. 35.0 kg fits "-35 kg"')}
      {toggle('allowDuplicatePlayers', 'Allow possible duplicates without review')}
      {toggle('attendanceEnabled', 'Mark attendance when calling bouts')}

      <Section>Results and public page</Section>
      {choice('resultPublishing', 'Results go public', SETTING_CHOICES.resultPublishing)}
      {choice('publicVisibility', 'Public page', SETTING_CHOICES.publicVisibility)}
      {toggle('publicCertificates', 'Players can download certificates from the public page')}

      <Section>Certificates</Section>
      {(() => {
        const cert = settings.certificate || {}
        const setCert = (k, v) => set('certificate', { ...cert, [k]: v })
        return (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="Template" value={cert.template || 'classic'} onChange={(e) => setCert('template', e.target.value)}>
                {SETTING_CHOICES.certificateTemplate.map((v) => <MenuItem key={v} value={v}>{CHOICE_LABEL[v]}</MenuItem>)}
              </TextField>
            </Grid>
            {[['title', 'Title'], ['signatory1', 'Left signatory'], ['signatory2', 'Right signatory'], ['footer', 'Footer']].map(([k, label]) => (
              <Grid key={k} size={{ xs: 12, sm: 6, md: k === 'footer' ? 12 : 3 }}>
                <TextField fullWidth label={label} value={cert[k] || ''} onChange={(e) => setCert(k, e.target.value)} />
              </Grid>
            ))}
          </>
        )
      })()}

      <Section>Notification channels</Section>
      {[['inApp', 'In-app'], ['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']].map(([k, label]) => (
        <Grid key={k} size={{ xs: 6, sm: 3 }}>
          <FormControlLabel label={label} control={<Switch checked={!!settings.notificationChannels?.[k]} disabled={k === 'inApp'}
            onChange={(e) => set('notificationChannels', { ...settings.notificationChannels, [k]: e.target.checked })} />} />
        </Grid>
      ))}
      <Grid size={{ xs: 12 }}>
        <Typography variant="caption" color="text.secondary">SMS and WhatsApp are sent through the gateway the installation configures (SMS_WEBHOOK_URL / WHATSAPP_WEBHOOK_URL).</Typography>
      </Grid>
    </>
  )
}
