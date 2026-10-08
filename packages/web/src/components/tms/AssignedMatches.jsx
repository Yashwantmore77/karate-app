import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paper, Typography, List, ListItemButton, ListItemText, Box } from '@mui/material'
import { boutOutcome } from '@kumite/shared/results.js'
import { tournaments as tournamentStore } from '../../data/domain'
import { tms } from '../../data/tms'
import StatusBadge from './StatusBadge'
import { PageLoader } from '../Loader'

/**
 * PRD sections 3.5, 3.6 and 53: the matches a referee or judge has been put
 * on (section 37), across every tournament, next ones first.
 */
export default function AssignedMatches({ uid, field = 'refereeId', basePath }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const out = []
      for (const t of await tournamentStore.list().catch(() => [])) {
        const matches = await tms.matches(t.id).catch(() => [])
        for (const m of matches) {
          const mine = field === 'judgeIds' ? (m.judgeIds || []).includes(uid) : m.refereeId === uid
          if (mine) out.push({ ...m, tournamentName: t.name })
        }
      }
      if (alive) setRows(out)
    })()
    return () => { alive = false }
  }, [uid, field])

  // Every tournament's bouts are read, which can take a moment.
  if (!rows) return <Paper sx={{ p: 2, mb: 3 }}><PageLoader label="Finding the bouts assigned to you…" minHeight={80} /></Paper>
  if (!rows.length) return null
  const pending = rows.filter((m) => !boutOutcome(m) && m.status !== 'cancelled')
  const done = rows.length - pending.length

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6">Assigned to me</Typography>
      <Typography variant="body2" color="text.secondary">{pending.length} to fight · {done} finished</Typography>
      <List dense>
        {pending.slice(0, 20).map((m) => (
          <ListItemButton key={m.id} onClick={() => navigate(`${basePath}/match/${m.id}`)}>
            <ListItemText
              primary={`${m.matchNumber} · Mat ${m.mat || '—'} · ${m.categoryName}`}
              secondary={`AKA ${m.akaName || 'TBD'} vs AO ${m.aoName || 'TBD'} · ${m.tournamentName}${m.scheduledAt ? ` · ${new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}`} />
            <Box sx={{ ml: 1 }}><StatusBadge status={m.status} /></Box>
          </ListItemButton>
        ))}
      </List>
    </Paper>
  )
}
