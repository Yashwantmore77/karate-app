import { useEffect, useState } from 'react'
import { Container, Paper, Typography, Button, Alert, Stack, TextField, Box } from '@mui/material'
import { request } from '../../data/http'
import { ROLE_LABEL } from '@kumite/shared/permissions.js'
import { PageLoader } from '../../components/Loader'

/** PRD section 4: the signed-in person's account, and optional two-factor sign-in. */
export default function MyAccount() {
  const [account, setAccount] = useState(null)
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)

  const load = () => request('/auth/account').then((r) => setAccount(r.account)).catch(() => setAccount(null))
  useEffect(() => { load() }, [])

  if (!account) return <PageLoader label="Loading your account…" />

  const act = async (path, success) => {
    try {
      await request(path, { method: 'POST', body: { code } })
      setMsg({ severity: 'success', text: success })
      setSetup(null)
      setCode('')
      load()
    } catch {
      setMsg({ severity: 'error', text: 'That code did not match. Use the current code from the app.' })
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h1" gutterBottom>My account</Typography>
        <Typography>{account.email}</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>{ROLE_LABEL[account.role] || account.role}{account.tournamentIds.length ? ` · ${account.tournamentIds.length} assigned tournament(s)` : ' · all tournaments'}</Typography>

        <Typography variant="h3" gutterBottom>Two-factor sign-in</Typography>
        {msg && <Alert severity={msg.severity} sx={{ mb: 2 }}>{msg.text}</Alert>}
        {account.twoFactorEnabled ? (
          <Stack spacing={2}>
            <Alert severity="success">On. Signing in asks for a code from your authenticator app.</Alert>
            <TextField label="Current code to turn it off" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <Button color="warning" variant="outlined" disabled={code.length !== 6} onClick={() => act('/auth/2fa/disable', 'Two-factor sign-in is off.')}>Turn off</Button>
          </Stack>
        ) : setup ? (
          <Stack spacing={2}>
            <Typography>In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), add an account with this key, or open the link on the phone:</Typography>
            <Box sx={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 1, wordBreak: 'break-all' }}>{setup.secret.match(/.{1,4}/g).join(' ')}</Box>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}><a href={setup.otpauthUrl} style={{ color: 'inherit' }}>{setup.otpauthUrl}</a></Typography>
            <TextField label="Code the app shows" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <Button variant="contained" disabled={code.length !== 6} onClick={() => act('/auth/2fa/enable', 'Two-factor sign-in is on.')}>Turn on</Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography color="text.secondary">Off. Recommended for administrators.</Typography>
            <Button variant="contained" onClick={() => request('/auth/2fa/setup', { method: 'POST', body: {} }).then(setSetup)}>Set up two-factor sign-in</Button>
          </Stack>
        )}
      </Paper>
    </Container>
  )
}
