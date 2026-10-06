import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import dayjs from 'dayjs'
import { Container, Box, Toolbar, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Grid, Paper, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { Edit, Delete, Visibility, Add } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { TableSearch, TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import { tournaments as tournamentStore } from '../../data/domain'
import { formatDate } from '../../utils/dateUtils'

// The server applies these when a body leaves them out; the form shows the
// same numbers so a new tournament is not a surprise.
const DEFAULT_JUDGE_COUNT = 4
const DEFAULT_SLOT_MINUTES = 15

const validationSchema = Yup.object({
  name: Yup.string().required('Tournament name required').min(3, 'Name too short'),
  location: Yup.string().required('Location required'),
  date: Yup.date().nullable().required('Date required'),
  template: Yup.string().required('Template required'),
  // Bounded the same way the API bounds them, so the form refuses what the
  // server would refuse rather than failing after a round trip.
  judgeCount: Yup.number()
    .typeError('Judges must be a number')
    .integer('Whole judges only')
    .min(1, 'At least one judge')
    .max(8, 'At most eight judges')
    .required('Panel size required'),
  slotMinutes: Yup.number()
    .typeError('Slot length must be a number')
    .integer('Whole minutes only')
    .min(1, 'At least one minute')
    .max(240, 'At most four hours')
    .required('Slot length required'),
})

export default function AdminTournamentList({ uid }) {
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const {
    rows: tournaments, total, page, limit, search, setSearch, setPage, refresh, reset,
  } = usePagedList(useCallback((options) => tournamentStore.page(options), []))

  const editingTournament = editingId ? tournaments.find(t => t.id === editingId) : null

  const formik = useFormik({
    initialValues: {
      name: editingTournament?.name || '',
      location: editingTournament?.location || '',
      date: editingTournament?.date ? dayjs(editingTournament.date) : null,
      template: editingTournament?.template || 'kata',
      judgeCount: editingTournament?.judgeCount ?? DEFAULT_JUDGE_COUNT,
      slotMinutes: editingTournament?.slotMinutes ?? DEFAULT_SLOT_MINUTES,
    },
    enableReinitialize: true,
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      // Only the fields a tournament actually owns: id, createdAt and status are
      // the store's to set, and the API rejects a body that tries to choose them.
      const fields = {
        name: values.name,
        location: values.location,
        date: formatDate(values.date),
        template: values.template,
        // Sent as numbers: the API types these strictly, and a text input
        // hands back a string.
        judgeCount: Number(values.judgeCount),
        slotMinutes: Number(values.slotMinutes),
      }
      if (editingId) {
        await tournamentStore.update(editingId, fields)
        await refresh()
      } else {
        await tournamentStore.create(fields)
        // A new tournament belongs on the first page, not wherever we were.
        await reset()
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

  const handleDelete = async (id) => {
    // The store cascades to categories, competitors and matches.
    await tournamentStore.remove(id)
    await refresh()
    setDeleteConfirm(null)
  }

  const handleStatusChange = async (id, status) => {
    await tournamentStore.update(id, { status })
    await refresh()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Admin Dashboard</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Manage tournaments</Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* The count is the total behind the search, not the rows on screen. */}
          <Typography variant="h6">Tournaments ({total})</Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search name or location"
            />
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleOpenCreate}
            >
              New Tournament
            </Button>
          </Box>
        </Box>

        {tournaments.length === 0 ? (
          <Paper elevation={0} sx={{ border: '1px dashed', borderColor: 'divider' }}>
            <NoResults query={search} noun="tournaments" />
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
            <TablePager page={page} limit={limit} total={total} onPageChange={setPage} />
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

            {/* These two decide what "at the same time" means here: the slot
                length is the window a bout holds everyone on it for, which is
                what the double-booking check measures. */}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={6}>
                <TextField
                  fullWidth
                  type="number"
                  name="judgeCount"
                  label="Judges on a panel"
                  value={formik.values.judgeCount}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={!!formik.errors.judgeCount}
                  helperText={formik.errors.judgeCount || 'Usually 4'}
                  inputProps={{ min: 1, max: 8 }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  type="number"
                  name="slotMinutes"
                  label="Slot length (minutes)"
                  value={formik.values.slotMinutes}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={!!formik.errors.slotMinutes}
                  helperText={formik.errors.slotMinutes || 'How long a bout holds its people'}
                  inputProps={{ min: 1, max: 240 }}
                />
              </Grid>
            </Grid>
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
