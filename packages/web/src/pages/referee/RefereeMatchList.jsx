import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, Toolbar, Typography, Button, Select, MenuItem, FormControl, InputLabel, Stack, Alert, AlertTitle, Paper, IconButton, Chip, Divider, FormHelperText, TextField, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { ArrowBack, Add, Visibility, Delete, FileDownload, Groups, Shuffle } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { TableSearch, TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import {
  tournaments as tournamentStore,
  categories as categoryStore,
  competitors as competitorStore,
  matches as matchStore,
} from '../../data/domain'
import { isExpired } from '../../utils/dateUtils'
import { localInputToIso, isoToLocalInput, formatSlotTime, describeClashes } from '../../utils/scheduleTime'
import { downloadCSV } from '../../utils/csvExport'
import StandingsTable from '../../components/StandingsTable'
import * as users from '../../data/users'
import { PageLoader } from '../../components/Loader'

// Used until a tournament says otherwise; matches the server's own default.
const DEFAULT_JUDGE_COUNT = 4
const DEFAULT_SLOT_MINUTES = 15

const validationSchema = Yup.object({
  redId: Yup.string().required('Select red competitor'),
  blueId: Yup.string().required('Select blue competitor'),
})

// The server answers with a code; these are the ones a person can act on.
// Without them a refused write looked exactly like a broken button: the
// promise rejected, nothing caught it, and the dialog just sat there.
const MESSAGES = {
  forbidden: 'Your role cannot schedule matches. Ask an administrator to add it.',
  unauthorized: 'Your session has expired. Sign in again.',
  invalid_redId: 'That red competitor is not entered in this category.',
  invalid_blueId: 'That blue competitor is not entered in this category.',
  not_found: 'This category no longer exists.',
  invalid_refereeId: 'That person cannot referee a bout.',
  invalid_judgeIds: 'One of those judges is not a judge, or is listed twice.',
  referee_also_judge: 'The referee cannot also sit on the judging panel.',
  too_many_judges: 'That is more judges than this tournament seats.',
  same_competitor: 'A bout needs two different competitors.',
  invalid_scheduledAt: 'That is not a valid date and time.',
  invalid_mat: 'A mat is a whole number from 1 to 99.',
  // A clash is reported on its own, with the detail the server sent, so this
  // is only the headline above it.
  schedule_conflict: 'Somebody on this bout, or the mat, is already busy at that time.',
}
const messageFor = (err) => MESSAGES[err?.code] || 'Could not save that. Try again.'

const drawMessage = (err) => {
  if (err?.code === 'too_many_for_round_robin') {
    const { count, max } = err.details || {}
    return `A round robin is limited to ${max ?? 32} competitors, and this category has ${count ?? 'more'}. Split it into pools.`
  }
  if (err?.code === 'not_enough_competitors') return 'Enter at least two competitors before drawing.'
  return messageFor(err)
}

/** How many bouts a full round robin of `n` entrants is. */
const roundRobinSize = (n) => (n * (n - 1)) / 2

export default function RefereeMatchList({ uid, profile }) {
  const navigate = useNavigate()
  const { categoryId } = useParams()

  // The server lets a referee schedule a bout but not remove one, so the icon
  // is hidden rather than left to fail on click.
  const canDelete = profile?.role === 'admin'
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [competitors, setCompetitors] = useState([])
  const [openModal, setOpenModal] = useState(false)
  // The match being edited, or null when the dialog is creating one. The
  // panel has to be changeable after the fact: bouts are listed as soon as
  // the draw is made, and who is officiating is settled later.
  const [editingMatch, setEditingMatch] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [drawConfirm, setDrawConfirm] = useState(false)
  // What the last draw did, or why it could not. Kept apart from `error`,
  // which belongs to the dialog and to deletes.
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  // Kept apart from `error`: a clash is a list of people, not one sentence,
  // and the referee needs to see every name to decide what to move.
  const [clashes, setClashes] = useState([])

  const {
    rows: matches, total, page, limit, search, setSearch, setPage, refresh, reset, loading,
  } = usePagedList(
    useCallback((options) => matchStore.page(categoryId, options), [categoryId]),
    { deps: [categoryId] }
  )

  // Every bout in the category, for the standings and the export. Kept apart
  // from the table rows: those are one page of a search, and a standings table
  // built from them changed whenever someone paged or typed in the search box.
  const [allMatches, setAllMatches] = useState([])
  const loadAllMatches = useCallback(async () => {
    try {
      setAllMatches(await matchStore.list(categoryId))
    } catch {
      // The table reports its own load failure; standings just stay as they were.
    }
  }, [categoryId])
  useEffect(() => { loadAllMatches() }, [loadAllMatches])

  // Who can be put on a bout, for the referee and judge pickers.
  const [referees, setReferees] = useState([])
  const [judges, setJudges] = useState([])
  const judgeLimit = tournament?.judgeCount ?? DEFAULT_JUDGE_COUNT
  const slotMinutes = tournament?.slotMinutes ?? DEFAULT_SLOT_MINUTES

  const formik = useFormik({
    initialValues: {
      redId: editingMatch?.redId || '',
      blueId: editingMatch?.blueId || '',
      refereeId: editingMatch?.refereeId || '',
      judgeIds: editingMatch?.judgeIds || [],
      scheduledAt: isoToLocalInput(editingMatch?.scheduledAt),
      mat: editingMatch?.mat ?? '',
    },
    // So opening the dialog on a different match reloads the fields rather
    // than showing the one opened before it.
    enableReinitialize: true,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      if (values.redId === values.blueId) {
        formik.setFieldError('blueId', 'Competitors must be different')
        return
      }

      // A time that will not parse is caught here rather than sent, so the
      // field can say so next to itself.
      const scheduledIso = values.scheduledAt ? localInputToIso(values.scheduledAt) : null
      if (values.scheduledAt && !scheduledIso) {
        formik.setFieldError('scheduledAt', 'That is not a valid date and time')
        return
      }

      const mat = values.mat === '' ? null : Number(values.mat)
      if (mat !== null && !(Number.isInteger(mat) && mat >= 1 && mat <= 99)) {
        formik.setFieldError('mat', 'A mat is a whole number from 1 to 99')
        return
      }
      try {
        if (editingMatch) {
          // A patch sends null to clear, where a create simply omits: the two
          // mean different things to the API, and clearing a panel has to be
          // possible once one has been set.
          await matchStore.update(categoryId, editingMatch.id, {
            redId: values.redId,
            blueId: values.blueId,
            refereeId: values.refereeId || null,
            judgeIds: values.judgeIds,
            scheduledAt: scheduledIso,
            mat,
          })
        } else {
          await matchStore.create(categoryId, {
            redId: values.redId,
            blueId: values.blueId,
            status: 'open',
            // Omitted rather than sent empty: the schema rejects an unknown
            // shape, and "no referee" is the absence of the field.
            ...(values.refereeId ? { refereeId: values.refereeId } : {}),
            ...(values.judgeIds.length ? { judgeIds: values.judgeIds } : {}),
            // The input gives naive wall-clock text; the API wants an instant.
            ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
            ...(mat !== null ? { mat } : {}),
          })
        }
      } catch (err) {
        // Kept in the dialog rather than behind it: the selections are still
        // on screen, and closing over a failure would look like it worked.
        setError(messageFor(err))
        setClashes(describeClashes(err?.details?.clashes, nameFor))
        return
      }
      setError(null)
      setClashes([])
      // An edit stays where it is; a new bout belongs on the first page.
      await Promise.all([editingMatch ? refresh() : reset(), loadAllMatches()])
      formik.resetForm()
      setEditingMatch(null)
      setOpenModal(false)
    }
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [category, competitorRows] = await Promise.all([
        categoryStore.find(categoryId),
        competitorStore.list(categoryId),
      ])
      // Only the owning tournament is still unknown, and only if the category
      // resolved at all.
      const tournament = category ? await tournamentStore.get(category.tournamentId) : null
      if (!alive) return
      setCategory(category)
      setTournament(tournament)
      setCompetitors(competitorRows)
    })()
    return () => { alive = false }
  }, [categoryId])

  useEffect(() => {
    let alive = true
    Promise.all([users.officials('referee'), users.officials('judge')])
      .then(([refs, js]) => {
        if (!alive) return
        setReferees(refs)
        setJudges(js)
      })
      // A referee who cannot read the roster can still schedule a bout; they
      // just get no pickers, which is better than a broken dialog.
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const getCompetitor = (id) => competitors.find(c => c.id === id)

  /** Opens the dialog on a bout, or on nothing to create one. */
  const openFor = (match) => {
    setEditingMatch(match)
    setError(null)
    setClashes([])
    setOpenModal(true)
  }

  const closeDialog = () => {
    setOpenModal(false)
    setEditingMatch(null)
    setError(null)
    setClashes([])
    formik.resetForm()
  }

  /**
   * A uid as something readable, across all three rosters.
   *
   * A clash can name a fighter or an official, and the server reports only the
   * uid, so every roster this screen already holds is searched before giving
   * up and showing the id itself.
   */
  const nameFor = (id) => (
    getCompetitor(id)?.name
    || referees.find((r) => r.uid === id)?.email
    || judges.find((j) => j.uid === id)?.email
    || null
  )

  const handleDeleteMatch = async (matchId) => {
    try {
      await matchStore.remove(categoryId, matchId)
      setError(null)
      await Promise.all([refresh(), loadAllMatches()])
    } catch (err) {
      setError(messageFor(err))
    }
    setDeleteConfirm(null)
  }

  const handleDraw = async () => {
    setDrawConfirm(false)
    try {
      const { created, skipped } = await matchStore.draw(categoryId)
      setNotice(created === 0
        ? { severity: 'info', text: 'Every pair already has a bout. Nothing new to draw.' }
        : {
            severity: 'success',
            text: `Drew ${created} bout${created === 1 ? '' : 's'}`
              + (skipped ? `, skipping ${skipped} already made.` : '.')
              + ' Set their times, mats and panels from each row.',
          })
      await Promise.all([reset(), loadAllMatches()])
    } catch (err) {
      setNotice({ severity: 'error', text: drawMessage(err) })
    }
  }

  const handleExportResults = () => {
    downloadCSV(
      `${category?.name || 'category'}-results.csv`,
      [
        { label: 'Red Bib', value: (m) => getCompetitor(m.redId)?.bib },
        { label: 'Red Name', value: (m) => getCompetitor(m.redId)?.name },
        { label: 'Blue Bib', value: (m) => getCompetitor(m.blueId)?.bib },
        { label: 'Blue Name', value: (m) => getCompetitor(m.blueId)?.name },
        { label: 'Status', value: (m) => m.status },
        { label: 'Winner', value: (m) => m.winner || '' },
        { label: 'Red Avg Score', value: (m) => m.avgRed ?? '' },
        { label: 'Blue Avg Score', value: (m) => m.avgBlue ?? '' },
      ],
      // The whole category, not the page on screen.
      allMatches
    )
  }

  const tournamentExpired = tournament && isExpired(tournament.date)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/referee')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{category?.name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{competitors.length} contestants • {total} matches</Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        {/* A delete refused by the server surfaces here, where the table is. */}
        {error && !openModal && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {notice && (
          <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
            {notice.text}
          </Alert>
        )}

        {tournamentExpired && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Tournament expired on {new Date(tournament.date).toLocaleDateString()}. You can view matches but cannot create new ones.
          </Alert>
        )}

        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Matches ({total})</Typography>
          <TableSearch value={search} onChange={setSearch} placeholder="Search status or winner" />
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleExportResults}
              disabled={total === 0}
            >
              Export Results
            </Button>
            <Button
              variant="outlined"
              startIcon={<Shuffle />}
              onClick={() => setDrawConfirm(true)}
              disabled={competitors.length < 2 || tournamentExpired}
              title={competitors.length < 2 ? 'Need at least 2 competitors' : 'Create a bout for every pair'}
            >
              Draw Round Robin
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => openFor(null)}
              disabled={competitors.length < 2 || tournamentExpired}
              title={
                tournamentExpired
                  ? "Cannot create matches in expired tournament"
                  : competitors.length < 2
                  ? `Need at least 2 competitors (${competitors.length}/2)`
                  : ""
              }
            >
              New Match
            </Button>
          </Stack>
        </Box>

        {loading && matches.length === 0 ? <PageLoader label="Loading matches…" /> : matches.length === 0 ? (
          <Alert severity="info">
            {competitors.length < 2
              ? `Need at least 2 competitors to create a match (${competitors.length}/2)`
              : 'No matches yet • Draw a round robin, or add bouts one at a time with "New Match"'}
          </Alert>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Red</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>vs</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Blue</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Panel</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const red = getCompetitor(m.redId)
                  const blue = getCompetitor(m.blueId)
                  return (
                    <TableRow key={m.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                      <TableCell>
                        <Box sx={{ p: 1, bgcolor: 'error.light', borderRadius: 1, textAlign: 'center' }}>
                          <Typography variant="subtitle2" sx={{ color: 'error.dark', fontWeight: 600 }}>#{red?.bib}</Typography>
                          <Typography variant="body2" sx={{ color: 'error.dark' }}>{red?.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>vs</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ p: 1, bgcolor: 'info.light', borderRadius: 1, textAlign: 'center' }}>
                          <Typography variant="subtitle2" sx={{ color: 'info.dark', fontWeight: 600 }}>#{blue?.bib}</Typography>
                          <Typography variant="body2" sx={{ color: 'info.dark' }}>{blue?.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatSlotTime(m.scheduledAt)}
                        </Typography>
                        {m.mat && (
                          <Typography variant="caption" color="text.secondary">Mat {m.mat}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Shown as counts rather than names: a panel of four
                            emails is wider than the rest of the row put
                            together, and the dialog lists them in full. */}
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            size="small"
                            variant={m.refereeId ? 'filled' : 'outlined'}
                            color={m.refereeId ? 'primary' : 'default'}
                            label={m.refereeId ? 'Referee' : 'No referee'}
                          />
                          <Chip
                            size="small"
                            variant={m.judgeIds?.length ? 'filled' : 'outlined'}
                            color={m.judgeIds?.length === judgeLimit ? 'success' : 'default'}
                            label={`${m.judgeIds?.length || 0}/${judgeLimit} judges`}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={m.status}
                          size="small"
                          color={m.status === 'open' ? 'success' : m.status === 'completed' ? 'default' : 'warning'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/referee/match/${m.id}`)}
                          title="Control Match"
                          sx={{ mr: 1 }}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                        {/* The panel and the time are set here rather than only
                            at creation: both are normally decided after the
                            draw has already produced the bout. */}
                        <IconButton
                          size="small"
                          onClick={() => openFor(m)}
                          title="Assign officials & time"
                          sx={{ mr: 1 }}
                        >
                          <Groups fontSize="small" />
                        </IconButton>
                        {canDelete && (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteConfirm(m.id)}
                            title="Delete Match"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePager page={page} limit={limit} total={total} onPageChange={setPage} />
          </TableContainer>
        )}

        <Typography variant="h6" sx={{ mb: 2 }}>Standings</Typography>
        <StandingsTable competitors={competitors} matches={allMatches} />
      </Container>

      <Dialog open={openModal} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingMatch ? 'Assign Officials & Time' : 'Create Match'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {clashes.length > 0 ? <AlertTitle>{error}</AlertTitle> : error}
              {/* Every clash is listed, not just the first: moving one person
                  does no good if a second is also double-booked. */}
              {clashes.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {clashes.map((line) => <li key={line}>{line}</li>)}
                </Box>
              )}
            </Alert>
          )}

          <Box sx={{ mb: 2, p: 2, bgcolor: 'info.main', borderRadius: 1, color: 'white' }}>
            <Stack direction="row" spacing={3}>
              <Box>
                <Typography variant="caption">Contestants</Typography>
                <Typography variant="h6">{competitors.length}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="caption">Matches</Typography>
                <Typography variant="h6">{total}</Typography>
              </Box>
            </Stack>
          </Box>

          <Box component="form" noValidate>
            <FormControl fullWidth margin="normal" error={!!formik.errors.redId}>
              <InputLabel>Red Competitor</InputLabel>
              <Select
                name="redId"
                value={formik.values.redId}
                label="Red Competitor"
                onChange={formik.handleChange}
              >
                <MenuItem value="">Select</MenuItem>
                {competitors.map((c, idx) => (
                  <MenuItem key={c.id} value={c.id}>({idx + 1}) {c.name} - #{c.bib}</MenuItem>
                ))}
              </Select>
              {formik.errors.redId && <FormHelperText>{formik.errors.redId}</FormHelperText>}
            </FormControl>

            <FormControl fullWidth margin="normal" error={!!formik.errors.blueId}>
              <InputLabel>Blue Competitor</InputLabel>
              <Select
                name="blueId"
                value={formik.values.blueId}
                label="Blue Competitor"
                onChange={formik.handleChange}
              >
                <MenuItem value="">Select</MenuItem>
                {competitors.map((c, idx) => (
                  <MenuItem key={c.id} value={c.id}>({idx + 1}) {c.name} - #{c.bib}</MenuItem>
                ))}
              </Select>
              {formik.errors.blueId && <FormHelperText>{formik.errors.blueId}</FormHelperText>}
            </FormControl>

            {/* Optional, like the panel: the draw is made before the timetable
                is, and a bout with no time yet blocks nobody. Giving it one is
                what brings it into the clash check. */}
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <TextField
                fullWidth
                margin="normal"
                type="datetime-local"
                name="scheduledAt"
                label="Scheduled time (optional)"
                value={formik.values.scheduledAt}
                onChange={formik.handleChange}
                error={!!formik.errors.scheduledAt}
                helperText={
                  formik.errors.scheduledAt
                  || `Holds everyone on this bout for ${slotMinutes} minutes.`
                }
                InputLabelProps={{ shrink: true }}
              />
              {/* Which mat the bout is fought on. Two bouts can share a time
                  on different mats, but not on the same one. */}
              <TextField
                margin="normal"
                type="number"
                name="mat"
                label="Mat"
                value={formik.values.mat}
                onChange={formik.handleChange}
                error={!!formik.errors.mat}
                helperText={formik.errors.mat || ' '}
                inputProps={{ min: 1, max: 99 }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 110, flexShrink: 0 }}
              />
            </Stack>

            {/* Officials are optional: a bout is often listed before the panel
                for it is settled, and the server accepts it either way. */}
            <Divider sx={{ my: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {editingMatch ? 'Officials' : 'Officials (optional)'}
              </Typography>
            </Divider>

            <FormControl fullWidth margin="normal">
              <InputLabel>Referee</InputLabel>
              <Select
                name="refereeId"
                value={formik.values.refereeId}
                label="Referee"
                onChange={formik.handleChange}
              >
                <MenuItem value="">Unassigned</MenuItem>
                {referees.map((r) => (
                  <MenuItem key={r.uid} value={r.uid}>{r.email}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth margin="normal">
              <InputLabel>Judges</InputLabel>
              <Select
                multiple
                name="judgeIds"
                value={formik.values.judgeIds}
                label="Judges"
                onChange={formik.handleChange}
                renderValue={(selected) => (
                  selected.length === 0
                    ? 'None'
                    : selected
                      .map((id) => judges.find((j) => j.uid === id)?.email || id)
                      .join(', ')
                )}
              >
                {judges.map((j) => (
                  <MenuItem
                    key={j.uid}
                    value={j.uid}
                    // The panel is capped by the tournament, so the surplus is
                    // unpickable rather than rejected after the fact.
                    disabled={
                      !formik.values.judgeIds.includes(j.uid)
                      && formik.values.judgeIds.length >= judgeLimit
                    }
                  >
                    {j.email}{j.seat ? ` · seat ${j.seat}` : ''}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {formik.values.judgeIds.length} of {judgeLimit} selected
              </FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={formik.handleSubmit}>{editingMatch ? 'Save Changes' : 'Create Match'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={drawConfirm} onClose={() => setDrawConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Draw a round robin?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            Every pair of the {competitors.length} competitors gets a bout:{' '}
            <strong>{roundRobinSize(competitors.length)} in all</strong>. Pairs that already
            have one are skipped, so drawing again only adds what is missing.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The bouts are created without a time, mat or panel. Set those from each row afterwards.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrawConfirm(false)}>Cancel</Button>
          <Button onClick={handleDraw} variant="contained">Draw</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Match?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently remove this match and any judge scores submitted for it. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={() => handleDeleteMatch(deleteConfirm)} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
