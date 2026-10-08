import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Typography, Grid, Card, CardActionArea, CardContent, Box, Button } from '@mui/material'
import { tms } from '../../data/tms'
import StatusBadge from '../../components/tms/StatusBadge'
import { PageLoader } from '../../components/Loader'

/** Section 54: the public home — every tournament past its draft. */
export default function PublicTournamentList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  // PRD point 33: /tournaments?org=short-name lists one organisation's tournaments.
  const org = new URLSearchParams(window.location.search).get('org') || undefined
  useEffect(() => { tms.public.list(org).then(setRows).catch(() => setRows([])) }, [org])
  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Typography variant="h1" sx={{ mb: 1 }}>Tournaments</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Draws, live matches, results and medal tallies.</Typography>
      {!rows && <PageLoader label="Loading tournaments…" />}
      {rows && !rows.length && <Typography color="text.secondary">No public tournaments yet.</Typography>}
      <Grid container spacing={2}>
        {(rows || []).map((t) => (
          <Grid key={t.id} size={{ xs: 12, sm: 6 }}>
            <Card><CardActionArea onClick={() => navigate(`/tournament/${t.slug || t.id}`)}>
              <CardContent>
                <Typography variant="h3">{t.name}</Typography>
                <Typography variant="body2" color="text.secondary">{[t.venue || t.location, t.startDate || t.date].filter(Boolean).join(' · ')}</Typography>
                <Box sx={{ mt: 1 }}><StatusBadge status={t.lifecycleStatus} /></Box>
              </CardContent>
            </CardActionArea></Card>
          </Grid>
        ))}
      </Grid>
      <Box sx={{ mt: 4 }}><Button onClick={() => navigate('/login')}>Officials sign in</Button></Box>
    </Container>
  )
}
