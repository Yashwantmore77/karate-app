import { Paper, Typography } from '@mui/material'

export default function StatCard({ label, value, tone }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h1" component="p" color={tone ? `${tone}.main` : 'text.primary'} sx={{ mt: 0.5 }}>{value ?? '—'}</Typography>
    </Paper>
  )
}
