import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Container, Paper, Typography, TextField, Button, Alert, Stack, Link } from '@mui/material'
import { request } from '../../data/http'
import { serverUrl } from '../../data/session'

/**
 * PRD section 4: forgot password and reset. One screen: without a token it
 * asks for the address; with the emailed token it takes the new password.
 */
export default function PasswordReset() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState(null) // { severity, text }
  const [busy, setBusy] = useState(false)

  if (!serverUrl()) {
    return <Container maxWidth="sm" sx={{ py: 6 }}><Alert severity="info">Password reset needs the tournament server. In offline mode use the demo accounts.</Alert></Container>
  }

  const send = async () => {
    setBusy(true)
    try {
      if (token) {
        if (password.length < 8) throw Object.assign(new Error(), { code: 'short' })
        if (password !== confirm) throw Object.assign(new Error(), { code: 'mismatch' })
        await request('/auth/reset', { method: 'POST', body: { token, password }, anonymous: true })
        setState({ severity: 'success', text: 'Password changed. You can sign in with it now.' })
      } else {
        await request('/auth/forgot', { method: 'POST', body: { email }, anonymous: true })
        setState({ severity: 'success', text: 'If that address has an account, a reset link is on its way. It works for 30 minutes.' })
      }
    } catch (err) {
      const text = {
        short: 'Use at least 8 characters.',
        mismatch: 'The two passwords do not match.',
        invalid_or_expired_token: 'This link has expired or was already used. Ask for a new one.',
        too_many_attempts: 'Too many attempts. Wait a few minutes and try again.',
      }[err?.code] || 'Something went wrong. Try again.'
      setState({ severity: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h1" gutterBottom>{token ? 'Choose a new password' : 'Forgot password'}</Typography>
        <Stack spacing={2}>
          {state && <Alert severity={state.severity}>{state.text}</Alert>}
          {token ? (
            <>
              <TextField type="password" label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helperText="At least 8 characters" />
              <TextField type="password" label="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </>
          ) : (
            <TextField type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          )}
          <Button size="large" variant="contained" onClick={send} disabled={busy || (!token && !email.trim()) || state?.severity === 'success'}>
            {token ? 'Change password' : 'Send reset link'}
          </Button>
          <Link component={RouterLink} to="/login">Back to sign in</Link>
        </Stack>
      </Paper>
    </Container>
  )
}
