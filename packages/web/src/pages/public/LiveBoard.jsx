import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Typography, Paper, Grid, Stack, Chip, Card, CardActionArea, CardContent, Container } from '@mui/material'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import { displayRepo } from '../../data/display'
import Bracket from '../../components/tms/Bracket'
import KataRoundTable from '../../components/tms/KataRoundTable'
import { PageLoader } from '../../components/Loader'

const AKA = '#FF5B5B'
const AO = '#5B7BFF'
const NEXT_PER_MAT = 3
const ROTATE_MS = 12_000
const number = (m) => Number(String(m.matchNumber).replace(/\D/g, '')) || 0

/**
 * PRD point 22: the hall screen at /live. For every mat, the bout on it (with
 * the live score when the scoreboard is open), the bouts called and coming
 * next, and a rotating view of the brackets and kata results. Public data
 * only (Rule 8); it updates itself as the server announces changes.
 *
 * /live?t=<slug> shows one tournament; without it, a picker.
 */
export default function LiveBoard() {
  const [params, setParams] = useSearchParams()
  const slug = params.get('t')
  const [list, setList] = useState(null)

  useEffect(() => { if (!slug) tms.public.list().then(setList).catch(() => setList([])) }, [slug])

  if (!slug) {
    if (!list) return <PageLoader label="Loading tournaments…" />
    const running = list.filter((t) => t.lifecycleStatus !== 'COMPLETED' && t.lifecycleStatus !== 'ARCHIVED')
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h1" sx={{ mb: 3 }}>Live board: choose a tournament</Typography>
        {!running.length && <Typography color="text.secondary">No tournament is running.</Typography>}
        <Grid container spacing={2}>
          {running.map((t) => (
            <Grid key={t.id} size={{ xs: 12, sm: 6 }}>
              <Card><CardActionArea onClick={() => setParams({ t: t.slug || t.id })}>
                <CardContent><Typography variant="h3">{t.name}</Typography><Typography color="text.secondary">{t.venue || t.location}</Typography></CardContent>
              </CardActionArea></Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    )
  }
  return <Board slug={slug} />
}

function Board({ slug }) {
  const [data, setData] = useState(null)
  const [live, setLive] = useState(null)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => tms.public.view(slug).then((d) => alive && setData(d)).catch(() => {})
    load()
    const stop = watchPublicChanges(load)
    return () => { alive = false; stop() }
  }, [slug])
  useEffect(() => displayRepo.subscribe(setLive), [])

  // The brackets and kata results with something to show, one at a time.
  const slides = useMemo(() => (data?.results || []).flatMap((d) => [
    ...(d.bracket ? [{ key: `${d.key}:b`, title: d.label, bracket: d.bracket }] : []),
    ...(d.kata?.rounds?.length ? [{ key: `${d.key}:k`, title: `${d.label} — ${d.kata.rounds[d.kata.rounds.length - 1].name}`, kata: d.kata.rounds[d.kata.rounds.length - 1] }] : []),
  ]), [data])
  useEffect(() => {
    if (slides.length < 2) return undefined
    const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [slides.length])

  if (!data) return <PageLoader label="Loading live board…" />

  const pending = data.matches.filter((m) => !['completed', 'cancelled'].includes(m.status) && m.aka && m.ao).sort((a, b) => number(a) - number(b))
  const mats = [...new Set(pending.map((m) => m.mat || 1))].sort((a, b) => a - b)
  const recent = data.matches.filter((m) => m.status === 'completed').slice(-6).reverse()
  const scoreboardOpen = live && live.status === 'open'
  const current = slides[slide % Math.max(1, slides.length)]

  return (
    <Box sx={{ minHeight: '100vh', p: { xs: 2, md: 3 } }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 26, md: 36 } }}>{data.tournament.name}</Typography>
        <Typography color="text.secondary">{data.tournament.venue || data.tournament.location}</Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Grid container spacing={2}>
            {!mats.length && <Grid size={{ xs: 12 }}><Paper sx={{ p: 3 }}><Typography color="text.secondary">No bouts waiting.</Typography></Paper></Grid>}
            {mats.map((mat) => {
              const queue = pending.filter((m) => (m.mat || 1) === mat)
              const now = queue.find((m) => ['live', 'open'].includes(m.status)) || null
              const next = queue.filter((m) => m !== now).slice(0, NEXT_PER_MAT)
              const showScore = now && scoreboardOpen && String(live.fieldNumber || '') === String(mat)
              return (
                <Grid key={mat} size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h2" sx={{ mb: 1 }}>Mat {mat}</Typography>
                    {now ? (
                      <Box sx={{ mb: 2 }}>
                        <Chip size="small" color="error" label="NOW" sx={{ mb: 0.5 }} />
                        <Typography variant="body2" color="text.secondary">{now.matchNumber} · {now.category} · {now.stage === 'knockout' ? now.roundName : `Pool ${now.pool}`}</Typography>
                        <Side color={AKA} name={now.aka} score={showScore ? live.akaScore : null} />
                        <Side color={AO} name={now.ao} score={showScore ? live.aoScore : null} />
                      </Box>
                    ) : <Typography color="text.secondary" sx={{ mb: 2 }}>Mat free</Typography>}
                    {next.map((m, i) => (
                      <Box key={m.id} sx={{ py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{i === 0 ? 'Next' : `Then`} · {m.matchNumber}</Typography>
                          {m.calledAt && <Chip size="small" color="warning" label="Called" />}
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>{m.category}</Typography>
                        </Stack>
                        <Typography variant="body2"><Box component="span" sx={{ color: AKA }}>■</Box> {m.aka}  <Box component="span" sx={{ color: AO, ml: 1 }}>■</Box> {m.ao}</Typography>
                      </Box>
                    ))}
                  </Paper>
                </Grid>
              )
            })}
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          {current && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h3">{current.title}</Typography>
                {slides.length > 1 && <Typography variant="body2" color="text.secondary">{(slide % slides.length) + 1} / {slides.length}</Typography>}
              </Stack>
              {current.bracket && <Bracket rounds={current.bracket.rounds} />}
              {current.kata && <KataRoundTable round={current.kata} />}
            </Paper>
          )}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h3" sx={{ mb: 1 }}>Latest results</Typography>
            {!recent.length && <Typography color="text.secondary">No results yet.</Typography>}
            {recent.map((m) => (
              <Typography key={m.id} variant="body2" sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <b>{m.matchNumber}</b> {m.category}: <b>{m.winner === 'red' ? m.aka : m.winner === 'blue' ? m.ao : 'Draw'}</b>
                {m.akaScore != null ? ` (${m.akaScore}–${m.aoScore})` : ''}
              </Typography>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

function Side({ color, name, score }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Box sx={{ width: 6, height: 28, bgcolor: color, borderRadius: 1 }} />
      <Typography variant="h3" sx={{ flex: 1 }} noWrap>{name || 'TBD'}</Typography>
      {score != null && <Typography variant="h2">{score}</Typography>}
    </Stack>
  )
}
