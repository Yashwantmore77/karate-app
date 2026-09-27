import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Box, Toolbar, Typography, Button, Grid, Paper, Alert, Chip, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, IconButton } from '@mui/material'
import { Visibility } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { competitors as competitorStore } from '../../data/domain'
import { collectMatches } from '../../data/domain/tree'

export default function JudgeMatchList({ uid, profile }) {
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  // Competitors are resolved up front and held by id: the table renders a name
  // per side, and a read per cell cannot be done once reads are asynchronous.
  const [competitorsById, setCompetitorsById] = useState({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const open = (await collectMatches({ skipExpired: true }))
        .filter((m) => m.status === 'open')

      const categoryIds = [...new Set(open.map((m) => m.categoryId))]
      const rosters = await Promise.all(categoryIds.map((id) => competitorStore.list(id)))

      if (!alive) return
      setMatches(open)
      setCompetitorsById(Object.fromEntries(rosters.flat().map((c) => [c.id, c])))
    })()
    return () => { alive = false }
  }, [])

  const getCompetitor = (_categoryId, id) => competitorsById[id] || null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Judge</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Judge #{profile?.seat || '?'} • {matches.length} matches live</Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}>Matches Live</Typography>
              <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 700, mt: 1 }}>{matches.length}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}>Your Seat</Typography>
              <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 700, mt: 1 }}>#{profile?.seat || '?'}</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Typography variant="h6" mb={2}>Live Matches ({matches.length})</Typography>

        {matches.length === 0 ? (
          <Alert severity="info">No matches are open right now</Alert>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Tournament / Category</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Red</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>vs</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Blue</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m) => {
                  const red = getCompetitor(m.categoryId, m.redId)
                  const blue = getCompetitor(m.categoryId, m.blueId)
                  return (
                    <TableRow key={m.id} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.category}</Typography>
                        <Typography variant="caption" color="text.secondary">{m.tournament}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ p: 1, bgcolor: 'error.light', borderRadius: 1, textAlign: 'center' }}>
                          <Typography variant="subtitle2" sx={{ color: 'error.dark', fontWeight: 600 }}>#{red?.bib}</Typography>
                          <Typography variant="body2" sx={{ color: 'error.dark' }}>{red?.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>vs</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ p: 1, bgcolor: 'info.light', borderRadius: 1, textAlign: 'center' }}>
                          <Typography variant="subtitle2" sx={{ color: 'info.dark', fontWeight: 600 }}>#{blue?.bib}</Typography>
                          <Typography variant="body2" sx={{ color: 'info.dark' }}>{blue?.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={m.status} size="small" color="success" />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/judge/match/${m.id}`)}
                          title="Watch Match"
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </Box>
  )
}
