import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import { Container, Paper, Typography, Alert, Stack, TextField, Button, Box, Link } from '@mui/material'
import { VerifiedUser } from '@mui/icons-material'
import { tms, describeError } from '../../data/tms'
import { PageLoader } from '../../components/Loader'

const MEDAL = { gold: '🥇 Gold', silver: '🥈 Silver', bronze: '🥉 Bronze' }

/**
 * PRD v1 §18: the page a certificate's QR code opens. It confirms the
 * certificate was issued and shows only what the certificate itself shows.
 */
export default function VerifyCertificate() {
  const { certificateId } = useParams()
  const navigate = useNavigate()
  const [cert, setCert] = useState(null)
  const [error, setError] = useState(null)
  const [id, setId] = useState(certificateId || '')

  useEffect(() => {
    setCert(null)
    setError(null)
    if (certificateId) tms.public.verifyCertificate(certificateId).then(setCert).catch(setError)
  }, [certificateId])

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h1" gutterBottom>Verify a certificate</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <TextField fullWidth size="small" label="Certificate ID" value={id} onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && id.trim() && navigate(`/verify/${encodeURIComponent(id.trim())}`)} />
        <Button variant="contained" disabled={!id.trim()} onClick={() => navigate(`/verify/${encodeURIComponent(id.trim())}`)}>Check</Button>
      </Stack>
      {certificateId && !cert && !error && <PageLoader label="Checking…" />}
      {error && <Alert severity="error">{error.status === 404 || error.code === 'certificate_not_found' ? 'No certificate with this ID was issued.' : describeError(error)}</Alert>}
      {cert && (
        <Paper sx={{ p: 3 }}>
          <Alert severity="success" icon={<VerifiedUser />} sx={{ mb: 2 }}>This certificate is genuine.</Alert>
          <Typography variant="h2">{cert.name}</Typography>
          {cert.club && <Typography color="text.secondary">{cert.club}</Typography>}
          <Box sx={{ mt: 2 }}>
            {cert.title && <Typography><b>{cert.title}</b></Typography>}
            {cert.medal && <Typography>{MEDAL[cert.medal] || cert.medal}{cert.category ? ` — ${cert.category}` : ''}</Typography>}
            {!cert.medal && cert.category && <Typography>{cert.category}</Typography>}
            {cert.award && <Typography>{cert.award}</Typography>}
          </Box>
          {cert.tournament && (
            <Typography sx={{ mt: 2 }}>
              {cert.tournament.slug ? <Link component={RouterLink} to={`/tournament/${cert.tournament.slug}`}>{cert.tournament.name}</Link> : cert.tournament.name}
              {[cert.tournament.venue, cert.tournament.date].filter(Boolean).length ? ` · ${[cert.tournament.venue, cert.tournament.date].filter(Boolean).join(' · ')}` : ''}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Certificate {cert.certificateId} · issued {new Date(cert.issuedAt).toLocaleDateString()}</Typography>
        </Paper>
      )}
    </Container>
  )
}
