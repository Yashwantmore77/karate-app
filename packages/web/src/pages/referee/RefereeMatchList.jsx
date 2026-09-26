import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, AppBar, Toolbar, Typography, Button, Select, MenuItem, FormControl, InputLabel, Stack, Alert, Paper, IconButton, Chip, Divider, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { ArrowBack, Add, Visibility, Delete, FileDownload } from '@mui/icons-material'
import { signOut, auth, JUDGE_COUNT } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'
import { downloadCSV } from '../../utils/csvExport'
import StandingsTable from '../../components/StandingsTable'

const validationSchema = Yup.object({
  redId: Yup.string().required('Select red competitor'),
  blueId: Yup.string().required('Select blue competitor'),
})

export default function RefereeMatchList({ uid }) {
  const navigate = useNavigate()
  const { categoryId } = useParams()
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [competitors, setCompetitors] = useState([])
  const [matches, setMatches] = useState([])
  const [openModal, setOpenModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const formik = useFormik({
    initialValues: { redId: '', blueId: '' },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: (values) => {
      if (values.redId === values.blueId) {
        formik.setFieldError('blueId', 'Competitors must be different')
        return
      }
      const match = {
        id: 'match-' + Date.now(),
        categoryId,
        redId: values.redId,
        blueId: values.blueId,
        status: 'open',
        createdAt: new Date().toISOString()
      }
      const updated = [...matches, match]
      setMatches(updated)
      localStorage.setItem(`matches-${categoryId}`, JSON.stringify(updated))
      formik.resetForm()
      setOpenModal(false)
    }
  })

  useEffect(() => {
    let allCats = []
    let allTournaments = []
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      allTournaments = JSON.parse(stored)
      allTournaments.forEach(t => {
        const catStored = localStorage.getItem(`categories-${t.id}`)
        if (catStored) allCats = [...allCats, ...JSON.parse(catStored)]
      })
    }
    const c = allCats.find(x => x.id === categoryId)
    setCategory(c)

    if (c) {
      const t = allTournaments.find(t => t.id === c.tournamentId)
      setTournament(t)
    }

    const compStored = localStorage.getItem(`competitors-${categoryId}`)
    if (compStored) setCompetitors(JSON.parse(compStored))
    const matchStored = localStorage.getItem(`matches-${categoryId}`)
    if (matchStored) setMatches(JSON.parse(matchStored))
  }, [categoryId])

  const getCompetitor = (id) => competitors.find(c => c.id === id)

  const handleDeleteMatch = (matchId) => {
    for (let seat = 1; seat <= JUDGE_COUNT; seat++) {
      localStorage.removeItem(`judge-${seat}-${matchId}`)
    }
    localStorage.removeItem(`match-control-${matchId}`)

    const updated = matches.filter(m => m.id !== matchId)
    setMatches(updated)
    localStorage.setItem(`matches-${categoryId}`, JSON.stringify(updated))
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
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/referee')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{category?.name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{competitors.length} contestants • {matches.length} matches</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
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
              onClick={() => setOpenModal(true)}
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
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirm(m.id)}
                          title="Delete Match"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
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

      <Dialog open={openModal} onClose={() => { setOpenModal(false); formik.resetForm() }} maxWidth="sm" fullWidth>
        <DialogTitle>Create Match</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
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
