import { Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Typography, Tooltip } from '@mui/material'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

/**
 * PRD point 19: one kata round as a score sheet. Every judge's score, the
 * final worked out by the tournament's method, and the place.
 */
export default function KataRoundTable({ round, showOrder = false, highlight = null }) {
  const seats = Array.from({ length: round.judges || 0 }, (_, i) => i + 1)
  const rows = showOrder ? [...round.rows].sort((a, b) => a.order - b.order) : round.rows
  const hasPenalty = round.rows.some((r) => r.penalty)
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{showOrder ? 'Order' : 'Place'}</TableCell>
            <TableCell>Player</TableCell>
            <TableCell>Club</TableCell>
            {seats.map((s) => <TableCell key={s} align="right">J{s}</TableCell>)}
            {hasPenalty && <TableCell align="right">Penalty</TableCell>}
            <TableCell align="right">Final</TableCell>
            {showOrder && <TableCell align="right">Place</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.playerId} selected={highlight === r.playerId}>
              <TableCell>{showOrder ? r.order : (r.rank ? `${round.name === 'Final' && MEDAL[r.rank] ? `${MEDAL[r.rank]} ` : ''}${r.rank}` : '—')}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.club || r.team || '—'}</TableCell>
              {seats.map((s) => (
                <Tooltip key={s} title={r.components?.[s] ? `Technical ${r.components[s].technical} · Athletic ${r.components[s].athletic}` : ''}>
                  <TableCell align="right">
                    {r.bySeat?.[s] != null ? r.bySeat[s].toFixed(round.precision ?? 1) : '·'}
                  </TableCell>
                </Tooltip>
              ))}
              {hasPenalty && <Tooltip title={r.penaltyReason || ''}><TableCell align="right">{r.penalty ? `−${r.penalty}` : ''}</TableCell></Tooltip>}
              <TableCell align="right">
                <b>{r.final != null ? r.final.toFixed(2) : '—'}</b>
                {r.tieReason && <Typography variant="caption" color="text.secondary" component="div">{r.tieReason}</Typography>}
              </TableCell>
              {showOrder && <TableCell align="right">{r.rank ?? '—'}</TableCell>}
            </TableRow>
          ))}
          {!rows.length && <TableRow><TableCell colSpan={seats.length + 5}><Typography color="text.secondary">No performers.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
