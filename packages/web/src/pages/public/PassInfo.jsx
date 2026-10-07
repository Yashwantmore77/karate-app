import { useParams, Link as RouterLink } from 'react-router-dom'
import { Container, Paper, Typography, Button } from '@mui/material'
import { Badge } from '@mui/icons-material'

/**
 * Where a pass's QR code leads when someone opens it with an ordinary phone
 * camera. Check-in itself happens in the staff Check-in tab, which reads the
 * same code; this page only says what the pass is.
 */
export default function PassInfo() {
  const { code } = useParams()
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Badge sx={{ fontSize: 48, mb: 1 }} color="primary" />
        <Typography variant="h2" gutterBottom>Accreditation pass</Typography>
        <Typography sx={{ mb: 1 }}>Pass code <b>{code}</b></Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Tournament staff check this pass in from the <b>Check-in &amp; passes</b> tab, which scans the same QR code.
        </Typography>
        <Button variant="contained" component={RouterLink} to="/login">Staff sign-in</Button>
      </Paper>
    </Container>
  )
}
