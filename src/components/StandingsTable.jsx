import { Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Paper, Typography, Box, Chip } from '@mui/material'
import { computeStandings } from '../utils/standings'

export default function StandingsTable({ competitors, matches }) {
  const standings = computeStandings(competitors, matches)
  const anyCompleted = matches.some((m) => m.status === 'completed')

  if (!anyCompleted) {
    return (
      <Typography variant="body2" color="text.secondary">
        Standings will appear once matches are completed.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: 'action.hover' }}>
            <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Competitor</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>Played</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>W</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>L</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>T</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>Score Diff</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {standings.map((row, idx) => (
            <TableRow key={row.competitor.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
              <TableCell>
                {idx === 0 && row.wins > 0 ? <Chip label="1" size="small" color="success" /> : idx + 1}
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>#{row.competitor.bib}</Typography>
                  <Typography variant="body2">{row.competitor.name}</Typography>
                </Box>
              </TableCell>
              <TableCell align="center">{row.played}</TableCell>
              <TableCell align="center">{row.wins}</TableCell>
              <TableCell align="center">{row.losses}</TableCell>
              <TableCell align="center">{row.ties}</TableCell>
              <TableCell align="center">{(row.scoreFor - row.scoreAgainst).toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
