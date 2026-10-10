import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import dayjs from 'dayjs'
import { Container, Box, Alert, Toolbar, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel, Grid, Paper, FormHelperText, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { Edit, Delete, Visibility, Add } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { TableSearch, TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import { tournaments as tournamentStore } from '../../data/domain'
import { formatDate } from '../../utils/dateUtils'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { describeError } from '../../data/tms'

// What the tournament holds: decides which screens it needs (a Kumite-only
// event has no kata panel, a Kata-only one no weigh-in). Panel size and slot
// length keep the server's defaults and are tuned later in Settings.
export const TOURNAMENT_TYPES = [
  ['kata_kumite', 'Kata + Kumite'],
  ['kumite', 'Kumite only'],
  ['kata', 'Kata only'],
]
export const typeLabel = (t) => (TOURNAMENT_TYPES.find(([v]) => v === (t.type || 'kata_kumite')) || TOURNAMENT_TYPES[0])[1]

const validationSchema = Yup.object({
  name: Yup.string().required('Tournament name required').min(3, 'Name too short'),
  location: Yup.string().required('Location required'),
  date: Yup.date().nullable().required('Date required'),
  type: Yup.string().oneOf(TOURNAMENT_TYPES.map(([v]) => v)).required('Tournament type required'),
})

/**
 * The tournament list, shared by the administrator and the tournament owner.
 *
 * An owner may run the tournaments it was given but not add or remove one, so
 * it gets the same table without those two actions. The server enforces the
 * same split (POST and DELETE /tournaments stay behind the admin gate); this
 * keeps a button from offering what the API would refuse.
 */
export default function AdminTournamentList({ uid, profile = null, basePath = '/admin' }) {
  const mayAddOrRemove = profile?.role !== 'tournament_owner'
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const {
    rows: tournaments, total, page, limit, search, setSearch, setPage, refresh, reset, loading,
  } = usePagedList(useCallback((options) => tournamentStore.page(options), []))

  const editingTournament = editingId ? tournaments.find(t => t.id === editingId) : null

  const formik = useFormik({
    initialValues: {
      name: editingTournament?.name || '',
      location: editingTournament?.location || '',
      date: editingTournament?.date ? dayjs(editingTournament.date) : null,
      // An older tournament with no type holds both events.
      type: editingTournament?.type || 'kata_kumite',
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
        type: values.type,
        // The scoring app's own field: kata scores by panel, everything else as bouts.
        template: values.type === 'kata' ? 'kata' : 'kumite',
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

  // The dashboard's "New tournament" quick action lands here with ?create=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('create') === '1') {
      handleOpenCreate()
      params.delete('create')
      window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
    }
  }, [])

  const handleOpenEdit = (id) => {
    setEditingId(id)
    setOpenModal(true)
  }

  const handleDelete = async (id) => {
    // The store cascades to categories, competitors and matches.
    try {
      await tournamentStore.remove(id)
      setDeleteError(null)
      await refresh()
    } catch (err) {
      setDeleteError(describeError(err))
    }
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
            <Typography variant="h6">{mayAddOrRemove ? 'Admin Dashboard' : 'My Tournaments'}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {mayAddOrRemove ? 'Manage tournaments' : 'The tournaments you have been given'}
            </Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        {deleteError && <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ mb: 2 }}>{deleteError}</Alert>}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* The count is the total behind the search, not the rows on screen. */}
          <HelpTitle id="admin.tournaments" variant="h6">Tournaments ({total})</HelpTitle>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search name or location"
            />
            {mayAddOrRemove && (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleOpenCreate}
              >
                New Tournament
              </Button>
            )}
          </Box>
        </Box>

        {loading && tournaments.length === 0 ? <PageLoader label="Loading tournaments…" /> : tournaments.length === 0 ? (
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
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
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
                    <TableCell>{typeLabel(t)}</TableCell>
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
                        onClick={() => navigate(`${basePath}/tournament/${t.id}/manage`)}
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
                      {mayAddOrRemove && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirm(t.id)}
                          title="Delete"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
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

            <FormControl fullWidth margin="normal" error={!!formik.errors.type}>
              <InputLabel>Tournament type</InputLabel>
              <Select name="type" value={formik.values.type} onChange={formik.handleChange} onBlur={formik.handleBlur} label="Tournament type">
                {TOURNAMENT_TYPES.map(([v, label]) => <MenuItem key={v} value={v}>{label}</MenuItem>)}
              </Select>
              <FormHelperText>{formik.errors.type || 'Categories, rules and everything else are set on the tournament screen after this.'}</FormHelperText>
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
