import { useEffect, useState } from 'react'
import {
  Stack, Paper, Typography, Button, ToggleButtonGroup, ToggleButton, Alert, List, ListItem, ListItemText, Chip,
  FormGroup, FormControlLabel, Checkbox, TextField, MenuItem, Grid,
} from '@mui/material'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms, describeError } from '../../data/tms'
import QrScanner from '../../components/tms/QrScanner'
import DataTable from '../../components/tms/DataTable'
import { useLoading } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

const KIND_LABEL = { player: 'Athletes', coach: 'Coaches', official: 'Officials' }
const ROLE_COLOR = { player: 'primary', coach: 'success', official: 'secondary' }

/**
 * Accreditation passes and QR check-in. Staff scan a pass at the door (arrival)
 * or at the mat (present for the athlete's next bout); organisers issue and
 * print the passes.
 */
export default function CheckinTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const [point, setPoint] = useState('arrival')
  const [log, setLog] = useState([])
  const manage = can(role, P.CERTIFICATE_GENERATE)
  const [passes, setPasses] = useState([])
  const [kinds, setKinds] = useState(['player', 'coach'])
  const [kind, setKind] = useState('')
  const { loading, refreshing, wrap } = useLoading()
  const load = () => manage && wrap(tms.passes(tid, kind || undefined).then(setPasses))
  useEffect(() => { load() }, [tid, version, kind])

  const scan = async (code) => {
    try {
      const r = await tms.checkIn(tid, code, point)
      const text = point === 'mat'
        ? `${r.pass.name}: present for ${r.bout.matchNumber}${r.bout.mat ? ` on mat ${r.bout.mat}` : ''} (${r.bout.side === 'aka' ? 'AKA' : 'AO'})`
        : `${r.pass.name} (${r.pass.role}${r.pass.club ? `, ${r.pass.club}` : ''}) ${r.alreadyCheckedIn ? 'was already checked in' : 'checked in'}`
      setLog((l) => [{ ok: true, text, at: new Date() }, ...l].slice(0, 30))
      if (manage) load()
    } catch (err) {
      setLog((l) => [{ ok: false, text: describeError(err), at: new Date() }, ...l].slice(0, 30))
    }
  }

  const checkedIn = passes.filter((p) => p.checkedInAt).length

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <HelpTitle id="checkin.scan" variant="h3" gutterBottom>Scan a pass</HelpTitle>
            <ToggleButtonGroup exclusive size="small" value={point} onChange={(_e, v) => v && setPoint(v)} sx={{ mb: 2 }}>
              <ToggleButton value="arrival">At the door (arrival)</ToggleButton>
              <ToggleButton value="mat" disabled={!can(role, P.ATTENDANCE_MARK)}>At the mat (next bout)</ToggleButton>
            </ToggleButtonGroup>
            <QrScanner onCode={scan} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <HelpTitle id="checkin.scans" variant="h3" gutterBottom>Scans</HelpTitle>
            {!log.length && <Typography color="text.secondary">Scanned passes appear here.</Typography>}
            <List dense>
              {log.map((e, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText primary={e.text} secondary={e.at.toLocaleTimeString()}
                    slotProps={{ primary: { sx: { color: e.ok ? 'success.main' : 'error.main', fontWeight: i === 0 ? 700 : 400 } } }} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      {manage && (
        <Paper sx={{ p: 2 }}>
          <HelpTitle id="checkin.passes" variant="h3" gutterBottom>Accreditation passes</HelpTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            ID-card passes with photo (from registration), role and a QR code, eight to an A4 page. Generating again only adds passes for people who have none; printed codes keep working.
          </Typography>
          <FormGroup row>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <FormControlLabel key={k} label={label} control={<Checkbox checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />} />
            ))}
          </FormGroup>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <Button variant="contained" disabled={!kinds.length} onClick={() => action.run(() => tms.generatePasses(tid, kinds), (r) => `${r.created} new passes`).then(load)}>Generate passes</Button>
            <Button variant="outlined" disabled={!passes.length} onClick={() => action.run(() => tms.pdf(tid, `passes.pdf${kind ? `?kind=${kind}` : ''}`, `${tournament.slug || 'tournament'}-passes.pdf`))}>Download PDF</Button>
          </Stack>
          {passes.length > 0 && <Alert severity="info" sx={{ mb: 2 }}>{checkedIn} of {passes.length} checked in at the door.</Alert>}
          <DataTable rows={passes} loading={loading} refreshing={refreshing} empty="No passes yet."
            exportName={`${tournament.slug || 'tournament'}-passes`} exportTitle={`${tournament.name} — Passes`}
            toolbar={(
              <TextField select size="small" label="Who" value={kind} sx={{ minWidth: 140 }} onChange={(e) => setKind(e.target.value)}>
                <MenuItem value="">Everyone</MenuItem>
                {Object.entries(KIND_LABEL).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
              </TextField>
            )}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'kind', label: 'Role', render: (p) => <Chip size="small" color={ROLE_COLOR[p.kind]} label={p.role} /> },
              { key: 'club', label: 'Club / team', render: (p) => p.club || p.team || '—' },
              { key: 'number', label: 'ID', render: (p) => p.number || '—' },
              { key: 'code', label: 'Pass code' },
              { key: 'checkedInAt', label: 'Arrived', render: (p) => (p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString() : '—') },
            ]} />
        </Paper>
      )}
    </Stack>
  )
}
