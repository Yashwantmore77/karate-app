import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Button, Stack } from '@mui/material'
import { Download, Print, TableView } from '@mui/icons-material'
import { REPORT_KEYS, REPORT_TITLE, buildReport } from '@kumite/shared/reports.js'
import { tms } from '../../data/tms'
import { downloadCsv } from '../../components/tms/download'
import { downloadXlsx } from '../../components/tms/excel'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Offline fallback: print a report as a plain table (the browser's "Save as PDF"). */
function printTable(title, rows) {
  const w = window.open('', '_blank')
  if (!w) return
  const [head, ...body] = rows
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:16px}table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}</style></head><body>
    <h2>${esc(title)}</h2><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(Array.isArray(c) ? c.join(', ') : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

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
                <Button startIcon={<Print />} variant="outlined" onClick={() => (tms.pdf
                  ? action.run(() => tms.pdf(tid, `reports/${key}.pdf`, `${slug}-${key}.pdf`))
                  : printTable(`${tournament.name} — ${title} report`, build()))}>PDF</Button>
              </Stack>
            </Paper>
          </Grid>
        )
      })}
    </Grid>
  )
}
