import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container, Box, Toolbar, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Paper, Table, TableContainer, TableHead, TableBody, TableRow,
  TableCell, IconButton, Stack, Chip, Alert, Tooltip, Link,
} from '@mui/material'
import { ArrowBack, Refresh } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import * as loginLog from '../../data/loginLog'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { describeError } from '../../data/tms'

// The server answers with a code; these are the ones a person can act on.
const MESSAGES = {
  forbidden: 'Only an administrator can read the sign-in log.',
  unauthorized: 'Your session has expired. Sign in again.',
}
const messageFor = (err) => MESSAGES[err?.code] || (err?.code && err.code !== 'error' ? describeError(err) : 'Something went wrong. Try again.')

const OUTCOME_LABELS = {
  success: 'Signed in',
  invalid_credentials: 'Rejected',
  rate_limited: 'Throttled',
}

// Rejected is amber rather than red: a mistyped password is ordinary, and
// colouring it as an emergency would bury the throttled rows that are not.
const OUTCOME_COLOURS = {
  success: 'success',
  invalid_credentials: 'warning',
  rate_limited: 'error',
}

const PAGE_SIZES = [50, 100, 200]

const formatWhen = (iso) => {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleString()
}

/**
 * Where an entry says it came from, most specific part first.
 *
 * Browser coordinates and the address-derived location are kept apart
 * everywhere else because one is a claim and the other an observation, and this
 * is the one place they meet — so the tooltip says which is which rather than
 * presenting a single confident answer.
 */
const placeOf = ({ geo }) => {
  const parts = [geo?.city, geo?.region, geo?.country].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

const coordsOf = ({ geo, browserCoords }) => {
  const source = browserCoords ?? geo
  if (!source || source.latitude == null || source.longitude == null) return null
  return {
    text: `${source.latitude.toFixed(4)}, ${source.longitude.toFixed(4)}`,
    precise: !!browserCoords,
    accuracyM: browserCoords?.accuracyM ?? null,
  }
}

export default function AdminLoginLog() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [outcome, setOutcome] = useState('')
  const [email, setEmail] = useState('')
  const [appliedEmail, setAppliedEmail] = useState('')
  const [limit, setLimit] = useState(50)

  const {
    rows: entries, total, page, setPage, loading, error: loadError, refresh: load,
  } = usePagedList(
    useCallback((options) => (
      loginLog.page({ ...options, outcome, email: appliedEmail })
    ), [outcome, appliedEmail]),
    { limit, deps: [outcome, appliedEmail] }
  )

  // The address applies on Apply/Enter rather than per keystroke, so typing
  // does not fire a request per letter.
  const applyEmail = () => setAppliedEmail(email.trim())

  // Nothing on this page writes, so the only failure worth showing is the read.
  const shownError = error || (loadError ? messageFor(loadError) : null)

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' },
      bgcolor: 'background.default',
    }}>
      <PageBar>
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/admin')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <HelpTitle id="admin.signins" variant="h6">Sign-ins</HelpTitle>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Every attempt on this system, accepted or not
            </Typography>
          </Box>
          <IconButton color="inherit" aria-label="Refresh" onClick={load}>
            <Refresh />
          </IconButton>
        </Toolbar>
      </PageBar>

      <Container maxWidth="xl" sx={{ py: 4, flexGrow: 1 }}>
        <>
          {shownError && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{shownError}</Alert>}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 3 }}
            component="form"
            onSubmit={(e) => { e.preventDefault(); applyEmail() }}
          >
            <TextField
              label="Account"
              size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              sx={{ minWidth: 240 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="outcome-label">Outcome</InputLabel>
              <Select
                labelId="outcome-label"
                label="Outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {loginLog.OUTCOMES.map((value) => (
                  <MenuItem key={value} value={value}>{OUTCOME_LABELS[value]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="limit-label">Show</InputLabel>
              <Select
                labelId="limit-label"
                label="Show"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              >
                {PAGE_SIZES.map((size) => (
                  <MenuItem key={size} value={size}>{size}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button type="submit" variant="outlined">Apply</Button>
          </Stack>

          {loading ? <PageLoader label="Loading sign-ins…" /> : entries.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <NoResults query={appliedEmail || outcome} noun="sign-ins" />
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Outcome</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Address</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Device</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => {
                    const place = placeOf(entry)
                    const coords = coordsOf(entry)
                    return (
                      <TableRow key={entry.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWhen(entry.at)}</TableCell>
                        <TableCell>{entry.email || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={OUTCOME_LABELS[entry.outcome] || entry.outcome}
                            color={OUTCOME_COLOURS[entry.outcome] || 'default'}
                          />
                        </TableCell>
                        <TableCell>{entry.role || '—'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {entry.ip || '—'}
                        </TableCell>
                        <TableCell>
                          {!place && !coords ? '—' : (
                            <Stack spacing={0.25}>
                              {place && <Typography variant="body2">{place}</Typography>}
                              {coords && (
                                <Tooltip
                                  title={coords.precise
                                    ? `Reported by the browser${coords.accuracyM ? `, accurate to about ${coords.accuracyM}m` : ''}. Self-reported, so it can be faked.`
                                    : 'Estimated from the network address, so it is approximate.'}
                                >
                                  <Link
                                    href={`https://www.openstreetmap.org/?mlat=${coords.text.split(', ')[0]}&mlon=${coords.text.split(', ')[1]}#map=12/${coords.text.replace(', ', '/')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="caption"
                                    sx={{ fontFamily: 'monospace' }}
                                  >
                                    {coords.text}{coords.precise ? ' (GPS)' : ''}
                                  </Link>
                                </Tooltip>
                              )}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260 }}>
                          <Tooltip title={entry.userAgent || ''}>
                            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                              {entry.userAgent || '—'}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePager page={page} limit={limit} total={total} onPageChange={setPage} />
            </TableContainer>
          )}
        </>
      </Container>
    </Box>
  )
}
