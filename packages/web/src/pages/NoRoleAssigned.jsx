import { Container, Box, Typography, Button } from '@mui/material'
import { useSession } from '../state/SessionContext'

// Every account is created with a role, so reaching this means an account was
// changed by hand. There is nothing the user can do about it but ask.
export default function NoRoleAssigned() {
  const { logout } = useSession()
  return (
    <Container maxWidth="sm">
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: 2 }}>
        <Typography variant="h2">No role assigned</Typography>
        <Typography variant="body1" color="textSecondary" align="center">
          This account has no role, so there is nothing for it to open yet. Ask an
          administrator to give it one.
        </Typography>
        <Button variant="contained" onClick={logout}>Sign out</Button>
      </Box>
    </Container>
  )
}
