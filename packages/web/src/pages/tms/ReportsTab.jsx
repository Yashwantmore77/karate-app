import { useEffect, useMemo, useState } from 'react'
import { Grid, Paper, Typography, Button, Stack, TextField, MenuItem, Alert } from '@mui/material'
import { Download, Print, TableView } from '@mui/icons-material'
import { REPORT_KEYS, REPORT_TITLE, buildReport } from '@kumite/shared/reports.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms, describeError } from '../../data/tms'
import { downloadCsv } from '../../components/tms/download'
import { downloadXlsx } from '../../components/tms/excel'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'

const BLANK = { gender: '', event: '', ageGroupId: '', divisionKey: '', club: '', district: '', state: '' }
const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v))

/** Section 45 and PRD v1 §20: every report as Excel, CSV or PDF, filtered, each export audited. */
export default function ReportsTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState(BLANK)

  const [error, setError] = useState(null)
  useEffect(() => { setError(null); tms.reportData(tid).then(setData).catch(setError) }, [tid, version])
  const places = useMemo(() => {
    if (!data) return {}
    const distinct = (k) => [...new Set(data.players.map((p) => p[k]).filter(Boolean))].sort()
    return { club: distinct('club'), district: distinct('district'), state: distinct('state') }
  }, [data])
  if (error && !data) return <Alert severity="error">{describeError(error)}</Alert>
  if (!data) return <PageLoader label="Preparing reports…" />

  const slug = tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const active = clean(filters)
  const qs = new URLSearchParams(active).toString()
  const keys = REPORT_KEYS.filter((k) => k !== 'audit' || can(role, P.AUDIT_VIEW))
  // The audit trail is read on the server; everything else is built here from the same data.
  const rowsFor = async (key) => (key === 'audit' ? (await tms.report(tid, key, active)).rows : buildReport(key, data, active))
  const logged = (key, format, rows) => tms.logExport(tid, { report: key, format, rows: Math.max(0, rows - 1), filters: Object.keys(active).length ? active : null })

  const select = (key, label, options) => (
    <TextField key={key} select size="small" label={label} value={filters[key]} sx={{ minWidth: 140 }} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
      <MenuItem value="">All</MenuItem>
      {options.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
    </TextField>
  )

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <HelpTitle id="reports.list" variant="h4" sx={{ mb: 1 }}>Filters</HelpTitle>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {select('gender', 'Gender', [['M', 'Male'], ['F', 'Female']])}
          {select('event', 'Event', [['kata', 'Kata'], ['kumite', 'Kumite']])}
          {select('ageGroupId', 'Age group', data.groups.map((g) => [g.id, g.name]))}
          {select('divisionKey', 'Category', data.divisions.map((d) => [d.key, d.label]))}
          {select('club', 'Club', (places.club || []).map((v) => [v, v]))}
          {select('district', 'District', (places.district || []).map((v) => [v, v]))}
          {select('state', 'State', (places.state || []).map((v) => [v, v]))}
          {Object.keys(active).length > 0 && <Button onClick={() => setFilters(BLANK)}>Clear</Button>}
        </Stack>
      </Paper>
      <Grid container spacing={2}>
        {keys.map((key) => {
          const title = REPORT_TITLE[key]
          const count = key === 'audit' ? null : buildReport(key, data, active).length - 1
          return (
            <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h3" gutterBottom>{title} report</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{count == null ? 'Every change, with who and why' : `${count} rows`}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Button startIcon={<TableView />} variant="contained" onClick={() => action.run(async () => {
                    const rows = await rowsFor(key)
                    await downloadXlsx(`${slug}-${key}.xlsx`, rows, title)
                    logged(key, 'xlsx', rows.length)
                  })}>Excel</Button>
                  <Button startIcon={<Download />} variant="outlined" onClick={() => action.run(async () => {
                    const rows = await rowsFor(key)
                    downloadCsv(`${slug}-${key}.csv`, rows)
                    logged(key, 'csv', rows.length)
                  })}>CSV</Button>
                  {/* The server records the PDF export itself. */}
                  <Button startIcon={<Print />} variant="outlined" onClick={() => action.run(() => tms.pdf(tid, `reports/${key}.pdf${qs ? `?${qs}` : ''}`, `${slug}-${key}.pdf`))}>PDF</Button>
                </Stack>
              </Paper>
            </Grid>
          )
        })}
      </Grid>
    </Stack>
  )
}
