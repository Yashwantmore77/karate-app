import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Box, AppBar, Toolbar, Typography, Button, Paper, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Alert, Chip, IconButton, Autocomplete, TextField } from '@mui/material'
import { Visibility } from '@mui/icons-material'
import { signOut, auth } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'

export default function RefereeCategoryList({ uid }) {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedTournamentId, setSelectedTournamentId] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      const parsed = JSON.parse(stored)
      setTournaments(parsed)
      if (parsed.length > 0 && !selectedTournamentId) {
        const firstActive = parsed.find(t => !isExpired(t.date)) || parsed[0]
        setSelectedTournamentId(firstActive.id)
      }
    }
  }, [])

  useEffect(() => {
    if (selectedTournamentId) {
      const catStored = localStorage.getItem(`categories-${selectedTournamentId}`)
      if (catStored) setCategories(JSON.parse(catStored))
      else setCategories([])
    }
  }, [selectedTournamentId])

  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)

  const isSelectedExpired = selectedTournament ? isExpired(selectedTournament.date) : false

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Referee Dashboard</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {selectedTournament ? selectedTournament.name : 'Select a tournament'}
            </Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Autocomplete
            sx={{ minWidth: 350 }}
            options={tournaments}
            value={selectedTournament || null}
            onChange={(e, newValue) => setSelectedTournamentId(newValue ? newValue.id : '')}
            getOptionLabel={(t) => `${t.name} (${t.location})`}
            getOptionDisabled={(t) => isExpired(t.date)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField {...params} label="Select Tournament" placeholder="Type to search…" />
            )}
            renderOption={(props, t) => {
              const expired = isExpired(t.date)
              const { key, ...optionProps } = props
              return (
                <Box
                  component="li"
                  key={key}
                  {...optionProps}
                  sx={{
                    backgroundColor: expired ? 'error.light' : 'inherit',
                    '&.Mui-disabled': { opacity: 1 }
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: expired ? 'error.dark' : 'text.primary' }}>
                        {t.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: expired ? 'error.dark' : 'text.secondary' }}>
                        📍 {t.location} • 📅 {new Date(t.date).toLocaleDateString()}
                      </Typography>
                    </Box>
                    {expired && (
                      <Chip
                        label="EXPIRED"
                        size="small"
                        variant="filled"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          ml: 'auto',
                          bgcolor: 'error.main',
                          color: 'white',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      />
                    )}
                  </Box>
                </Box>
              )
            }}
          />

          {selectedTournament && isSelectedExpired && (
            <Chip
              label="⚠️ TOURNAMENT EXPIRED"
              color="error"
              variant="filled"
              sx={{ height: 40, fontWeight: 600 }}
            />
          )}
        </Box>

        {!selectedTournamentId ? (
          <Alert severity="info">Select a tournament to view categories</Alert>
        ) : isSelectedExpired ? (
          <Alert severity="warning">
            This tournament has expired ({new Date(selectedTournament.date).toLocaleDateString()}).
            You can view categories but cannot manage matches.
          </Alert>
        ) : categories.length === 0 ? (
          <Alert severity="info">No categories available in this tournament</Alert>
        ) : (
          <>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">Categories ({categories.length})</Typography>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Age Group</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Gender</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Division</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow
                      key={c.id}
                      sx={{
                        '&:hover': { backgroundColor: isSelectedExpired ? 'inherit' : 'action.hover' },
                        opacity: isSelectedExpired ? 0.6 : 1,
                        backgroundColor: isSelectedExpired ? 'error.light' : 'inherit'
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{c.name}</TableCell>
                      <TableCell>{c.ageGroup}</TableCell>
                      <TableCell>{c.gender}</TableCell>
                      <TableCell>{c.division}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/referee/category/${c.id}`)}
                          disabled={isSelectedExpired}
                          title={isSelectedExpired ? "Cannot manage expired tournament" : "View & Manage Matches"}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Container>
    </Box>
  )
}
