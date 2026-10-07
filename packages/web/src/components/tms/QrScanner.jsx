import { useEffect, useRef, useState } from 'react'
import { Box, Button, Stack, TextField, Typography, Alert } from '@mui/material'
import { QrCodeScanner, Stop } from '@mui/icons-material'

/**
 * Reads QR codes from the device camera (Phase 2 "QR check-in"). Uses the
 * browser's own BarcodeDetector where there is one, and the jsQR decoder
 * elsewhere; the code can always be typed instead. The same code is not
 * reported twice within a few seconds, so holding a pass up counts once.
 */
export default function QrScanner({ onCode, disabled = false }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [typed, setTyped] = useState('')
  const last = useRef({ code: null, at: 0 })
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  const report = (code) => {
    const now = Date.now()
    if (!code || (code === last.current.code && now - last.current.at < 4000)) return
    last.current = { code, at: now }
    onCodeRef.current(code)
  }

  useEffect(() => {
    if (!running) return undefined
    let stream = null
    let stopped = false
    let timer = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
        const jsQR = detector ? null : (await import('jsqr')).default
        const tick = async () => {
          if (stopped) return
          try {
            if (video.readyState >= 2) {
              if (detector) {
                const [hit] = await detector.detect(video)
                if (hit?.rawValue) report(hit.rawValue)
              } else {
                const canvas = canvasRef.current
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                const ctx = canvas.getContext('2d', { willReadFrequently: true })
                ctx.drawImage(video, 0, 0)
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const hit = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
                if (hit?.data) report(hit.data)
              }
            }
          } catch { /* a frame that cannot be read: try the next */ }
          timer = setTimeout(tick, 250)
        }
        tick()
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera, or type the code below.' : 'No camera is available here. Type the code below.')
        setRunning(false)
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [running])

  return (
    <Stack spacing={2}>
      {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ position: 'relative', width: '100%', maxWidth: 420, aspectRatio: '4 / 3', bgcolor: '#111', borderRadius: 2, overflow: 'hidden', display: running ? 'block' : 'none' }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <Box sx={{ position: 'absolute', inset: '15%', border: '3px solid rgba(255,255,255,0.8)', borderRadius: 2 }} />
      </Box>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <Stack direction="row" spacing={1}>
        {!running
          ? <Button variant="contained" startIcon={<QrCodeScanner />} disabled={disabled} onClick={() => { setError(null); setRunning(true) }}>Scan with camera</Button>
          : <Button variant="outlined" startIcon={<Stop />} onClick={() => setRunning(false)}>Stop camera</Button>}
      </Stack>
      <Stack direction="row" spacing={1} component="form" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { onCodeRef.current(typed.trim()); setTyped('') } }}>
        <TextField size="small" label="Or type the pass code" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={disabled} />
        <Button type="submit" variant="outlined" disabled={disabled || !typed.trim()}>Check in</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">The code is printed under the QR on every pass.</Typography>
    </Stack>
  )
}
