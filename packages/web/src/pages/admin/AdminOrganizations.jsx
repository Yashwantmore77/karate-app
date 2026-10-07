import { useEffect, useState } from 'react'
import {
  Container, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Switch,
  FormControlLabel, IconButton, Alert,
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import * as organizations from '../../data/organizations'
import DataTable from '../../components/tms/DataTable'
import StatusBadge from '../../components/tms/StatusBadge'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import useAction from '../../components/tms/useAction'
import { useLoading } from '../../components/Loader'

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/**
 * PRD point 33: many associations on one installation. Each organisation has
 * its own tournaments and accounts; an organisation's admins see nothing of
 * the others. Its accounts are created on the Accounts page.
 */
export default function AdminOrganizations() {
  const action = useAction()
  const [rows, setRows] = useState([])
  const { loading, refreshing, wrap } = useLoading()
  const [edit, setEdit] = useState(null)
  const [removing, setRemoving] = useState(null)

  const load = () => wrap(organizations.list().then(setRows).catch(() => setRows([])))
  useEffect(() => { load() }, [])

  const save = async () => {
    const { id, tournaments, accounts, createdAt, updatedAt, ...doc } = edit
    const body = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== ''))
    const ok = await action.run(() => (id ? organizations.update(id, body) : organizations.create(body)), 'Organisation saved')
    if (ok) { setEdit(null); load() }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>Organisations</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Each organisation runs its own tournaments. Give an organisation an admin from the Accounts page; tournaments that admin creates belong to the organisation, and the public site can list them at /tournaments?org=short-name.
      </Alert>
      <DataTable rows={rows} loading={loading} refreshing={refreshing} exportName="organisations" empty="No organisations yet."
        toolbar={<Button variant="contained" startIcon={<Add />} onClick={() => setEdit({ name: '', slug: '', contactEmail: '', contactMobile: '', country: '', active: true })}>Add organisation</Button>}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'slug', label: 'Short name' },
          { key: 'contactEmail', label: 'Email', render: (o) => o.contactEmail || '—' },
          { key: 'tournaments', label: 'Tournaments' },
          { key: 'accounts', label: 'Accounts' },
          { key: 'active', label: 'Status', value: (o) => (o.active !== false ? 'Active' : 'Inactive'), render: (o) => <StatusBadge status={o.active !== false ? 'APPROVED' : 'DRAFT'} label={o.active !== false ? 'Active' : 'Inactive'} /> },
          { key: 'actions', label: '', sortable: false, render: (o) => (
            <Stack direction="row">
              <IconButton size="small" aria-label="Edit" onClick={() => setEdit({ ...o })}><Edit fontSize="small" /></IconButton>
              <IconButton size="small" aria-label="Delete" disabled={o.tournaments > 0 || o.accounts > 0} onClick={() => setRemoving(o)}><Delete fontSize="small" /></IconButton>
            </Stack>
          ) },
        ]} />

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{edit?.id ? 'Edit' : 'Add'} organisation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField required label="Name" value={edit?.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value, ...(edit.id ? {} : { slug: slugify(e.target.value) }) })} />
            <TextField required label="Short name" helperText="Lower-case letters, numbers and dashes" value={edit?.slug || ''} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />
            <TextField label="Contact email" value={edit?.contactEmail || ''} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} />
            <TextField label="Contact mobile" value={edit?.contactMobile || ''} onChange={(e) => setEdit({ ...edit, contactMobile: e.target.value })} />
            <TextField label="Country" value={edit?.country || ''} onChange={(e) => setEdit({ ...edit, country: e.target.value })} />
            <FormControlLabel control={<Switch checked={edit?.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />} label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={!edit?.name?.trim() || !edit?.slug || action.busy} onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!removing} danger title={`Delete ${removing?.name}?`} confirmLabel="Delete" onClose={() => setRemoving(null)}
        onConfirm={async () => { const o = removing; setRemoving(null); await action.run(() => organizations.remove(o.id), 'Organisation deleted'); load() }} />
      {action.feedback}
    </Container>
  )
}
