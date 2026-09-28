import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, Toolbar, Typography, Button, Select, MenuItem, FormControl, InputLabel, Stack, Alert, Paper, IconButton, Chip, Divider, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { ArrowBack, Add, Visibility, Delete, FileDownload } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { JUDGE_COUNT } from '../../firebase'
import {
  tournaments as tournamentStore,
  categories as categoryStore,
  competitors as competitorStore,
  matches as matchStore,
  isRemote,
} from '../../data/domain'
import { isExpired } from '../../utils/dateUtils'
import { downloadCSV } from '../../utils/csvExport'
import StandingsTable from '../../components/StandingsTable'

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
}
const messageFor = (err) => MESSAGES[err?.code] || 'Could not save that. Try again.'

export default function RefereeMatchList({ uid, profile }) {
  const navigate = useNavigate()
  const { categoryId } = useParams()

  // The server lets a referee schedule a bout but not remove one, so the icon
  // is hidden rather than left to fail on click. Local mode has no server to
  // refuse it, and hiding it there would take away something that works.
  const canDelete = !isRemote || profile?.role === 'admin'
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [competitors, setCompetitors] = useState([])
  const [matches, setMatches] = useState([])
  const [openModal, setOpenModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [error, setError] = useState(null)

  const formik = useFormik({
    initialValues: { redId: '', blueId: '' },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      if (values.redId === values.blueId) {
        formik.setFieldError('blueId', 'Competitors must be different')
        return
      }
      try {
        await matchStore.create(categoryId, {
          redId: values.redId,
          blueId: values.blueId,
          status: 'open',
        })
      } catch (err) {
        // Kept in the dialog rather than behind it: the selections are still
        // on screen, and closing over a failure would look like it worked.
        setError(messageFor(err))
        return
      }
      setError(null)
      setMatches(await matchStore.list(categoryId))
      formik.resetForm()
      setOpenModal(false)
    }
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [category, competitorRows, matchRows] = await Promise.all([
        categoryStore.find(categoryId),
        competitorStore.list(categoryId),
        matchStore.list(categoryId),
      ])
      // Only the owning tournament is still unknown, and only if the category
      // resolved at all.
      const tournament = category ? await tournamentStore.get(category.tournamentId) : null
      if (!alive) return
      setCategory(category)
      setTournament(tournament)
      setCompetitors(competitorRows)
      setMatches(matchRows)
    })()
    return () => { alive = false }
  }, [categoryId])

  const getCompetitor = (id) => competitors.find(c => c.id === id)

  const handleDeleteMatch = async (matchId) => {
    for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
      localStorage.removeItem(`judge-${seat}-${matchId}`)
    }
    localStorage.removeItem(`match-control-${matchId}`)

    try {
      await matchStore.remove(categoryId, matchId)
      setError(null)
      setMatches(await matchStore.list(categoryId))
    } catch (err) {
      setError(messageFor(err))
    }
    setDeleteConfirm(null)
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
      matches
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
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{competitors.length} contestants • {matches.length} matches</Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        {/* A delete refused by the server surfaces here, where the table is. */}
        {error && !openModal && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {tournamentExpired && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Tournament expired on {new Date(tournament.date).toLocaleDateString()}. You can view matches but cannot create new ones.
          </Alert>
        )}

        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Matches ({matches.length})</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleExportResults}
              disabled={matches.length === 0}
            >
              Export Results
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => { setError(null); setOpenModal(true) }}
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

        {matches.length === 0 ? (
          <Alert severity="info">
            {competitors.length < 2
              ? `Need at least 2 competitors to create a match (${competitors.length}/2)`
              : 'No matches yet • Click "New Match" to get started'}
          </Alert>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Red</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>vs</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Blue</TableCell>
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
          </TableContainer>
        )}

        <Typography variant="h6" sx={{ mb: 2 }}>Standings</Typography>
        <StandingsTable competitors={competitors} matches={matches} />
      </Container>

      <Dialog open={openModal} onClose={() => { setOpenModal(false); setError(null); formik.resetForm() }} maxWidth="sm" fullWidth>
        <DialogTitle>Create Match</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
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
                <Typography variant="h6">{matches.length}</Typography>
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
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => { setOpenModal(false); formik.resetForm() }}>Cancel</Button>
          <Button variant="contained" onClick={formik.handleSubmit}>Create Match</Button>
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
