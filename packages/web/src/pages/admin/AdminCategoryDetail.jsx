import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, Toolbar, Typography, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Stack } from '@mui/material'
import { ArrowBack, Add, Edit, Delete, FileDownload, SportsMma } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { TableSearch, TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import {
  tournaments as tournamentStore,
  categories as categoryStore,
  competitors as competitorStore,
} from '../../data/domain'
import { downloadCSV } from '../../utils/csvExport'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { describeError } from '../../data/tms'

const validationSchema = Yup.object({
  name: Yup.string().required('Name required').min(2, 'Name too short'),
  bib: Yup.string().required('Bib number required'),
  age: Yup.number().typeError('Age must be a number').positive('Age must be positive').integer('Age must be a whole number').required('Age required'),
})

export default function AdminCategoryDetail({ uid }) {
  const navigate = useNavigate()
  const { tournamentId, categoryId } = useParams()
  const [tournament, setTournament] = useState(null)
  const [category, setCategory] = useState(null)
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [loading, setLoading] = useState(true)

  const {
    rows: competitors, total, page, limit, search, setSearch, setPage, refresh, reset,
  } = usePagedList(
    useCallback((options) => competitorStore.page(categoryId, options), [categoryId]),
    { deps: [categoryId] }
  )

  useEffect(() => {
    let alive = true
    Promise.all([
      tournamentStore.get(tournamentId),
      categoryStore.get(tournamentId, categoryId),
    ]).then(([t, c]) => {
      if (!alive) return
      setTournament(t)
      setCategory(c)
      setLoading(false)
    })
    return () => { alive = false }
  }, [tournamentId, categoryId])

  const editingCompetitor = editingId ? competitors.find(c => c.id === editingId) : null

  const formik = useFormik({
    initialValues: {
      name: editingCompetitor?.name || '',
      bib: editingCompetitor?.bib || '',
      age: editingCompetitor?.age ?? '',
    },
    enableReinitialize: true,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      // Age arrives from a text field as a string; the store and the API both
      // want the number it represents.
      const fields = { name: values.name, bib: values.bib, age: Number(values.age) }
      if (editingId) await competitorStore.update(categoryId, editingId, fields)
      else {
        await competitorStore.create(categoryId, fields)
        await reset()
        handleCloseModal()
        return
      }
      await refresh()
      handleCloseModal()
    }
  })

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingId(null)
    formik.resetForm()
  }

  const handleOpenCreate = () => {
    setEditingId(null)
    setOpenModal(true)
  }

  const handleOpenEdit = (id) => {
    setEditingId(id)
    setOpenModal(true)
  }

  const handleDelete = async (id) => {
    try {
      await competitorStore.remove(categoryId, id)
      setDeleteError(null)
      await refresh()
    } catch (err) {
      setDeleteError(describeError(err))
    }
    setDeleteConfirm(null)
  }

  const handleExportCompetitors = async () => {
    // The whole roster, not the page on screen: an export that silently
    // stopped at 25 rows would be worse than no export at all.
    const everyone = await competitorStore.list(categoryId)
    downloadCSV(
      `${category?.name || 'category'}-competitors.csv`,
      [
        { label: 'Bib', value: (c) => c.bib },
        { label: 'Name', value: (c) => c.name },
        { label: 'Age', value: (c) => c.age },
      ],
      everyone
    )
  }

  if (loading) return <PageLoader label="Loading category…" />
  if (!tournament || !category) return <div>Category not found</div>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <IconButton color="inherit" aria-label="Back" onClick={() => navigate(`/admin/tournament/${tournamentId}`)} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <HelpTitle id="admin.category" variant="h6">{category.name}</HelpTitle>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {tournament.name} • {category.ageGroup} • {category.gender}
            </Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        {deleteError && <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ mb: 2 }}>{deleteError}</Alert>}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Competitors ({total})</Typography>
          <TableSearch value={search} onChange={setSearch} placeholder="Search name or bib" />
          <Stack direction="row" spacing={1}>
            {/* Competitors are entered here; their bouts are drawn and run on
                the match screen, which this used to give no way to reach. */}
            <Button
              variant="outlined"
              startIcon={<SportsMma />}
              onClick={() => navigate(`/referee/category/${categoryId}`)}
            >
              Matches
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleExportCompetitors}
              disabled={total === 0}
            >
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>
              New Competitor
            </Button>
          </Stack>
        </Box>

        {competitors.length === 0 ? (
          <Paper elevation={0} sx={{ border: '1px dashed', borderColor: 'divider' }}>
            <NoResults query={search} noun="competitors" />
          </Paper>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Bib</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Age</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {competitors.map(c => (
                  <TableRow key={c.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                    <TableCell><Chip label={c.bib} color="primary" size="small" /></TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{c.name}</TableCell>
                    <TableCell>{c.age}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={() => handleOpenEdit(c.id)} aria-label="Edit" sx={{ mr: 1 }}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteConfirm(c.id)} aria-label="Delete">
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePager page={page} limit={limit} total={total} onPageChange={setPage} />
          </TableContainer>
        )}
      </Container>

      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Competitor' : 'New Competitor'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box component="form" noValidate>
            <TextField
              fullWidth
              label="Name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.name}
              helperText={formik.errors.name || ' '}
              margin="normal"
              placeholder="E.g., Kenji Yamamoto"
            />
            <TextField
              fullWidth
              label="Bib Number"
              name="bib"
              value={formik.values.bib}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.bib}
              helperText={formik.errors.bib || ' '}
              margin="normal"
              placeholder="E.g., 101"
            />
            <TextField
              fullWidth
              label="Age"
              name="age"
              type="number"
              value={formik.values.age}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.age}
              helperText={formik.errors.age || ' '}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button variant="contained" onClick={formik.handleSubmit}>
            {editingId ? 'Update Competitor' : 'Add Competitor'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Competitor?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently remove this competitor. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={() => handleDelete(deleteConfirm)} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
