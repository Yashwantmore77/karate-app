import { useCallback, useEffect, useState } from 'react'
import { Typography, Box, Stack } from '@mui/material'
import { HelpTitle } from '../../components/help/InfoTip'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'
import { useLoading } from '../../components/Loader'

const show = (v) => (v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v))

/** Section 48: who changed what, from what, to what, when, and why. Paged on the server. */
export default function AuditTab({ tournament, version }) {
  const [result, setResult] = useState({ rows: [], total: 0, page: 0, pageSize: 25 })
  const [query, setQuery] = useState({ page: 0, pageSize: 25, q: '' })

  const { loading, refreshing, wrap } = useLoading()
  const load = useCallback(() => wrap(tms.auditPage(tournament.id, query).then(setResult)), [tournament.id, query, wrap])
  useEffect(() => { load() }, [load, version])

  return (
    <Stack spacing={1}>
    <HelpTitle id="audit.list" variant="h3">Audit log</HelpTitle>
    <DataTable rows={result.rows} loading={loading} refreshing={refreshing} searchPlaceholder="Search action, user, entity, reason" empty="Nothing recorded yet."
      server={{ ...result, onChange: (next) => setQuery((q) => ({ ...q, ...next })) }}
      columns={[
        { key: 'at', label: 'When', sortable: false, render: (a) => new Date(a.at).toLocaleString() },
        { key: 'actorId', label: 'User', sortable: false, render: (a) => <Box><Typography variant="body2">{a.actorId || '—'}</Typography><Typography variant="body2" color="text.secondary">{a.actorRole}</Typography></Box> },
        { key: 'action', label: 'Action', sortable: false },
        { key: 'entity', label: 'Entity', sortable: false, render: (a) => `${a.entity}${a.entityId ? ` ${String(a.entityId).slice(0, 10)}` : ''}` },
        { key: 'changes', label: 'Old → New', sortable: false, render: (a) => (
          <Box sx={{ maxWidth: 420 }}>
            {Object.entries(a.changes || {}).filter(([k]) => !['updatedAt', 'createdAt'].includes(k)).slice(0, 6).map(([k, c]) => (
              <Typography key={k} variant="body2" sx={{ wordBreak: 'break-word' }}><b>{k}</b>: {show(c.from)} → {show(c.to)}</Typography>
            ))}
          </Box>
        ) },
        { key: 'reason', label: 'Reason', sortable: false, render: (a) => a.reason || '—' },
        { key: 'ip', label: 'IP / device', sortable: false, render: (a) => (a.ip || a.userAgent ? `${a.ip || ''} ${a.userAgent ? a.userAgent.slice(0, 30) : ''}` : '—') },
      ]} />
    </Stack>
  )
}
