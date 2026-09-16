import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Box, AppBar, Toolbar, Typography, Button, Grid, Paper, Alert, Chip, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, IconButton } from '@mui/material'
import { Visibility } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'

export default function JudgeMatchList({ uid, profile }) {
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])

  useEffect(() => {
    let all = []
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      JSON.parse(stored).forEach(t => {
        if (isExpired(t.date)) return
        const catStored = localStorage.getItem(`categories-${t.id}`)
        if (catStored) {
          JSON.parse(catStored).forEach(cat => {
            const matchStored = localStorage.getItem(`matches-${cat.id}`)
            if (matchStored) {
              const ms = JSON.parse(matchStored)
              all = [...all, ...ms.map(m => ({ ...m, categoryId: cat.id, tournament: t.name, category: cat.name }))]
            }
          })
        }
      })
    }
    setMatches(all.filter(m => m.status === 'open'))
  }, [])

  const getCompetitor = (categoryId, id) => {
    const compStored = localStorage.getItem(`competitors-${categoryId}`)
    if (compStored) {
      return JSON.parse(compStored).find(c => c.id === id)
    }
    return null
  }

  const hasSubmitted = (matchId) => !!localStorage.getItem(`judge-${profile?.seat}-${matchId}`)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Judge Scoring</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Judge #{profile?.seat || '?'} • {matches.length} matches ready</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}>Matches Ready</Typography>
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

        <Typography variant="h6" mb={2}>Available Matches ({matches.length})</Typography>

        {matches.length === 0 ? (
          <Alert severity="info">No matches ready for scoring</Alert>
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
                  const submitted = hasSubmitted(m.id)
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
                        <Chip
                          label={submitted ? 'Scored' : 'Pending'}
                          size="small"
                          color={submitted ? 'success' : 'warning'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/judge/match/${m.id}`)}
                          title={submitted ? 'View / Edit Score' : 'Score Match'}
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
