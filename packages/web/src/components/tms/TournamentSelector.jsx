import { useEffect, useState } from 'react'
import { Container, Typography, Grid, Card, CardActionArea, CardContent, Box } from '@mui/material'
import { tournaments as tournamentStore } from '../../data/domain'
import StatusBadge from './StatusBadge'
import { PageLoader } from '../Loader'

/** Section 63.6's TournamentSelector: officers pick the event they are working. */
export default function TournamentSelector({ title = 'Choose a tournament', onPick }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { tournamentStore.list().then(setRows) }, [])
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h1" sx={{ mb: 3 }}>{title}</Typography>
      {!rows && <PageLoader label="Loading tournaments…" />}
      {rows && !rows.length && <Typography color="text.secondary">No tournaments yet.</Typography>}
      <Grid container spacing={2}>
        {(rows || []).map((t) => (
          <Grid key={t.id} size={{ xs: 12, sm: 6 }}>
            <Card><CardActionArea onClick={() => onPick(t)}>
              <CardContent>
                <Typography variant="h3">{t.name}</Typography>
                <Typography variant="body2" color="text.secondary">{t.location} · {t.startDate || t.date}</Typography>
                <Box sx={{ mt: 1 }}><StatusBadge status={t.lifecycleStatus || 'DRAFT'} /></Box>
              </CardContent>
            </CardActionArea></Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  )
}
