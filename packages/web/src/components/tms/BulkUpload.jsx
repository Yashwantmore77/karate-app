import { useState } from 'react'
import { Paper, Typography, Stack, Button, Alert, Box } from '@mui/material'
import { UploadFile, Download } from '@mui/icons-material'
import { bulkTemplate, errorReportCsv } from '@kumite/shared/registration.js'
import DataTable from './DataTable'
import { downloadText, readFileText } from './download'

/**
 * Section 15: upload → validate → preview → show errors → confirm → create.
 * Only a clean file imports, so a coach never ends up with half a team.
 */
export default function BulkUpload({ fields, withTeamColumn = true, onPreview, onImport, action, onDone }) {
  const [csv, setCsv] = useState(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)

  const template = () => {
    const text = bulkTemplate(fields)
    downloadText('player-upload-template.csv', withTeamColumn ? text : text.replace(/^Team,/, ''))
  }

  const pick = async (file) => {
    if (!file) return
    // Section 49: a known type, a sane size.
    if (!/\.(csv|txt)$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
      action.notify({ severity: 'error', text: 'Upload a .csv file (Excel: File → Save As → CSV) up to 2 MB.' })
      return
    }
    const text = await readFileText(file)
    setCsv(text)
    setFileName(file.name)
    const result = await action.run(() => onPreview(text))
    setPreview(result || null)
  }

  const confirm = async () => {
    const out = await action.run(() => onImport(csv), (r) => `Imported ${r.created} players`)
    if (out) { setCsv(null); setPreview(null); setFileName(''); onDone?.() }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h3" gutterBottom>Bulk player upload</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<Download />} onClick={template}>Download template</Button>
        <Button variant="contained" component="label" startIcon={<UploadFile />}>
          Choose CSV file
          <input hidden type="file" accept=".csv,text/csv" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </Button>
        {fileName && <Typography sx={{ alignSelf: 'center' }} color="text.secondary">{fileName}</Typography>}
      </Stack>
      {preview && (
        <Stack spacing={2}>
          {preview.errors.length ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => downloadText('upload-errors.csv', errorReportCsv(preview.errors))}>Download error report</Button>}>
              {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} found. Fix the file and upload it again — nothing has been imported.
            </Alert>
          ) : (
            <Alert severity="success">{preview.valid.length} players ready to import.</Alert>
          )}
          <DataTable
            rowKey={(r) => r.row}
            rows={preview.rows}
            searchable={false}
            columns={[
              { key: 'row', label: 'Row' },
              { key: 'name', label: 'Name', value: (r) => r.player.name, render: (r) => r.player.name || '—' },
              { key: 'dob', label: 'DOB', value: (r) => r.player.dob, render: (r) => r.player.dob || '—' },
              { key: 'gender', label: 'Gender', value: (r) => r.player.gender, render: (r) => r.player.gender || '—' },
              { key: 'events', label: 'Events', value: (r) => (r.player.events || []).join(', '), render: (r) => (r.player.events || []).join(', ') || '—' },
              { key: 'weight', label: 'Weight', value: (r) => r.player.weight, render: (r) => r.player.weight ?? '—' },
              { key: 'errors', label: 'Problems', value: (r) => r.errors.length, render: (r) => (r.errors.length
                ? <Box sx={{ color: 'error.main' }}>{r.errors.map((e) => e.message).join('; ')}</Box>
                : <Box sx={{ color: 'success.main' }}>✓ OK</Box>) },
            ]}
          />
          <Box><Button size="large" variant="contained" disabled={!!preview.errors.length || !preview.valid.length || action.busy} onClick={confirm}>Confirm import</Button></Box>
        </Stack>
      )}
    </Paper>
  )
}
