import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Box, Toolbar, Typography, Button, Paper, Table, TableContainer, TableHead, TableBody, TableRow, TableCell, Alert, Chip, IconButton, Autocomplete, TextField } from '@mui/material'
import { Visibility } from '@mui/icons-material'
import PageBar from '../../components/PageBar'
import { tournaments as tournamentStore, categories as categoryStore } from '../../data/domain'
import { isExpired } from '../../utils/dateUtils'
import AssignedMatches from '../../components/tms/AssignedMatches'

export default function RefereeCategoryList({ uid }) {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedTournamentId, setSelectedTournamentId] = useState('')

  useEffect(() => {
    let alive = true
    tournamentStore.list().then((rows) => {
      if (!alive) return
      setTournaments(rows)
      if (rows.length > 0 && !selectedTournamentId) {
        const firstActive = rows.find(t => !isExpired(t.date)) || rows[0]
        setSelectedTournamentId(firstActive.id)
      }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!selectedTournamentId) return
    let alive = true
    categoryStore.list(selectedTournamentId).then((rows) => {
      if (alive) setCategories(rows)
    })
    return () => { alive = false }
  }, [selectedTournamentId])

  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId)

  const isSelectedExpired = selectedTournament ? isExpired(selectedTournament.date) : false

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, bgcolor: 'background.default' }}>
      <PageBar>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Referee Dashboard</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {selectedTournament ? selectedTournament.name : 'Select a tournament'}
            </Typography>
          </Box>
        </Toolbar>
      </PageBar>

      <Container maxWidth="lg" sx={{ py: 4, flex: 1 }}>
        <AssignedMatches uid={uid} field="refereeId" basePath="/referee" />
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
