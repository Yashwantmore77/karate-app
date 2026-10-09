import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import {
  Container, Box, Toolbar, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Paper, Table, TableContainer, TableHead, TableBody, TableRow,
  TableCell, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Stack, Chip,
  Alert, FormHelperText,
} from '@mui/material'
import { ArrowBack, Edit, Delete, Add } from '@mui/icons-material'
import { TableSearch, TablePager, NoResults } from '../../components/TableToolbar'
import { usePagedList } from '../../components/usePagedList'
import PageBar from '../../components/PageBar'
import * as organizations from '../../data/organizations'
import { ROLE_LABEL } from '@kumite/shared/permissions.js'
import * as users from '../../data/users'
import { tournaments as tournamentStore } from '../../data/domain'
import { PageLoader } from '../../components/Loader'
import { HelpTitle } from '../../components/help/InfoTip'
import { describeError } from '../../data/tms'

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
const messageFor = (err) => MESSAGES[err?.code] || (err?.code && err.code !== 'error' ? describeError(err) : 'Something went wrong. Try again.')

export default function AdminUserList({ uid }) {
  const navigate = useNavigate()
  const [writeError, setWriteError] = useState(null)
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const {
    rows: accounts, total, page, limit, loading, error: loadError,
    search, setSearch, setPage, refresh, reset,
  } = usePagedList(
    useCallback((options) => users.page(options), [])
  )

  const editing = editingId ? accounts.find((a) => a.uid === editingId) : null
  // A failed read and a failed write are both worth showing, and only one
  // can be on screen at a time.
  const error = writeError || (loadError ? messageFor(loadError) : null)
  const setError = setWriteError

  // PRD section 4: which tournaments an account may work.
  const [allTournaments, setAllTournaments] = useState([])
  useEffect(() => { tournamentStore.list().then(setAllTournaments).catch(() => {}) }, [])
  const tournamentName = (id) => allTournaments.find((t) => t.id === id)?.name || id
  // PRD point 33: a super admin places accounts in organisations. Anyone else
  // is refused the list, and their accounts join their own organisation.
  const [orgs, setOrgs] = useState([])
  useEffect(() => { organizations.list().then(setOrgs).catch(() => setOrgs([])) }, [])
  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '—'

  const formik = useFormik({
    initialValues: {
      email: editing?.email || '',
      password: '',
      role: editing?.role || 'judge',
      seat: editing?.seat ?? '',
      tournamentIds: editing?.tournamentIds || [],
      organizationId: editing?.organizationId || '',
      tournamentRoles: Object.entries(editing?.tournamentRoles || {}).map(([tournamentId, role]) => ({ tournamentId, role })),
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
      // Sent only when changed, so saving an account never rewrites its access.
      if (JSON.stringify(values.tournamentIds) !== JSON.stringify(editing?.tournamentIds || [])) fields.tournamentIds = values.tournamentIds
      if (values.password) fields.password = values.password
      // PRD v1 §4: a different role inside particular tournaments.
      const scoped = Object.fromEntries(values.tournamentRoles.filter((r) => r.tournamentId && r.role).map((r) => [r.tournamentId, r.role]))
      if (JSON.stringify(scoped) !== JSON.stringify(editing?.tournamentRoles || {})) fields.tournamentRoles = scoped
      if (orgs.length && values.organizationId !== (editing?.organizationId || '')) fields.organizationId = values.organizationId || null

      try {
        if (editingId) {
          await users.update(editingId, fields)
          await refresh()
        } else {
          await users.create(fields)
          await reset()
        }
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
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <IconButton color="inherit" aria-label="Back" onClick={() => navigate('/admin')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <HelpTitle id="admin.accounts" variant="h6">Accounts</HelpTitle>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Referees and judges who can sign in
            </Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <>
          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

          <Stack direction="row" spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
            <TableSearch value={search} onChange={setSearch} placeholder="Search email or role" />
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => { setEditingId(null); setOpenModal(true) }}
            >
              New account
            </Button>
          </Stack>

          {loading ? <PageLoader label="Loading accounts…" /> : accounts.length === 0 ? (
            <Paper>
              <NoResults query={search} noun="accounts" />
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Seat</TableCell>
                    <TableCell>Tournaments</TableCell>
                    {orgs.length > 0 && <TableCell>Organisation</TableCell>}
                    <TableCell>2FA</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.uid}>
                      <TableCell>{account.email}</TableCell>
                      <TableCell>
                        <Chip label={account.role} size="small" color={roleColour(account.role)} />
                        {Object.keys(account.tournamentRoles || {}).length > 0 && <Chip size="small" variant="outlined" sx={{ ml: 0.5 }} label={`+${Object.keys(account.tournamentRoles).length} event role${Object.keys(account.tournamentRoles).length > 1 ? 's' : ''}`} />}
                      </TableCell>
                      <TableCell>{account.seat ?? '—'}</TableCell>
                      <TableCell>{account.tournamentIds?.length ? account.tournamentIds.map(tournamentName).join(', ') : 'All'}</TableCell>
                      {orgs.length > 0 && <TableCell>{account.organizationId ? orgName(account.organizationId) : 'None (all)'}</TableCell>}
                      <TableCell>{account.twoFactorEnabled ? '✓ On' : 'Off'}</TableCell>
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
              <TablePager page={page} limit={limit} total={total} onPageChange={setPage} />
            </TableContainer>
          )}
        </>
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
                  <MenuItem key={role} value={role}>{ROLE_LABEL[role] || role}</MenuItem>
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
            <TextField
              select fullWidth margin="normal" label="Tournaments this account may work"
              value={formik.values.tournamentIds}
              onChange={(e) => formik.setFieldValue('tournamentIds', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              slotProps={{ select: { multiple: true, renderValue: (ids) => (ids.length ? ids.map(tournamentName).join(', ') : 'All tournaments') }, inputLabel: { shrink: true } }}
              helperText="Leave empty for all tournaments. A super admin always sees all."
            >
              {allTournaments.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Role in particular tournaments</Typography>
            <Typography variant="body2" color="text.secondary">e.g. a referee who is the weigh-in officer at one event. Elsewhere the account keeps the role above.</Typography>
            {formik.values.tournamentRoles.map((row, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                <TextField select size="small" label="Tournament" sx={{ flex: 2 }} value={row.tournamentId}
                  onChange={(e) => formik.setFieldValue('tournamentRoles', formik.values.tournamentRoles.map((r, j) => (j === i ? { ...r, tournamentId: e.target.value } : r)))}>
                  {allTournaments.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Role there" sx={{ flex: 1.5 }} value={row.role}
                  onChange={(e) => formik.setFieldValue('tournamentRoles', formik.values.tournamentRoles.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))}>
                  {users.TOURNAMENT_ROLES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r] || r}</MenuItem>)}
                </TextField>
                <Button size="small" onClick={() => formik.setFieldValue('tournamentRoles', formik.values.tournamentRoles.filter((_, j) => j !== i))}>Remove</Button>
              </Box>
            ))}
            <Button size="small" sx={{ mt: 1 }} onClick={() => formik.setFieldValue('tournamentRoles', [...formik.values.tournamentRoles, { tournamentId: '', role: 'viewer' }])}>Add tournament role</Button>
            {orgs.length > 0 && (
              <TextField select fullWidth margin="normal" label="Organisation" value={formik.values.organizationId}
                onChange={(e) => formik.setFieldValue('organizationId', e.target.value)}
                helperText="An account in an organisation sees only that organisation's tournaments.">
                <MenuItem value="">None — sees every tournament</MenuItem>
                {orgs.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
              </TextField>
            )}
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
