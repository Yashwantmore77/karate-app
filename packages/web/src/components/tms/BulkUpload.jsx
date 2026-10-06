import { useState } from 'react'
import { Paper, Typography, Stack, Button, Alert, Box } from '@mui/material'
import { UploadFile, Download } from '@mui/icons-material'
import { bulkTemplate, errorReportCsv, parseCsv, toCsv } from '@kumite/shared/registration.js'
import DataTable from './DataTable'
import { downloadText, readFileText } from './download'
import { readXlsx, downloadXlsx } from './excel'

/**
 * Section 15: upload → validate → preview → show errors → confirm → create.
 * Only a clean file imports, so a coach never ends up with half a team.
 */
export default function BulkUpload({ fields, withTeamColumn = true, onPreview, onImport, action, onDone }) {
  const [csv, setCsv] = useState(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)

  const templateRows = () => {
    const [header] = parseCsv(bulkTemplate(fields))
    return [withTeamColumn ? header : header.slice(1)]
  }
  const template = (format) => (format === 'xlsx'
    ? downloadXlsx('player-upload-template.xlsx', templateRows(), 'Players')
    : downloadText('player-upload-template.csv', toCsv(templateRows())))

  const pick = async (file) => {
    if (!file) return
    // Section 49: a known type, a sane size.
    const isXlsx = /\.xlsx$/i.test(file.name)
    if ((!isXlsx && !/\.(csv|txt)$/i.test(file.name)) || file.size > 2 * 1024 * 1024) {
      action.notify({ severity: 'error', text: 'Upload an Excel (.xlsx) or .csv file of at most 2 MB.' })
      return
    }
    // An Excel sheet is read here and handed on as CSV, so the server checks
    // every row exactly as it checks an uploaded CSV.
    let text
    try {
      text = isXlsx ? toCsv(await readXlsx(file)) : await readFileText(file)
    } catch {
      action.notify({ severity: 'error', text: 'That file could not be read as a spreadsheet.' })
      return
    }
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
        <Button variant="outlined" startIcon={<Download />} onClick={() => template('xlsx')}>Excel template</Button>
        <Button variant="outlined" startIcon={<Download />} onClick={() => template('csv')}>CSV template</Button>
        <Button variant="contained" component="label" startIcon={<UploadFile />}>
          Choose Excel or CSV file
          <input hidden type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </Button>
        {fileName && <Typography sx={{ alignSelf: 'center' }} color="text.secondary">{fileName}</Typography>}
      </Stack>
      {preview && (
        <Stack spacing={2}>
          {preview.errors.length ? (
            <Alert severity="error" action={<Stack direction="row"><Button color="inherit" size="small" onClick={() => downloadXlsx('upload-errors.xlsx', [['Row', 'Field', 'Error'], ...preview.errors.map((e) => [e.row, e.field || '', e.message])], 'Errors')}>Error report (Excel)</Button><Button color="inherit" size="small" onClick={() => downloadText('upload-errors.csv', errorReportCsv(preview.errors))}>CSV</Button></Stack>}>
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
