import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, AppBar, Toolbar, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Grid, Paper, IconButton, Chip, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, Stack } from '@mui/material'
import { ArrowBack, Edit, Delete, Add, Visibility } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'

const validationSchema = Yup.object({
  catName: Yup.string().required('Category name required'),
  ageGroup: Yup.string().required('Age group required'),
  gender: Yup.string().required('Gender required'),
  division: Yup.string().required('Division required'),
})

export default function AdminTournamentDetail({ uid }) {
  const navigate = useNavigate()
  const { tournamentId } = useParams()
  const [tournament, setTournament] = useState(null)
  const [categories, setCategories] = useState([])
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
    if (catStored) setCategories(JSON.parse(catStored))
  }, [tournamentId])

  const editingCategory = editingId ? categories.find(c => c.id === editingId) : null

  const formik = useFormik({
    initialValues: {
      catName: editingCategory?.name || '',
      ageGroup: editingCategory?.ageGroup || '',
      gender: editingCategory?.gender || 'M',
      division: editingCategory?.division || ''
    },
    enableReinitialize: true,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: (values) => {
      try {
        if (editingId) {
          const updated = categories.map(c =>
            c.id === editingId
              ? { ...c, name: values.catName, ageGroup: values.ageGroup, gender: values.gender, division: values.division }
              : c
          )
          setCategories(updated)
          localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))
          handleCloseModal()
        } else {
          const category = {
            id: 'cat-' + Date.now(),
            tournamentId,
            name: values.catName,
            ageGroup: values.ageGroup,
            gender: values.gender,
            division: values.division,
            createdAt: new Date().toISOString()
          }
          const updated = [...categories, category]
          setCategories(updated)
          localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))
          handleCloseModal()
        }
      } catch (error) {
        console.error('Error saving category:', error)
      }
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
    localStorage.removeItem(`competitors-${id}`)
    localStorage.removeItem(`matches-${id}`)

    const updated = categories.filter(c => c.id !== id)
    setCategories(updated)
    localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(updated))
    setDeleteConfirm(null)
  }

  if (!tournament) return <div>Tournament not found</div>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/admin')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">{tournament.name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {tournament.location} • {new Date(tournament.date).toLocaleDateString()}
            </Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Categories ({categories.length})</Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenCreate}
          >
            New Category
          </Button>
        </Box>

        {categories.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider' }}>
            <Typography color="text.secondary">No categories yet</Typography>
            <Typography variant="caption" color="text.secondary">Click "New Category" to create one</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Age Group</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Gender</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Division</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>{c.name}</TableCell>
                    <TableCell>{c.ageGroup}</TableCell>
                    <TableCell>{c.gender}</TableCell>
                    <TableCell>{c.division}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => navigate(`/admin/tournament/${tournamentId}/category/${c.id}`)}
                        title="View Competitors"
                        sx={{ mr: 1 }}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenEdit(c.id)}
                        title="Edit"
                        sx={{ mr: 1 }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteConfirm(c.id)}
                        title="Delete"
                      >
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
        <DialogTitle>
          {editingId ? 'Edit Category' : 'Create Category'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box component="form" noValidate>
            <TextField
              fullWidth
              label="Category Name"
              name="catName"
              value={formik.values.catName}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.catName}
              helperText={formik.errors.catName || ' '}
              margin="normal"
              placeholder="E.g., U12 Boys Kata"
            />

            <TextField
              fullWidth
              label="Age Group"
              name="ageGroup"
              value={formik.values.ageGroup}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.ageGroup}
              helperText={formik.errors.ageGroup || ' '}
              margin="normal"
              placeholder="E.g., U12"
            />

            <FormControl fullWidth margin="normal" error={!!formik.errors.gender}>
              <InputLabel>Gender</InputLabel>
              <Select
                name="gender"
                value={formik.values.gender}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                label="Gender"
              >
                <MenuItem value="M">Male</MenuItem>
                <MenuItem value="F">Female</MenuItem>
                <MenuItem value="Mixed">Mixed</MenuItem>
              </Select>
              {formik.errors.gender && <FormHelperText>{formik.errors.gender}</FormHelperText>}
            </FormControl>

            <TextField
              fullWidth
              label="Division"
              name="division"
              value={formik.values.division}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.division}
              helperText={formik.errors.division || ' '}
              margin="normal"
              placeholder="E.g., Beginner"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button
            variant="contained"
            onClick={formik.handleSubmit}
          >
            {editingId ? 'Update Category' : 'Create Category'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Category?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete this category and all associated data. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            onClick={() => handleDelete(deleteConfirm)}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
