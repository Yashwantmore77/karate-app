import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Button, Stack } from '@mui/material'
import { Download, Print, TableView } from '@mui/icons-material'
import { REPORT_KEYS, REPORT_TITLE, buildReport } from '@kumite/shared/reports.js'
import { tms } from '../../data/tms'
import { downloadCsv } from '../../components/tms/download'
import { downloadXlsx } from '../../components/tms/excel'

/** Section 45: every report as Excel (.xlsx), CSV or PDF. */
export default function ReportsTab({ tournament, version, action }) {
  const tid = tournament.id
  const [data, setData] = useState(null)

  useEffect(() => { tms.reportData(tid).then(setData) }, [tid, version])
  if (!data) return null

  const slug = tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return (
    <Grid container spacing={2}>
      {REPORT_KEYS.map((key) => {
        const title = REPORT_TITLE[key]
        const build = () => buildReport(key, data)
        return (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h3" gutterBottom>{title} report</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{build().length - 1} rows</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button startIcon={<TableView />} variant="contained" onClick={() => downloadXlsx(`${slug}-${key}.xlsx`, build(), title)}>Excel</Button>
                <Button startIcon={<Download />} variant="outlined" onClick={() => downloadCsv(`${slug}-${key}.csv`, build())}>CSV</Button>
                <Button startIcon={<Print />} variant="outlined" onClick={() => action.run(() => tms.pdf(tid, `reports/${key}.pdf`, `${slug}-${key}.pdf`))}>PDF</Button>
              </Stack>
            </Paper>
          </Grid>
        )
      })}
    </Grid>
  )
}
