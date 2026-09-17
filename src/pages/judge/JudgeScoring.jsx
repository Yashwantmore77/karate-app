import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Container, Box, AppBar, Toolbar, Typography, Button, Paper, Grid, Card, CardContent, ButtonGroup, Alert, IconButton, Stack } from '@mui/material'
import { ArrowBack, CheckCircle } from '@mui/icons-material'
import { signOut, auth, SCORE_VALUES, clampScore } from '../../firebase'
import { isExpired } from '../../utils/dateUtils'

const validationSchema = Yup.object({
  score1: Yup.number()
    .typeError('Select a point value')
    .oneOf(SCORE_VALUES, `Points must be one of ${SCORE_VALUES.join(', ')}`)
    .required('Points required'),
  score2: Yup.number()
    .typeError('Select a point value')
    .oneOf(SCORE_VALUES, `Points must be one of ${SCORE_VALUES.join(', ')}`)
    .required('Points required'),
})

export default function JudgeScoring({ uid, profile }) {
  const navigate = useNavigate()
  const { matchId } = useParams()
  const [match, setMatch] = useState(null)
  const [category, setCategory] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [redComp, setRedComp] = useState(null)
  const [blueComp, setBlueComp] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const formik = useFormik({
    initialValues: { score1: SCORE_VALUES[0], score2: SCORE_VALUES[0] },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: false,
    onSubmit: (values) => {
      const data = {
        competitor1: clampScore(Number(values.score1)),
        competitor2: clampScore(Number(values.score2)),
        submitTime: new Date().toISOString(),
        judgeId: profile?.seat
      }
      localStorage.setItem(`judge-${profile?.seat}-${matchId}`, JSON.stringify(data))
      setSubmitted(true)
    }
  })

  useEffect(() => {
    let allMatches = []
    let allTournaments = []
    const stored = localStorage.getItem('tournaments')
    if (stored) {
      allTournaments = JSON.parse(stored)
      allTournaments.forEach(t => {
        const catStored = localStorage.getItem(`categories-${t.id}`)
        if (catStored) {
          JSON.parse(catStored).forEach(cat => {
            const matchStored = localStorage.getItem(`matches-${cat.id}`)
            if (matchStored) {
              const ms = JSON.parse(matchStored)
              allMatches = [...allMatches, ...ms.map(m => ({ ...m, categoryId: cat.id }))]
            }
          })
        }
      })
    }
    const m = allMatches.find(x => x.id === matchId)
    if (m) {
      setMatch(m)
      const catStored = localStorage.getItem(`categories-${m.categoryId}`)
      if (catStored) {
        const cats = JSON.parse(catStored)
        const cat = cats.find(c => c.id === m.categoryId)
        setCategory(cat)
        if (cat) setTournament(allTournaments.find(t => t.id === cat.tournamentId))
      }
      const compStored = localStorage.getItem(`competitors-${m.categoryId}`)
      if (compStored) {
        const comps = JSON.parse(compStored)
        setRedComp(comps.find(c => c.id === m.redId))
        setBlueComp(comps.find(c => c.id === m.blueId))
      }
      const scoreStored = localStorage.getItem(`judge-${profile?.seat}-${matchId}`)
      if (scoreStored) {
        const s = JSON.parse(scoreStored)
        formik.setValues({ score1: s.competitor1, score2: s.competitor2 })
        setSubmitted(true)
      }
    }
  }, [matchId, profile?.seat])

  if (!match || !redComp || !blueComp) {
    return <div>Match not found</div>
  }

  const tournamentExpired = tournament && isExpired(tournament.date)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={() => navigate('/judge')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Score Match</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>{category?.name} • Judge #{profile?.seat}</Typography>
          </Box>
          <Button color="inherit" onClick={() => signOut(auth)}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4, flex: 1 }}>
        {tournamentExpired && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Tournament expired on {new Date(tournament.date).toLocaleDateString()}. Scoring is disabled.
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3} alignItems="flex-start">
              <Grid item xs={12} sm={5}>
                <Box sx={{ textAlign: 'center', p: 3, bgcolor: 'error.light', borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'error.dark' }}>{redComp.name}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'error.dark' }}>#{redComp.bib}</Typography>

                  <ButtonGroup variant="outlined" sx={{ mb: 0.5, bgcolor: 'background.paper', borderRadius: 1 }}>
                    {SCORE_VALUES.map((points) => (
                      <Button
                        key={points}
                        onClick={() => formik.setFieldValue('score1', clampScore(points))}
                        disabled={submitted || tournamentExpired}
                        variant={formik.values.score1 === points ? 'contained' : 'outlined'}
                        sx={{ fontSize: '20px', fontWeight: 700, minWidth: 56 }}
                      >
                        {points}
                      </Button>
                    ))}
                  </ButtonGroup>
                  <Typography variant="caption" display="block" color="error" sx={{ minHeight: 20 }}>{formik.errors.score1 || ' '}</Typography>
                  <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>Points</Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={2}>
                <Box sx={{ textAlign: 'center', pt: 3 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>vs</Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={5}>
                <Box sx={{ textAlign: 'center', p: 3, bgcolor: 'info.light', borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: 'info.dark' }}>{blueComp.name}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'info.dark' }}>#{blueComp.bib}</Typography>

                  <ButtonGroup variant="outlined" sx={{ mb: 0.5, bgcolor: 'background.paper', borderRadius: 1 }}>
                    {SCORE_VALUES.map((points) => (
                      <Button
                        key={points}
                        onClick={() => formik.setFieldValue('score2', clampScore(points))}
                        disabled={submitted || tournamentExpired}
                        variant={formik.values.score2 === points ? 'contained' : 'outlined'}
                        sx={{ fontSize: '20px', fontWeight: 700, minWidth: 56 }}
                      >
                        {points}
                      </Button>
                    ))}
                  </ButtonGroup>
                  <Typography variant="caption" display="block" color="error" sx={{ minHeight: 20 }}>{formik.errors.score2 || ' '}</Typography>
                  <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>Points</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
          {submitted ? (
            <Stack alignItems="center" spacing={2}>
              <CheckCircle sx={{ color: 'success.main', fontSize: 48 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>Submitted</Typography>
              {!tournamentExpired && (
                <Button variant="outlined" onClick={() => setSubmitted(false)}>Edit Score</Button>
              )}
            </Stack>
          ) : (
            <Button
              variant="contained"
              size="large"
              onClick={formik.handleSubmit}
              disabled={tournamentExpired}
              sx={{ minWidth: 200 }}
            >
              Submit Score
            </Button>
          )}
        </Paper>
      </Container>
    </Box>
  )
}
