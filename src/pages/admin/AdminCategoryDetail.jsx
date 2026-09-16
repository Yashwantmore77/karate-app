import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, AppBar, Toolbar, Typography, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Alert, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Stack } from '@mui/material'
import { ArrowBack, Add, Edit, Delete, FileDownload } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import { downloadCSV } from '../../utils/csvExport'

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
  const [competitors, setCompetitors] = useState([])
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      const t = JSON.parse(stored).find(x => x.id === tournamentId)
      setTournament(t)
    }
    const catStored = localStorage.getItem(`categories-${tournamentId}`)
    if (catStored) {
      const c = JSON.parse(catStored).find(x => x.id === categoryId)
      setCategory(c)
    }
    const compStored = localStorage.getItem(`competitors-${categoryId}`)
    if (compStored) setCompetitors(JSON.parse(compStored))
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
    onSubmit: (values) => {
      if (editingId) {
        const updated = competitors.map(c =>
          c.id === editingId ? { ...c, name: values.name, bib: values.bib, age: Number(values.age) } : c
        )
        setCompetitors(updated)
        localStorage.setItem(`competitors-${categoryId}`, JSON.stringify(updated))
      } else {
        const competitor = {
          id: 'comp-' + Date.now(),
          categoryId,
          name: values.name,
          bib: values.bib,
          age: Number(values.age),
          createdAt: new Date().toISOString()
        }
        const updated = [...competitors, competitor]
        setCompetitors(updated)
        localStorage.setItem(`competitors-${categoryId}`, JSON.stringify(updated))
      }
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

  const handleDelete = (id) => {
    const updated = competitors.filter(c => c.id !== id)
    setCompetitors(updated)
    localStorage.setItem(`competitors-${categoryId}`, JSON.stringify(updated))
    setDeleteConfirm(null)
  }

  const handleExportCompetitors = () => {
    downloadCSV(
      `${category?.name || 'category'}-competitors.csv`,
      [
        { label: 'Bib', value: (c) => c.bib },
        { label: 'Name', value: (c) => c.name },
        { label: 'Age', value: (c) => c.age },
      ],
      competitors
    )
  }

  if (!tournament || !category) return <div>Category not found</div>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate(`/admin/tournament/${tournamentId}`)} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{category.name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {tournament.name} • {category.ageGroup} • {category.gender}
            </Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Competitors ({competitors.length})</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleExportCompetitors}
              disabled={competitors.length === 0}
            >
              Export CSV
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>
              New Competitor
            </Button>
          </Stack>
        </Box>

        {competitors.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider' }}>
            <Typography color="text.secondary">No competitors yet</Typography>
            <Typography variant="caption" color="text.secondary">Click "New Competitor" to add one</Typography>
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
                      <IconButton size="small" color="primary" onClick={() => handleOpenEdit(c.id)} title="Edit" sx={{ mr: 1 }}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteConfirm(c.id)} title="Delete">
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
