import { Container, Box, Typography, Button } from '@mui/material'
import { signOut, auth } from '../firebase'

export default function NoRoleAssigned({ uid }) {
  return (
    <Container maxWidth="sm">
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" gap={2}>
        <Typography variant="h2">No role assigned</Typography>
        <Typography variant="body1" color="textSecondary">
          Add a document at{' '}
          <Box component="span" sx={{ bgcolor: '#f3f4f6', px: 1, py: 0.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.9em' }}>
            roles/{uid}
          </Box>
          {' '}in Firebase console.
        </Typography>
        <Button variant="contained" onClick={() => signOut(auth)}>Sign out</Button>
      </Box>
    </Container>
  )
}
