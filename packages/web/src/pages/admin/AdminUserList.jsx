import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import {
  Container, Box, AppBar, Toolbar, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Paper, Table, TableContainer, TableHead, TableBody, TableRow,
  TableCell, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Stack, Chip,
  Alert, FormHelperText,
} from '@mui/material'
import { ArrowBack, Edit, Delete, Add } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import * as users from '../../data/users'

// Only on create: an existing account keeps its password unless a new one is
// typed, so the field is optional when editing.
const schemaFor = (editing) => Yup.object({
  email: Yup.string().email('Enter a valid email address').required('Email required'),
  password: editing
    ? Yup.string().min(8, 'Password must be at least 8 characters')
    : Yup.string().min(8, 'Password must be at least 8 characters').required('Password required'),
  role: Yup.string().oneOf(users.ROLES).required('Role required'),
  seat: Yup.number().integer('Seat must be a whole number').min(1, 'Seat must be 1 or more').nullable(),
})

// The server answers with a code; these are the ones a person can act on.
const MESSAGES = {
  email_taken: 'That address already has an account.',
  invalid_email: 'Enter a valid email address.',
  invalid_password: 'Password must be at least 8 characters.',
  invalid_role: 'Pick one of the available roles.',
  invalid_seat: 'Seat must be a whole number of 1 or more.',
  cannot_delete_self: 'You cannot delete the account you are signed in with.',
  not_found: 'That account no longer exists.',
  forbidden: 'Only an administrator can manage accounts.',
  unauthorized: 'Your session has expired. Sign in again.',
}
const messageFor = (err) => MESSAGES[err?.code] || 'Something went wrong. Try again.'

export default function AdminUserList({ uid }) {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const available = users.isAvailable()
  const editing = editingId ? accounts.find((a) => a.uid === editingId) : null

  const refresh = async () => {
    try {
      setAccounts(await users.list())
      setError(null)
    } catch (err) {
      setError(messageFor(err))
    }
  }

  useEffect(() => {
    if (!available) {
      setLoading(false)
      return
    }
    let alive = true
    users.list()
      .then((rows) => { if (alive) setAccounts(rows) })
      .catch((err) => { if (alive) setError(messageFor(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [available])

  const formik = useFormik({
    initialValues: {
      email: editing?.email || '',
      password: '',
      role: editing?.role || 'judge',
      seat: editing?.seat ?? '',
    },
    enableReinitialize: true,
    validationSchema: schemaFor(!!editingId),
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: async (values) => {
      // An empty seat box means "no seat", which the API expresses as null so it
      // can tell clearing one from leaving it alone.
      const seat = values.seat === '' ? null : Number(values.seat)
      const fields = { email: values.email.trim(), role: values.role, seat }
      if (values.password) fields.password = values.password

      try {
        if (editingId) await users.update(editingId, fields)
        else await users.create(fields)
        await refresh()
        closeModal()
      } catch (err) {
        setError(messageFor(err))
      }
    },
  })

  const closeModal = () => {
    setOpenModal(false)
    setEditingId(null)
    formik.resetForm()
  }

  const handleDelete = async (id) => {
    try {
      await users.remove(id)
      await refresh()
    } catch (err) {
      setError(messageFor(err))
    }
    setDeleteConfirm(null)
  }

  const roleColour = (role) =>
    role === 'admin' ? 'primary' : role === 'referee' ? 'secondary' : 'default'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/admin')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Accounts</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Referees and judges who can sign in
            </Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        {!available ? (
          <Alert severity="info">
            Accounts live on the server. This build is running on local storage only,
            where sign-in uses the built-in roster and there is nothing to manage.
          </Alert>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 3 }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => { setEditingId(null); setOpenModal(true) }}
              >
                New account
              </Button>
            </Stack>

            {loading ? null : accounts.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No accounts yet</Typography>
              </Paper>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Seat</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.uid}>
                        <TableCell>{account.email}</TableCell>
                        <TableCell>
                          <Chip label={account.role} size="small" color={roleColour(account.role)} />
                        </TableCell>
                        <TableCell>{account.seat ?? '—'}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            aria-label={`Edit ${account.email}`}
                            onClick={() => { setEditingId(account.uid); setOpenModal(true) }}
                          >
                            <Edit />
                          </IconButton>
                          {/* Deleting the signed-in account is refused by the
                              server; disabling it here says so before the click. */}
                          <IconButton
                            aria-label={`Delete ${account.email}`}
                            disabled={account.uid === uid}
                            title={account.uid === uid ? 'You cannot delete your own account' : undefined}
                            onClick={() => setDeleteConfirm(account)}
                          >
                            <Delete />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Container>

      <Dialog open={openModal} onClose={closeModal} fullWidth maxWidth="sm">
        <form onSubmit={formik.handleSubmit} noValidate>
          <DialogTitle>{editingId ? 'Edit account' : 'Create account'}</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth margin="normal" label="Email" name="email" type="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              error={!!formik.errors.email}
              helperText={formik.errors.email || ' '}
            />
            <TextField
              fullWidth margin="normal" name="password" type="password"
              label={editingId ? 'New password (leave blank to keep)' : 'Password'}
              value={formik.values.password}
              onChange={formik.handleChange}
              error={!!formik.errors.password}
              helperText={formik.errors.password || ' '}
            />
            <FormControl fullWidth margin="normal" error={!!formik.errors.role}>
              <InputLabel id="role-label">Role</InputLabel>
              <Select
                labelId="role-label" label="Role" name="role"
                value={formik.values.role}
                onChange={formik.handleChange}
              >
                {users.ROLES.map((role) => (
                  <MenuItem key={role} value={role}>{role}</MenuItem>
                ))}
              </Select>
              {formik.errors.role && <FormHelperText>{formik.errors.role}</FormHelperText>}
            </FormControl>
            <TextField
              fullWidth margin="normal" label="Seat (judges only)" name="seat"
              value={formik.values.seat}
              onChange={formik.handleChange}
              error={!!formik.errors.seat}
              helperText={formik.errors.seat || 'Leave blank if this account has no seat'}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeModal}>Cancel</Button>
            <Button type="submit" variant="contained">
              {editingId ? 'Save account' : 'Create account'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete account?</DialogTitle>
        <DialogContent>
          <Typography>
            {deleteConfirm?.email} will no longer be able to sign in. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleDelete(deleteConfirm.uid)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
