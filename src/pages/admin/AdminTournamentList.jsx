import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import dayjs from 'dayjs'
import { Container, Box, AppBar, Toolbar, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Grid, Paper, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { Edit, Delete, Visibility, Add } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import { formatDate } from '../../utils/dateUtils'

const validationSchema = Yup.object({
  name: Yup.string().required('Tournament name required').min(3, 'Name too short'),
  location: Yup.string().required('Location required'),
  date: Yup.date().nullable().required('Date required'),
  template: Yup.string().required('Template required'),
})

export default function AdminTournamentList({ uid }) {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState([])
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('tournaments')
    if (stored) setTournaments(JSON.parse(stored))
  }, [])

  const editingTournament = editingId ? tournaments.find(t => t.id === editingId) : null

  const formik = useFormik({
    initialValues: {
      name: editingTournament?.name || '',
      location: editingTournament?.location || '',
      date: editingTournament?.date ? dayjs(editingTournament.date) : null,
      template: editingTournament?.template || 'kata'
    },
    enableReinitialize: true,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: (values) => {
      if (editingId) {
        const updated = tournaments.map(t =>
          t.id === editingId
            ? {
                ...t,
                name: values.name,
                location: values.location,
                date: formatDate(values.date),
                template: values.template
              }
            : t
        )
        setTournaments(updated)
        localStorage.setItem('tournaments', JSON.stringify(updated))
        handleCloseModal()
      } else {
        const tournament = {
          id: 'tournament-' + Date.now(),
          name: values.name,
          location: values.location,
          date: formatDate(values.date),
          template: values.template,
          status: 'draft',
          createdAt: new Date().toISOString()
        }
        const updated = [...tournaments, tournament]
        setTournaments(updated)
        localStorage.setItem('tournaments', JSON.stringify(updated))
        handleCloseModal()
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
    const catStored = localStorage.getItem(`categories-${id}`)
    if (catStored) {
      JSON.parse(catStored).forEach((c) => {
        localStorage.removeItem(`competitors-${c.id}`)
        localStorage.removeItem(`matches-${c.id}`)
      })
      localStorage.removeItem(`categories-${id}`)
    }

    const updated = tournaments.filter(t => t.id !== id)
    setTournaments(updated)
    localStorage.setItem('tournaments', JSON.stringify(updated))
    setDeleteConfirm(null)
  }

  const handleStatusChange = (id, status) => {
    const updated = tournaments.map(t => (t.id === id ? { ...t, status } : t))
    setTournaments(updated)
    localStorage.setItem('tournaments', JSON.stringify(updated))
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Admin Dashboard</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Manage tournaments</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Tournaments ({tournaments.length})</Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpenCreate}
          >
            New Tournament
          </Button>
        </Box>

        {tournaments.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider' }}>
            <Typography color="text.secondary">No tournaments yet</Typography>
            <Typography variant="caption" color="text.secondary">Click "New Tournament" to create one</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Template</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tournaments.map((t) => (
                  <TableRow key={t.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>{t.name}</TableCell>
                    <TableCell>{t.location}</TableCell>
                    <TableCell>{new Date(t.date).toLocaleDateString()}</TableCell>
                    <TableCell>{t.template === 'kata' ? 'Kata (Form)' : 'Kumite (Combat)'}</TableCell>
                    <TableCell>
                      <Select
                        value={t.status}
                        onChange={(e) => handleStatusChange(t.id, e.target.value)}
                        size="small"
                        variant="standard"
                        disableUnderline
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          borderRadius: 1,
                          px: 1,
                          bgcolor: t.status === 'draft' ? 'warning.light' : t.status === 'active' ? 'success.light' : 'info.light',
                          color: t.status === 'draft' ? 'warning.dark' : t.status === 'active' ? 'success.dark' : 'info.dark',
                          '& .MuiSelect-select': { py: 0.5 },
                          '& .MuiSvgIcon-root': { color: 'inherit' },
                        }}
                      >
                        <MenuItem value="draft">Draft</MenuItem>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="completed">Completed</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => navigate(`/admin/tournament/${t.id}`)}
                        title="View"
                        sx={{ mr: 1 }}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenEdit(t.id)}
                        title="Edit"
                        sx={{ mr: 1 }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteConfirm(t.id)}
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
          {editingId ? 'Edit Tournament' : 'Create Tournament'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box component="form" noValidate>
            <TextField
              fullWidth
              label="Tournament Name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.name}
              helperText={formik.errors.name || ' '}
              margin="normal"
              placeholder="E.g., Spring Championship"
            />

            <TextField
              fullWidth
              label="Location"
              name="location"
              value={formik.values.location}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={!!formik.errors.location}
              helperText={formik.errors.location || ' '}
              margin="normal"
              placeholder="E.g., New York"
            />

            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Tournament Date"
                value={formik.values.date}
                onChange={(newValue) => formik.setFieldValue('date', newValue)}
                onBlur={() => formik.setFieldTouched('date', true)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'normal',
                    error: !!formik.errors.date,
                    helperText: formik.errors.date || ' '
                  }
                }}
              />
            </LocalizationProvider>

            <FormControl fullWidth margin="normal" error={!!formik.errors.template}>
              <InputLabel>Scoring Template</InputLabel>
              <Select
                name="template"
                value={formik.values.template}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                label="Scoring Template"
              >
                <MenuItem value="kata">Kata (Form)</MenuItem>
                <MenuItem value="kumite">Kumite (Combat)</MenuItem>
              </Select>
              {formik.errors.template && <FormHelperText>{formik.errors.template}</FormHelperText>}
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button
            variant="contained"
            onClick={formik.handleSubmit}
          >
            {editingId ? 'Update Tournament' : 'Create Tournament'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Tournament?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete this tournament and all associated categories and matches. This cannot be undone.
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
