import { useEffect, useState } from 'react'
import { Typography, Box } from '@mui/material'
import { tms } from '../../data/tms'
import DataTable from '../../components/tms/DataTable'

const show = (v) => (v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v))

/** Section 48: who changed what, from what, to what, when, and why. */
export default function AuditTab({ tournament, version }) {
  const [rows, setRows] = useState([])
  useEffect(() => { tms.audit(tournament.id).then(setRows) }, [tournament.id, version])
  return (
    <DataTable rows={rows} searchPlaceholder="Search action, user, entity, reason" empty="Nothing recorded yet." columns={[
      { key: 'at', label: 'When', render: (a) => new Date(a.at).toLocaleString() },
      { key: 'actorId', label: 'User', render: (a) => <Box><Typography variant="body2">{a.actorId || '—'}</Typography><Typography variant="body2" color="text.secondary">{a.actorRole}</Typography></Box> },
      { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Entity', render: (a) => `${a.entity}${a.entityId ? ` ${String(a.entityId).slice(0, 10)}` : ''}` },
      { key: 'changes', label: 'Old → New', sortable: false, value: (a) => JSON.stringify(a.changes || ''), render: (a) => (
        <Box sx={{ maxWidth: 420 }}>
          {Object.entries(a.changes || {}).filter(([k]) => !['updatedAt', 'createdAt'].includes(k)).slice(0, 6).map(([k, c]) => (
            <Typography key={k} variant="body2" sx={{ wordBreak: 'break-word' }}><b>{k}</b>: {show(c.from)} → {show(c.to)}</Typography>
          ))}
        </Box>
      ) },
      { key: 'reason', label: 'Reason', render: (a) => a.reason || '—' },
      { key: 'ip', label: 'IP / device', render: (a) => (a.ip || a.userAgent ? `${a.ip || ''} ${a.userAgent ? a.userAgent.slice(0, 30) : ''}` : '—') },
    ]} />
  )
}
