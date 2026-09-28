import { Box, TextField, InputAdornment, IconButton, TablePagination, Typography } from '@mui/material'
import { Search, Clear } from '@mui/icons-material'

/** The search box that sits above a paged table. */
export function TableSearch({ value, onChange, placeholder = 'Search', ...props }) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputProps={{ 'aria-label': placeholder }}
      sx={{ minWidth: 240 }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search fontSize="small" />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')}>
              <Clear fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
      {...props}
    />
  )
}

/**
 * The pager below a table.
 *
 * Page numbers are 1-based everywhere in this app and 0-based in MUI, so the
 * conversion is done here rather than in every screen.
 */
export function TablePager({ page, limit, total, onPageChange }) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={Math.max(0, page - 1)}
      rowsPerPage={limit}
      rowsPerPageOptions={[limit]}
      onPageChange={(_e, next) => onPageChange(next + 1)}
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count}`}
    />
  )
}

/** Shown in place of rows when a search matched nothing. */
export function NoResults({ query, noun = 'results' }) {
  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography color="text.secondary">
        {query ? `No ${noun} match “${query}”` : `No ${noun} yet`}
      </Typography>
    </Box>
  )
}
