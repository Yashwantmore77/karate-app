import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Stack, Typography, Alert } from '@mui/material'
import { tms, describeError } from '../../data/tms'
import { PageLoader } from '../../components/Loader'

/**
 * The certificates as the server draws them (section 44), shown for printing.
 *
 * One renderer, api/lib/pdf.js, draws every certificate the app issues, so what
 * prints here is exactly what Download PDF gives: the configured title and
 * signatories, the right wording for a participation or special award, and the
 * QR code that proves the certificate genuine.
 */
export default function CertificatesPrint() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const frame = useRef(null)
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let objectUrl = null
    tms.pdfBlob(tournamentId, 'certificates.pdf')
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(setError)
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [tournamentId])

  if (error) return <Alert severity="error" sx={{ m: 3 }}>{describeError(error)}</Alert>
  if (!url) return <PageLoader label="Preparing certificates…" />

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Stack direction="row" spacing={1} className="no-print" sx={{ p: 2, bgcolor: '#f4f4f4' }}>
        {/* The blob is same-origin, so the viewer below can be printed directly. */}
        <Button variant="contained" onClick={() => frame.current?.contentWindow?.print()}>Print / Save as PDF</Button>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Typography sx={{ alignSelf: 'center', color: '#555' }}>A4 landscape recommended</Typography>
      </Stack>
      <Box component="iframe" ref={frame} src={url} title="Certificates" sx={{ flexGrow: 1, width: '100%', border: 0 }} />
    </Box>
  )
}
