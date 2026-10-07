import { useEffect, useState } from 'react'
import { Container, Typography, Button, Paper, Stack, Alert } from '@mui/material'
import { CloudDownload } from '@mui/icons-material'
import { request } from '../../data/http'
import { apiUrl, getToken } from '../../data/session'
import DataTable from '../../components/tms/DataTable'
import useAction from '../../components/tms/useAction'
import { useLoading } from '../../components/Loader'
import { humanize } from '../../components/tms/StatusBadge'

/**
 * PRD v1 §22-23 for the super admin: the installation-wide audit trail
 * (sign-ins and sign-outs, accounts and roles, organisations, rulesets,
 * backups) and a full backup download.
 */
export default function AdminSystem({ profile }) {
  const action = useAction()
  const [paged, setPaged] = useState({ rows: [], total: 0, page: 0, pageSize: 25 })
  const [query, setQuery] = useState({ page: 0, pageSize: 25, q: '' })
  const { loading, refreshing, wrap } = useLoading()
  const load = () => wrap(request(`/system/audit?${new URLSearchParams({ page: query.page + 1, limit: query.pageSize, ...(query.q ? { q: query.q } : {}) })}`)
    .then((r) => setPaged({ rows: r.audit, total: r.total, page: r.page - 1, pageSize: r.limit })))
  useEffect(() => { load() }, [JSON.stringify(query)])

  const backup = () => action.run(async () => {
    const res = await fetch(apiUrl('/system/backup'), { headers: { authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw Object.assign(new Error('backup'), { code: res.status === 403 ? 'forbidden' : 'backup_failed' })
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `kumite-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    load()
  }, 'Backup downloaded')

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>System</Typography>
      {profile?.role === 'super_admin' && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h3" gutterBottom>Backup</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Every collection, accounts included (passwords stay hashed), as one JSON file. Restore it with <code>npm run restore -- file.json</code> on the server;
            schedule <code>npm run backup -- file.json</code> for automatic backups.
          </Typography>
          <Stack direction="row" spacing={1}><Button variant="contained" startIcon={<CloudDownload />} onClick={backup} disabled={action.busy}>Download backup</Button></Stack>
        </Paper>
      )}
      <Typography variant="h3" gutterBottom>Audit trail (outside tournaments)</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>Each tournament&apos;s own changes are on its Audit log tab.</Alert>
      <DataTable rows={paged.rows} loading={loading} refreshing={refreshing}
        server={{ ...paged, onChange: (next) => setQuery((q) => ({ ...q, ...next })) }}
        exportName="system-audit" exportTitle="System audit" searchPlaceholder="Search action, account, reason"
        empty="Nothing recorded yet."
        columns={[
          { key: 'at', label: 'When', render: (a) => new Date(a.at).toLocaleString() },
          { key: 'action', label: 'Action', render: (a) => humanize(String(a.action).replace(/\./g, ' ')) },
          { key: 'actorId', label: 'By', render: (a) => [a.actorRole, a.actorId].filter(Boolean).join(' · ') || '—' },
          { key: 'entityId', label: 'About', render: (a) => [a.entity, a.entityId].filter(Boolean).join(' ') || '—' },
          { key: 'reason', label: 'Reason', render: (a) => a.reason || '—' },
          { key: 'ip', label: 'IP', value: (a) => a.ip || a.meta?.ip, render: (a) => a.ip || a.meta?.ip || '—' },
        ]} />
      {action.feedback}
    </Container>
  )
}
