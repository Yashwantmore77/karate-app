import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack, Paper, Typography, Button, Alert, FormGroup, FormControlLabel, Checkbox, TextField, MenuItem, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid,
} from '@mui/material'
import { PictureAsPdf } from '@mui/icons-material'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import { MEDAL_ICON } from './ResultsTab'
import { useLoading } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

const TYPES = { medal: 'Medal winners', participation: 'Participation (every player who took part)', coach: 'Team managers and coaches (from each team)', official: 'Judges and referees (staff accounts and team members)' }
const TYPE_LABEL = { medal: 'Medal', participation: 'Participation', coach: 'Coach', official: 'Official', custom: 'Special award' }
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * Section 44 and PRD v1 §18: certificates by type, each with a unique ID and a
 * QR code that opens the public verification page.
 */
export default function CertificatesTab({ tournament, version, action, basePath = '/admin' }) {
  const navigate = useNavigate()
  const tid = tournament.id
  const [rows, setRows] = useState([])
  const [types, setTypes] = useState(['medal'])
  const [type, setType] = useState('')
  const [custom, setCustom] = useState(null)
  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(tms.certificates(tid, type || undefined).then(setRows))
  useEffect(() => { load() }, [tid, version, type])

  const needsResults = types.includes('medal') && !tournament.resultsPublished

  return (
    <Stack spacing={2}>
      {!tournament.resultsPublished && <Alert severity="info">Publish results first for medal certificates; participation, coach and official certificates can be issued any time.</Alert>}
      <Paper sx={{ p: 2 }}>
        <HelpTitle id="certificates.issue" variant="h3" gutterBottom>Issue certificates</HelpTitle>
        <FormGroup row sx={{ mb: 1 }}>
          {Object.entries(TYPES).map(([k, label]) => (
            <FormControlLabel key={k} label={label} control={
              <Checkbox checked={types.includes(k)} onChange={(e) => setTypes(e.target.checked ? [...types, k] : types.filter((t) => t !== k))} />
            } />
          ))}
        </FormGroup>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button size="large" variant="contained" disabled={!types.length || needsResults}
            onClick={() => action.run(() => tms.generateCertificates(tid, types), (r) => `${r.created} new certificates`).then(load)}>Generate</Button>
          <Button size="large" variant="outlined" onClick={() => setCustom({ name: '', title: 'Special Award', award: '', club: '', category: '' })}>Special award…</Button>
          <Button size="large" variant="contained" color="secondary" disabled={!rows.length}
            onClick={() => action.run(() => tms.pdf(tid, `certificates.pdf${type ? `?type=${type}` : ''}`, `${slug(tournament.name)}-${type || 'all'}-certificates.pdf`))}>Download PDF</Button>
          <Button size="large" variant="outlined" disabled={!rows.length} onClick={() => navigate(`${basePath}/tournament/${tid}/certificates/print`)}>Print / save as PDF</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Generating again only issues what is new; existing IDs never change. Template, title and signatories are set in Settings → Certificates. Each certificate carries a QR code to /verify/ID.
        </Typography>
      </Paper>
      <DataTable rows={rows} loading={loading} refreshing={refreshing} empty="No certificates issued yet."
        exportName={`${tournament.slug || 'tournament'}-certificates`} exportTitle={`${tournament.name} — Certificates`}
        toolbar={(
          <TextField select size="small" label="Type" value={type} sx={{ minWidth: 150 }} onChange={(e) => setType(e.target.value)}>
            <MenuItem value="">All types</MenuItem>
            {Object.entries(TYPE_LABEL).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
          </TextField>
        )}
        columns={[
          { key: 'certificateId', label: 'Certificate ID' },
          { key: 'type', label: 'Type', render: (c) => TYPE_LABEL[c.type || 'medal'] || c.type },
          { key: 'name', label: 'Name' },
          { key: 'club', label: 'Club', render: (c) => c.club || '—' },
          { key: 'category', label: 'Category / award', value: (c) => c.award || c.category, render: (c) => c.award || c.category || '—' },
          { key: 'medal', label: 'Medal', render: (c) => (c.medal ? `${MEDAL_ICON[c.medal] || ''} ${c.medal}` : '—') },
          { key: 'issuedAt', label: 'Issued', render: (c) => new Date(c.issuedAt).toLocaleDateString() },
          { key: 'pdf', label: '', sortable: false, render: (c) => (
            <Tooltip title="Download this certificate"><IconButton size="small" aria-label={`Download ${c.certificateId}`}
              onClick={() => action.run(() => tms.pdf(tid, `certificates/${encodeURIComponent(c.certificateId)}.pdf`, `${c.certificateId}.pdf`))}><PictureAsPdf fontSize="small" /></IconButton></Tooltip>
          ) },
        ]} />

      <Dialog open={!!custom} onClose={() => setCustom(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Special award certificate</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {[['name', 'Awarded to', true], ['title', 'Certificate title'], ['award', 'Award (e.g. Best Kata Performer)'], ['club', 'Club'], ['category', 'Category']].map(([k, label, required]) => (
              <Grid key={k} size={{ xs: 12, sm: k === 'name' || k === 'award' ? 12 : 6 }}>
                <TextField fullWidth required={required} label={label} value={custom?.[k] || ''} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustom(null)}>Cancel</Button>
          <Button variant="contained" disabled={!custom?.name?.trim()} onClick={async () => {
            const body = Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, v?.trim() || null]))
            const ok = await action.run(() => tms.issueCustomCertificate(tid, body), 'Certificate issued')
            if (ok) { setCustom(null); load() }
          }}>Issue</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
