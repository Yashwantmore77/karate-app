import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stack, Paper, Typography, Button, Alert } from '@mui/material'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import { MEDAL_ICON } from './ResultsTab'

/** Section 44: one certificate per medal, each with its own unique ID. */
export default function CertificatesTab({ tournament, version, action, basePath = '/admin' }) {
  const navigate = useNavigate()
  const tid = tournament.id
  const [rows, setRows] = useState([])
  const load = () => tms.certificates(tid).then(setRows)
  useEffect(() => { load() }, [tid, version])

  return (
    <Stack spacing={2}>
      {!tournament.resultsPublished && <Alert severity="info">Publish results first; certificates are issued from the published medal list.</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button size="large" variant="contained" disabled={!tournament.resultsPublished}
            onClick={() => action.run(() => tms.generateCertificates(tid), (r) => `${r.created} new certificates`).then(load)}>Generate certificates</Button>
          <Button size="large" variant="contained" color="secondary" disabled={!rows.length}
            onClick={() => action.run(() => tms.pdf(tid, 'certificates.pdf', `${tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-certificates.pdf`))}>Download PDF</Button>
          <Button size="large" variant="outlined" disabled={!rows.length} onClick={() => navigate(`${basePath}/tournament/${tid}/certificates/print`)}>Print / save as PDF</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Generating again only issues certificates for new medals; existing IDs never change.</Typography>
      </Paper>
      <DataTable rows={rows} empty="No certificates issued yet." columns={[
        { key: 'certificateId', label: 'Certificate ID' },
        { key: 'name', label: 'Player' },
        { key: 'club', label: 'Club' },
        { key: 'category', label: 'Category' },
        { key: 'medal', label: 'Medal', render: (c) => `${MEDAL_ICON[c.medal] || ''} ${c.medal}` },
        { key: 'issuedAt', label: 'Issued', render: (c) => new Date(c.issuedAt).toLocaleDateString() },
      ]} />
    </Stack>
  )
}
