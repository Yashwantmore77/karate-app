import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Stack, Typography } from '@mui/material'
import { tms } from '../../data/tms'
import { tournaments as tournamentStore } from '../../data/domain'
import { PageLoader } from '../../components/Loader'

const MEDAL_COLOR = { gold: '#B8860B', silver: '#7D7D7D', bronze: '#8C5A2B' }
const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || `${n}th`)

/** Printable certificates: the browser's "Save as PDF" produces the PDF (section 44). */
export default function CertificatesPrint() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [rows, setRows] = useState([])
  useEffect(() => {
    tournamentStore.get(tournamentId).then(setTournament)
    tms.certificates(tournamentId).then(setRows)
  }, [tournamentId])

  if (!tournament) return <PageLoader label="Preparing certificates…" />
  const date = tournament.endDate || tournament.startDate || tournament.date

  return (
    <Box sx={{ bgcolor: '#fff', color: '#111', minHeight: '100vh' }}>
      <Stack direction="row" spacing={1} className="no-print" sx={{ p: 2, bgcolor: '#f4f4f4' }}>
        <Button variant="contained" onClick={() => window.print()}>Print / Save as PDF</Button>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Typography sx={{ alignSelf: 'center', color: '#555' }}>{rows.length} certificates · A4 landscape recommended</Typography>
      </Stack>
      {rows.map((c) => (
        <Box key={c.id} className="print-page" sx={{ p: { xs: 2, md: 6 }, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ width: '100%', maxWidth: 1000, aspectRatio: '1.414', border: `10px double ${MEDAL_COLOR[c.medal] || '#333'}`, p: { xs: 3, md: 6 }, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'Georgia, serif' }}>
            <Box>
              {tournament.logoUrl && <Box component="img" src={tournament.logoUrl} alt="" sx={{ height: 70, mb: 1 }} />}
              <Typography sx={{ fontSize: { xs: 22, md: 34 }, fontWeight: 700, color: '#111' }}>{tournament.name}</Typography>
              <Typography sx={{ color: '#444' }}>{[tournament.organizer, tournament.venue || tournament.location, date].filter(Boolean).join(' · ')}</Typography>
            </Box>
            <Box>
              <Typography sx={{ letterSpacing: 4, textTransform: 'uppercase', color: '#555' }}>Certificate of Achievement</Typography>
              <Typography sx={{ fontSize: { xs: 26, md: 44 }, fontWeight: 700, my: 2, color: '#111' }}>{c.name}</Typography>
              <Typography sx={{ color: '#333', fontSize: 18 }}>{c.club ? `of ${c.club}, ` : ''}secured <b>{ordinal(c.rank)} place</b> and the</Typography>
              <Typography sx={{ fontSize: 30, fontWeight: 700, color: MEDAL_COLOR[c.medal], textTransform: 'uppercase', my: 1 }}>{c.medal} medal</Typography>
              <Typography sx={{ color: '#333', fontSize: 18 }}>in {c.category}</Typography>
            </Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Typography sx={{ color: '#666', fontSize: 13, textAlign: 'left' }}>Certificate ID<br /><b>{c.certificateId}</b></Typography>
              <Box sx={{ borderTop: '1px solid #333', pt: 0.5, minWidth: 200 }}><Typography sx={{ color: '#333', fontSize: 14 }}>Authorized signature</Typography></Box>
            </Stack>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
