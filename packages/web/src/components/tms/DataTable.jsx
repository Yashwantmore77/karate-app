import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TableSortLabel, TablePagination,
  Paper, Typography, Box, TextField, InputAdornment, Button, Menu, MenuItem, LinearProgress, CircularProgress,
} from '@mui/material'
import { Search, FileDownload } from '@mui/icons-material'
import { downloadCsv, printTable } from './download'
import { downloadXlsx } from './excel'

const text = (v) => (v == null ? '' : String(v)).toLowerCase()

/** What a column puts in an export: its own export value, its sort value, or the raw field. */
const exportCell = (c, r) => {
  const v = c.exportValue ? c.exportValue(r) : c.value ? c.value(r) : r[c.key]
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  return typeof v === 'object' ? '' : v
}
const exportable = (c) => c.export !== false && c.key !== 'actions' && c.label !== ''

/** The rows of a list, header first, as every export writes them. */
export const tableRows = (columns, rows) => {
  const cols = columns.filter(exportable)
  return [cols.map((c) => (typeof c.label === 'string' ? c.label : c.key)), ...rows.map((r) => cols.map((c) => exportCell(c, r)))]
}

/**
 * The one table every list in the PRD screens uses: search, sort, paging,
 * an empty state, and horizontal scroll instead of a squashed phone layout.
 */
export default function DataTable({
  columns, rows, rowKey = (r) => r.id, searchable = true, searchPlaceholder = 'Search', empty = 'Nothing here yet.',
  pageSize = 25, dense = true, toolbar = null, onRowClick = null,
  // Server paging (PRD section 62): { total, page, pageSize, onChange }. The
  // rows given are already the page; search and sort are sent to the server.
  server = null,
  // PRD point 29: every list exports as Excel, CSV or PDF. `exportRows` gives
  // the whole list when only a page is loaded (server paging).
  exportName = 'list', exportTitle = null, exportRows = null, canExport = true,
  // PRD point 28: drop-down filters built from the values in the list, e.g.
  // [{ key: 'district', label: 'District', value: (r) => r.district }].
  filters = [],
  // First load (a spinner in place of the rows) and a later reload (a thin bar).
  loading = false, refreshing = false,
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState({})
  const [exportAnchor, setExportAnchor] = useState(null)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(pageSize)

  // Typing searches after a pause, not on every key.
  const onServerChange = useRef(server?.onChange)
  onServerChange.current = server?.onChange
  const firstQuery = useRef(true)
  useEffect(() => {
    if (!server) return undefined
    if (firstQuery.current) { firstQuery.current = false; return undefined }
    const id = setTimeout(() => onServerChange.current?.({ page: 0, q: query }), 300)
    return () => clearTimeout(id)
  }, [query, !!server])

  const filterValue = (f, r) => String((f.value ? f.value(r) : r[f.key]) ?? '')
  const filterOptions = useMemo(() => Object.fromEntries(filters.map((f) => [f.key,
    f.options || [...new Set(rows.map((r) => filterValue(f, r)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])), [rows, filters])

  const filtered = useMemo(() => {
    if (server) return rows
    const q = query.trim().toLowerCase()
    let out = q ? rows.filter((r) => columns.some((c) => text(c.value ? c.value(r) : r[c.key]).includes(q))) : rows
    for (const f of filters) if (picked[f.key]) out = out.filter((r) => filterValue(f, r) === picked[f.key])
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key)
      const val = (r) => (col?.value ? col.value(r) : r[sort.key])
      out = [...out].sort((a, b) => {
        const x = val(a); const y = val(b)
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : text(x).localeCompare(text(y), undefined, { numeric: true })
        return sort.dir === 'asc' ? d : -d
      })
    }
    return out
  }, [rows, columns, query, sort, server, picked, filters])

  const [exporting, setExporting] = useState(false)
  const doExport = async (kind) => {
    setExportAnchor(null)
    setExporting(true)
    try {
      const all = exportRows ? await exportRows() : filtered
      const data = tableRows(columns, all)
      const stamp = new Date().toISOString().slice(0, 10)
      if (kind === 'csv') downloadCsv(`${exportName}-${stamp}.csv`, data)
      else if (kind === 'xlsx') await downloadXlsx(`${exportName}-${stamp}.xlsx`, data, String(exportTitle || exportName).slice(0, 31))
      else printTable(exportTitle || exportName, data)
    } finally {
      setExporting(false)
    }
  }

  const shown = server ? rows : filtered.slice(page * perPage, page * perPage + perPage)
  const total = server ? server.total : filtered.length
  const currentPage = server ? server.page : page
  const currentSize = server ? server.pageSize : perPage

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {(searchable || toolbar || canExport || filters.length > 0) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 1.5, alignItems: 'center' }}>
          {searchable && (
            <TextField size="small" placeholder={searchPlaceholder} value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              sx={{ minWidth: 200, flex: '1 1 220px', maxWidth: 360 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
          )}
          {!server && filters.map((f) => (
            <TextField key={f.key} select size="small" label={f.label} value={picked[f.key] || ''} sx={{ minWidth: 130 }}
              onChange={(e) => { setPicked({ ...picked, [f.key]: e.target.value }); setPage(0) }}>
              <MenuItem value="">All</MenuItem>
              {filterOptions[f.key].map((v) => <MenuItem key={v} value={v}>{f.format ? f.format(v) : v}</MenuItem>)}
            </TextField>
          ))}
          <Box sx={{ flex: '1 1 auto', display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {toolbar}
            {canExport && (
              <>
                <Button variant="outlined" startIcon={exporting ? <CircularProgress size={16} /> : <FileDownload />} onClick={(e) => setExportAnchor(e.currentTarget)} disabled={exporting || (!total && !exportRows)}>
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
                <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
                  <MenuItem onClick={() => doExport('xlsx')}>Excel (.xlsx)</MenuItem>
                  <MenuItem onClick={() => doExport('csv')}>CSV</MenuItem>
                  <MenuItem onClick={() => doExport('pdf')}>PDF (print)</MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Box>
      )}
      {(refreshing || (loading && shown.length > 0)) ? <LinearProgress aria-label="Updating" sx={{ height: 2 }} /> : <Box sx={{ height: 2 }} />}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size={dense ? 'small' : 'medium'}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={{ whiteSpace: 'nowrap', ...(c.width ? { width: c.width } : {}) }}>
                  {c.sortable === false ? c.label : (
                    <TableSortLabel active={sort.key === c.key} direction={sort.key === c.key ? sort.dir : 'asc'}
                      onClick={() => {
                        const next = { key: c.key, dir: sort.key === c.key && sort.dir === 'asc' ? 'desc' : 'asc' }
                        setSort(next)
                        server?.onChange({ page: 0, sort: c.sortKey || c.key, dir: next.dir })
                      }}>
                      {c.label}
                    </TableSortLabel>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={rowKey(r)} hover onClick={onRowClick ? () => onRowClick(r) : undefined} sx={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</TableCell>
                ))}
              </TableRow>
            ))}
            {!shown.length && (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  {loading ? (
                    <Box role="status" sx={{ py: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5 }}>
                      <CircularProgress size={22} /><Typography color="text.secondary">Loading…</Typography>
                    </Box>
                  ) : (
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{query ? 'No matches.' : empty}</Typography>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {total > currentSize && (
        <TablePagination component="div" count={total} page={currentPage} rowsPerPage={currentSize}
          rowsPerPageOptions={[25, 50, 100]}
          onPageChange={(_e, p) => (server ? server.onChange({ page: p }) : setPage(p))}
          onRowsPerPageChange={(e) => (server
            ? server.onChange({ page: 0, pageSize: Number(e.target.value) })
            : (setPerPage(Number(e.target.value)), setPage(0)))} />
      )}
    </Paper>
  )
}
