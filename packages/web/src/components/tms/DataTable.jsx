import { useMemo, useState } from 'react'
import {
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TableSortLabel, TablePagination,
  Paper, Typography, Box, TextField, InputAdornment,
} from '@mui/material'
import { Search } from '@mui/icons-material'

const text = (v) => (v == null ? '' : String(v)).toLowerCase()

/**
 * The one table every list in the PRD screens uses: search, sort, paging,
 * an empty state, and horizontal scroll instead of a squashed phone layout.
 */
export default function DataTable({
  columns, rows, rowKey = (r) => r.id, searchable = true, searchPlaceholder = 'Search', empty = 'Nothing here yet.',
  pageSize = 25, dense = true, toolbar = null, onRowClick = null,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(pageSize)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = q ? rows.filter((r) => columns.some((c) => text(c.value ? c.value(r) : r[c.key]).includes(q))) : rows
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
  }, [rows, columns, query, sort])

  const shown = filtered.slice(page * perPage, page * perPage + perPage)

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {(searchable || toolbar) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 1.5, alignItems: 'center' }}>
          {searchable && (
            <TextField size="small" placeholder={searchPlaceholder} value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              sx={{ minWidth: 200, flex: '1 1 220px', maxWidth: 360 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
          )}
          <Box sx={{ flex: '1 1 auto', display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{toolbar}</Box>
        </Box>
      )}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size={dense ? 'small' : 'medium'}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={{ whiteSpace: 'nowrap', ...(c.width ? { width: c.width } : {}) }}>
                  {c.sortable === false ? c.label : (
                    <TableSortLabel active={sort.key === c.key} direction={sort.key === c.key ? sort.dir : 'asc'}
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
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
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{query ? 'No matches.' : empty}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {filtered.length > perPage && (
        <TablePagination component="div" count={filtered.length} page={page} rowsPerPage={perPage}
          rowsPerPageOptions={[25, 50, 100]} onPageChange={(_e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }} />
      )}
    </Paper>
  )
}
