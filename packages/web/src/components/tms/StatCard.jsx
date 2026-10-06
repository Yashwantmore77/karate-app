import { Paper, Typography, Skeleton } from '@mui/material'

export default function StatCard({ label, value, tone, loading = false }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }} aria-busy={loading || undefined}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      {loading
        ? <Skeleton variant="text" width="45%" sx={{ fontSize: 28, mt: 0.5 }} />
        : <Typography variant="h1" component="p" color={tone ? `${tone}.main` : 'text.primary'} sx={{ mt: 0.5 }}>{value ?? '—'}</Typography>}
    </Paper>
  )
}
