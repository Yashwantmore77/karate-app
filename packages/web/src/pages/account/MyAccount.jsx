import { useEffect, useState } from 'react'
import { Container, Paper, Typography, Button, Alert, Stack, TextField, Box, List, ListItem, ListItemText, Chip } from '@mui/material'
import { request, HttpError } from '../../data/http'
import { ROLE_LABEL } from '@kumite/shared/permissions.js'
import { PageLoader } from '../../components/Loader'

/** PRD section 4: the signed-in person's account, and optional two-factor sign-in. */
export default function MyAccount() {
  const [account, setAccount] = useState(null)
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [sessionMsg, setSessionMsg] = useState(null)

  const load = () => request('/auth/account').then((r) => setAccount(r.account)).catch(() => setAccount(null))
  const loadSessions = () => request('/auth/sessions').then((r) => setSessions(r.sessions)).catch(() => setSessions([]))
  useEffect(() => { load(); loadSessions() }, [])
  // Ending a session says whether it worked: a device left signed in by a
  // failure nobody saw is the one that should have been signed out.
  const whyNot = (err) => (err instanceof HttpError
    ? (err.code === 'session_not_found' ? 'it had already ended.' : `the server refused (${err.code || err.status}).`)
    : 'there is no connection to the server. Try again when it is back.')
  const endSession = (sid) => request(`/auth/sessions/${sid}`, { method: 'DELETE' })
    .then(() => setSessionMsg({ severity: 'success', text: 'That device is signed out.' }))
    .catch((err) => setSessionMsg({ severity: 'error', text: `That device was not signed out: ${whyNot(err)}` }))
    .finally(loadSessions)
  const endOthers = () => request('/auth/sessions/revoke-others', { method: 'POST', body: {} })
    .then((r) => setSessionMsg({ severity: 'success', text: `Signed out on ${r?.revoked ?? 0} other device${r?.revoked === 1 ? '' : 's'}.` }))
    .catch((err) => setSessionMsg({ severity: 'error', text: `The other devices were not signed out: ${whyNot(err)}` }))
    .finally(loadSessions)

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
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {ROLE_LABEL[account.role] || account.role}{account.tournamentIds.length ? ` · ${account.tournamentIds.length} assigned tournament(s)` : ' · all tournaments'}
          {Object.keys(account.tournamentRoles || {}).length > 0 && ` · a different role in ${Object.keys(account.tournamentRoles).length} tournament(s)`}
        </Typography>

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

        {/* PRD v1 §26: where this account is signed in, and ending those sessions. */}
        <Typography variant="h3" gutterBottom sx={{ mt: 4 }}>Where you are signed in</Typography>
        {sessionMsg && <Alert severity={sessionMsg.severity} sx={{ mb: 2 }} onClose={() => setSessionMsg(null)}>{sessionMsg.text}</Alert>}
        <List dense>
          {!sessions && <PageLoader label="Loading sessions…" minHeight={80} />}
          {(sessions || []).map((x) => (
            <ListItem key={x.sid} disableGutters secondaryAction={!x.current && <Button size="small" onClick={() => endSession(x.sid)}>Sign out</Button>}>
              <ListItemText
                primary={<>{(x.userAgent || 'Unknown device').slice(0, 70)} {x.current && <Chip size="small" color="primary" label="This device" sx={{ ml: 1 }} />}</>}
                secondary={`${x.ip || 'unknown address'} · signed in ${new Date(x.createdAt).toLocaleString()} · last active ${new Date(x.lastSeenAt).toLocaleString()}`} />
            </ListItem>
          ))}
          {sessions && !sessions.length && <Typography color="text.secondary">No other sessions.</Typography>}
        </List>
        {(sessions || []).filter((x) => !x.current).length > 0 && <Button variant="outlined" color="warning" onClick={endOthers}>Sign out everywhere else</Button>}
      </Paper>
    </Container>
  )
}
