import { useEffect, useMemo, useRef, useState } from 'react'
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
  // Server paging (PRD section 62): { total, page, pageSize, onChange }. The
  // rows given are already the page; search and sort are sent to the server.
  server = null,
}) {
  const [query, setQuery] = useState('')
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

  const filtered = useMemo(() => {
    if (server) return rows
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
  }, [rows, columns, query, sort, server])

  const shown = server ? rows : filtered.slice(page * perPage, page * perPage + perPage)
  const total = server ? server.total : filtered.length
  const currentPage = server ? server.page : page
  const currentSize = server ? server.pageSize : perPage

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
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{query ? 'No matches.' : empty}</Typography>
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
