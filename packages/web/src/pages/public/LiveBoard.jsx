import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Typography, Paper, Grid, Stack, Card, CardActionArea, CardContent, Container } from '@mui/material'
import { tms } from '../../data/tms'
import { watchPublicChanges } from '../../data/live'
import Bracket from '../../components/tms/Bracket'
import KataRoundTable from '../../components/tms/KataRoundTable'
import { PageLoader } from '../../components/Loader'
import MatCard from '../../components/tms/MatCard'
import { matQueues } from '../../components/tms/matQueues'
import { useMatScoreboards } from '../../hooks/useMatScoreboards'

const EVENT_NAME = { kata: 'Kata', kumite: 'Kumite' }
const ROTATE_MS = 12_000

/**
 * PRD point 22: the hall screen at /live. For every mat, the bout on it (with
 * its live score while that mat's scoreboard shows it), the bouts called and coming
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
  const [slide, setSlide] = useState(0)
  const scoreOf = useMatScoreboards()

  useEffect(() => {
    let alive = true
    const load = () => tms.public.view(slug).then((d) => alive && setData(d)).catch(() => {})
    load()
    const stop = watchPublicChanges(load)
    return () => { alive = false; stop() }
  }, [slug])

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

  // Only the event on the mats now (Kata and Kumite take turns): the other's bouts are not next.
  const running = data.tournament.runningEvent
  const queues = matQueues(data.matches, running, (m) => !!scoreOf(m))
  const later = running && data.matches.find((m) => !['completed', 'cancelled'].includes(m.status) && m.aka && m.ao && m.event && m.event !== running)
  const recent = data.matches.filter((m) => m.status === 'completed').slice(-6).reverse()
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
            {!queues.length && <Grid size={{ xs: 12 }}><Paper sx={{ p: 3 }}><Typography color="text.secondary">{later ? `${EVENT_NAME[running]} is on the mats now. The ${EVENT_NAME[later.event]} bouts come after it.` : 'No bouts waiting.'}</Typography></Paper></Grid>}
            {/* KAN-428: every mat with its own scoreboard's live score, as on the public page. */}
            {queues.map((mq) => (
              <Grid key={mq.mat} size={{ xs: 12, md: 6 }}>
                <MatCard mat={mq.mat} now={mq.now} next={mq.next} board={mq.now ? scoreOf(mq.now) : null} />
              </Grid>
            ))}
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
