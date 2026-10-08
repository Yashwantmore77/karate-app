import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Paper, Stack, Typography, Button, Alert, TextField, MenuItem, ToggleButtonGroup, ToggleButton, Box, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, RadioGroup, Radio, FormControlLabel, Grid,
} from '@mui/material'
import { Print, Save, Undo, EmojiEvents } from '@mui/icons-material'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { tms, describeError } from '../../data/tms'
import { HelpTitle } from '../../components/help/InfoTip'
import { PageLoader } from '../../components/Loader'
import { printBracketSheets, placesFromBracket } from '../../components/tms/bracketSheet'
import { RESULT_TYPE_LABEL } from './MatchesTab'

// The board is drawn like the paper draw sheet: first-round AKA / AO boxes on
// the left, each winner's box between the two it comes from, the final on the
// right, then 1st / 2nd / 3rd and the 3rd/4th place bout.
const BOX_W = 196
const BOX_H = 36
const STEP = 46
const TOP = 8
const AKA = '#e53935'
const AO = '#1e63d6'

/**
 * Drag and drop on the bracket:
 *  - Arrange draw (before the first bout): drag a player onto another place
 *    to swap them, or onto an empty place (a bye). Tap one, then another,
 *    does the same on a phone. Save rebuilds the bouts.
 *  - Record results: drag the winner into the next box (or tap the bout) to
 *    record how it ended. The bracket then fills itself.
 */
export default function BracketTab({ tournament, version, action, role }) {
  const tid = tournament.id
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState(null)
  const [bracket, setBracket] = useState(null)
  const [layout, setLayout] = useState(null) // the arrangement being edited
  const [mode, setMode] = useState('arrange')
  const [picked, setPicked] = useState(null) // tap-to-swap / tap-to-score selection
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [result, setResult] = useState(null) // the bout being recorded
  const [error, setError] = useState(null)
  const canArrange = can(role, P.POOL_MANAGE)
  const canScore = can(role, P.RESULT_MANAGE)
  const key = params.get('bracket') || list?.[0]?.divisionKey || null

  const loadList = () => tms.brackets.list(tid).then(setList).catch(() => setList([]))
  const load = () => (key ? tms.brackets.get(tid, key).then((b) => { setBracket(b); setLayout(null); setPicked(null) }).catch((e) => setError(describeError(e))) : Promise.resolve())
  useEffect(() => { loadList() }, [tid, version])
  useEffect(() => { load() }, [tid, key, version])
  useEffect(() => { if (bracket) setMode(bracket.started || !canArrange ? 'results' : 'arrange') }, [bracket?.divisionKey, bracket?.started])
  // Bouts scored on the referee console show up by themselves, but never
  // while someone is mid-arrangement, dragging, or entering a result.
  useEffect(() => {
    if (!key) return undefined
    const timer = setInterval(() => {
      if (layout || dragging || result || document.hidden) return
      tms.brackets.get(tid, key).then(setBracket).catch(() => {})
    }, 15_000)
    return () => clearInterval(timer)
  }, [tid, key, layout, dragging, result])

  const names = useMemo(() => new Map((bracket?.entries || []).map((e) => [e.id, e.name])), [bracket])
  const label = list?.find((b) => b.divisionKey === key)?.label || ''
  const arranging = mode === 'arrange' && canArrange && bracket && !bracket.started
  const places = layout || bracket?.layout || []
  const dirty = !!layout && JSON.stringify(layout) !== JSON.stringify(bracket?.layout)

  if (!list) return <PageLoader label="Loading brackets…" />
  if (!list.length) {
    return (
      <Alert severity="info">
        No bracket yet. A <b>knockout</b> category gets its bracket when matches are generated (Draw / Pools, step 3). A pool category gets one when its
        final stage is generated in Results. To run a category as a straight knockout, set its competition system to Knockout (Categories → category rules, or Settings).
      </Alert>
    )
  }
  if (!bracket) return <PageLoader label="Loading bracket…" />

  const rounds = bracket.rounds.map((r) => ({ ...r, matches: r.matches.filter((m) => !m.thirdPlace) })).filter((r) => r.matches.length)
  const third = bracket.rounds.flatMap((r) => r.matches).find((m) => m.thirdPlace) || null
  const size = bracket.size
  const columns = Math.log2(size)

  // Who stands in each box: column 0 from the arrangement, later columns from the bouts.
  const boxAt = (col, i) => {
    if (col === 0) {
      const id = places[i] || null
      const bout = rounds[0]?.matches[Math.floor(i / 2)]
      return { id, name: id ? names.get(id) : '', bout }
    }
    const bout = rounds[col]?.matches[Math.floor(i / 2)]
    const side = i % 2 === 0 ? 'aka' : 'ao'
    const fromBout = rounds[col - 1]?.matches[i]
    const person = bout?.[side] || (fromBout?.won ? fromBout[fromBout.won] : null)
    return { id: person?.id || null, name: person?.name || '', bout }
  }
  // The bout a box's player fights next, and whether it can be decided now.
  const boutOf = (col, i) => (col < columns ? rounds[col]?.matches[Math.floor(i / 2)] : null)
  const ready = (m) => m && m.id && m.aka && m.ao && !m.won

  const final = rounds[rounds.length - 1]?.matches[0]
  const semis = rounds.length >= 2 ? rounds[rounds.length - 2].matches : []
  const loser = (m) => (m?.won ? m[m.won === 'aka' ? 'ao' : 'aka'] : null)
  const medals = {
    gold: final?.won ? final[final.won]?.name : '',
    silver: loser(final)?.name || '',
    bronze: third ? (third.won ? [third[third.won]?.name] : []) : semis.map(loser).filter(Boolean).map((p) => p.name),
  }

  const swap = (a, b) => {
    if (a === b) return
    const next = [...places]
    ;[next[a], next[b]] = [next[b], next[a]]
    setLayout(next)
    setError(null)
  }

  const openResult = (m, winnerSide = null) => {
    if (!m?.id || !canScore) return
    setResult({
      m, winner: winnerSide || m.won || 'aka', resultType: 'COMPLETED', aka: m.akaScore ?? '', ao: m.aoScore ?? '', finishReason: '', reason: '',
    })
  }

  // --- drag and drop ---------------------------------------------------------
  const dragStart = (col, i) => (e) => {
    setDragging({ col, i })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${col}:${i}`)
  }
  const dropOn = (col, i) => (e) => {
    e.preventDefault()
    const from = dragging
    setDragging(null)
    setOver(null)
    if (!from) return
    if (arranging && from.col === 0 && col === 0) return swap(from.i, i)
    // Results: a player dropped into the box their bout feeds wins that bout.
    if (!arranging && col === from.col + 1 && Math.floor(from.i / 2) === i) {
      const m = boutOf(from.col, from.i)
      if (ready(m)) openResult(m, from.i % 2 === 0 ? 'aka' : 'ao')
    }
  }
  const allowDrop = (col, i) => (e) => {
    const from = dragging
    if (!from) return
    const ok = arranging ? (from.col === 0 && col === 0) : (col === from.col + 1 && Math.floor(from.i / 2) === i && ready(boutOf(from.col, from.i)))
    if (ok) { e.preventDefault(); setOver(`${col}:${i}`) }
  }
  // Tap: arrange → pick two places to swap; results → open the bout.
  const tap = (col, i) => {
    if (arranging && col === 0) {
      if (picked == null) setPicked(i)
      else { swap(picked, i); setPicked(null) }
      return
    }
    if (!arranging) {
      const m = boutOf(col, i)
      if (m?.id && (ready(m) || m.won)) openResult(m, m.won || (i % 2 === 0 ? 'aka' : 'ao'))
    }
  }

  const save = async () => {
    setError(null)
    try {
      const b = await tms.brackets.arrange(tid, key, places.map((id) => id || null))
      setBracket(b)
      setLayout(null)
      action.notify({ severity: 'success', text: 'Draw saved; the bouts follow the new arrangement' })
    } catch (err) {
      setError(describeError(err))
    }
  }

  const saveResult = async () => {
    const r = result
    const ok = await action.run(() => tms.correctResult(tid, r.m.id, {
      winner: r.winner === 'aka' ? 'red' : 'blue', resultType: r.resultType, avgRed: Number(r.aka) || 0, avgBlue: Number(r.ao) || 0,
      ...(r.finishReason.trim() ? { finishReason: r.finishReason.trim() } : {}),
    }, r.reason.trim() || null), `${r.m[r.winner]?.name} goes through`)
    if (ok) { setResult(null); load() }
  }

  // --- drawing ------------------------------------------------------------------
  const height = TOP + size * STEP + 20
  const centres = []
  for (let col = 0, list = Array.from({ length: size }, (_, i) => TOP + STEP * (i + 0.5)); col < columns; col += 1) {
    centres.push(list)
    const next = []
    for (let i = 0; i < list.length; i += 2) next.push((list[i] + list[i + 1]) / 2)
    list = next
  }

  // A plain render function, not a component: a component made inside render
  // would remount every box on each drag-over and cancel the drag.
  const renderBox = (col, i) => {
    const { id, name, bout } = boxAt(col, i)
    const side = i % 2 === 0 ? 'aka' : 'ao'
    const next = boutOf(col, i)
    const decided = next?.won
    const lost = decided && next.won !== side && id
    const won = decided && next.won === side
    const draggable = (arranging && col === 0 && !!id) || (!arranging && canScore && !!id && ready(next))
    const isPicked = arranging && col === 0 && picked === i
    const isOver = over === `${col}:${i}`
    const matchLabel = side === 'aka' && next?.matchNumber ? ` · ${next.matchNumber}${next.live ? ' · live' : ''}` : ''
    void bout
    return (
      <Box
        key={`${col}-${i}`}
        draggable={draggable}
        onDragStart={draggable ? dragStart(col, i) : undefined}
        onDragEnd={() => { setDragging(null); setOver(null) }}
        onDragOver={allowDrop(col, i)}
        onDragLeave={() => setOver(null)}
        onDrop={dropOn(col, i)}
        onClick={() => tap(col, i)}
        role="button"
        aria-label={`${side === 'aka' ? 'Aka' : 'Ao'} ${name || (col === 0 ? 'empty place' : 'to be decided')}`}
        sx={{
          position: 'absolute', left: col * BOX_W, top: centres[col][i] - BOX_H / 2, width: BOX_W, height: BOX_H,
          border: '1.5px solid', borderColor: isOver || isPicked ? 'info.main' : 'rgba(255,255,255,0.55)',
          bgcolor: isOver ? 'rgba(147,255,255,0.18)' : isPicked ? 'rgba(147,255,255,0.12)' : won ? 'rgba(76,175,80,0.18)' : 'rgba(255,255,255,0.03)',
          borderLeft: `4px solid ${side === 'aka' ? AKA : AO}`,
          cursor: draggable ? 'grab' : (arranging && col === 0) || ready(next) || decided ? 'pointer' : 'default',
          px: 0.75, pt: '1px', overflow: 'hidden', userSelect: 'none',
          opacity: lost ? 0.5 : 1,
        }}
      >
        <Typography sx={{ fontSize: 10, lineHeight: 1.1, color: 'text.secondary' }}>{side === 'aka' ? 'Aka' : 'Ao'}{matchLabel}</Typography>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: won ? 800 : 600, textDecoration: lost ? 'line-through' : 'none' }}>
          {name || (col === 0 ? (arranging ? 'bye — drop a player here' : 'bye') : '')}
        </Typography>
      </Box>
    )
  }

  const lines = []
  for (let col = 0; col < columns; col += 1) {
    for (let i = 0; i < centres[col].length; i += 2) {
      lines.push(<Box key={`l${col}-${i}`} sx={{ position: 'absolute', left: (col + 1) * BOX_W - 1, top: centres[col][i], height: centres[col][i + 1] - centres[col][i], borderLeft: '1.5px solid rgba(255,255,255,0.55)' }} />)
    }
  }
  const medalX = columns * BOX_W + 50
  // The 1st box takes the final's winner, dragged from either finalist.
  const finalCol = columns - 1
  const goldDrop = {
    onDragOver: (e) => { if (dragging?.col === finalCol && ready(final)) { e.preventDefault(); setOver('gold') } },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); const from = dragging; setDragging(null); setOver(null); if (from?.col === finalCol && ready(final)) openResult(final, from.i % 2 === 0 ? 'aka' : 'ao') },
  }
  const medalBox = (place, text, y, extra = [], drop = {}) => (
    <Box {...drop} sx={{ position: 'absolute', left: medalX, top: y, width: BOX_W + 20, minHeight: 60, border: '1.5px solid', borderColor: drop.onDrop && over === 'gold' ? 'info.main' : 'rgba(255,255,255,0.55)', bgcolor: drop.onDrop && over === 'gold' ? 'rgba(147,255,255,0.18)' : 'transparent', p: 1 }}>
      <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{place}</Typography>
      <Typography sx={{ fontWeight: 800 }}>{text || '—'}</Typography>
      {extra.map((t) => <Typography key={t} sx={{ fontWeight: 800 }}>{t}</Typography>)}
    </Box>
  )

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <HelpTitle id="bracket.board" variant="h3">Bracket</HelpTitle>
            <TextField select size="small" label="Category" value={key || ''} onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); n.set('bracket', e.target.value); return n })} sx={{ minWidth: 280 }}>
              {list.map((b) => <MenuItem key={b.divisionKey} value={b.divisionKey}>{b.label} ({b.entries})</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ToggleButtonGroup exclusive size="small" value={arranging ? 'arrange' : 'results'} onChange={(_e, v) => v && setMode(v)}>
              <ToggleButton value="arrange" disabled={!canArrange || bracket.started}>Arrange draw</ToggleButton>
              <ToggleButton value="results" disabled={!canScore}>Record results</ToggleButton>
            </ToggleButtonGroup>
            {arranging && <Button startIcon={<Undo />} disabled={!dirty} onClick={() => { setLayout(null); setPicked(null); setError(null) }}>Undo changes</Button>}
            {arranging && <Button variant="contained" startIcon={<Save />} disabled={!dirty} onClick={save}>Save draw</Button>}
            <Button startIcon={<Print />} onClick={() => printBracketSheets([{ title: String(tournament.association || tournament.organizer || tournament.name || '').toUpperCase(), event: label, ...placesFromBracket(bracket.rounds) }], `${label} — bracket sheet`)}>Print</Button>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {arranging
            ? 'Drag a player onto another place to swap them, or onto an empty place to give someone a bye. On a phone: tap one place, then another. Save when done; the bouts are rebuilt.'
            : bracket.started || !canArrange
              ? 'Drag the winner into the next box, or tap a bout, to record how it ended. Results scored on the referee console appear here too.'
              : 'Drag the winner into the next box to record a result. The draw can be rearranged until the first bout starts.'}
        </Typography>
        {dirty && <Alert severity="warning" sx={{ mt: 1 }}>Unsaved changes to the draw.</Alert>}
        {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>{error}</Alert>}
      </Paper>

      <Paper sx={{ p: 2, overflowX: 'auto' }}>
        <Box sx={{ position: 'relative', width: medalX + BOX_W + 40, height: Math.max(height, 420) + (third || medals.bronze.length > 1 ? 120 : 0) }}>
          {lines}
          {centres.map((list, col) => list.map((_, i) => renderBox(col, i)))}
          {/* The two finalists meet at the end of the tree. */}
          {medalBox(<><EmojiEvents sx={{ fontSize: 16, verticalAlign: 'text-bottom', color: '#f5c242' }} /> 1st</>, medals.gold, Math.max(40, height / 2 - 130), [], goldDrop)}
          {medalBox('2nd', medals.silver, Math.max(40, height / 2 - 130) + 90)}
          {medalBox('3rd', medals.bronze[0], Math.max(40, height / 2 - 130) + 180, medals.bronze.slice(1))}
          {third && (
            <Box sx={{ position: 'absolute', left: Math.max(0, columns - 1) * BOX_W, top: height + 10 }}>
              <Typography sx={{ mb: 0.5 }}>3rd/4th Place {third.matchNumber ? `· ${third.matchNumber}` : ''}</Typography>
              {['aka', 'ao'].map((side) => (
                <Box key={side} onClick={() => (ready(third) || third.won) && openResult(third, third.won || side)}
                  sx={{ width: BOX_W, height: BOX_H, mb: 0.5, px: 0.75, border: '1.5px solid rgba(255,255,255,0.55)', borderLeft: `4px solid ${side === 'aka' ? AKA : AO}`, cursor: ready(third) || third.won ? 'pointer' : 'default', opacity: third.won && third.won !== side ? 0.5 : 1 }}>
                  <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{side === 'aka' ? 'Aka' : 'Ao'}</Typography>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: third.won === side ? 800 : 600 }}>{third[side]?.name || ''}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Paper>

      <Dialog open={!!result} onClose={() => setResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{result?.m.won ? 'Correct result' : 'Record result'} — {result?.m.matchNumber} {result?.m.thirdPlace ? '(3rd/4th place)' : ''}</DialogTitle>
        <DialogContent>
          {result?.m.won && <Alert severity="warning" sx={{ mb: 2 }}>This bout is already decided. A correction needs a reason and is recorded in the audit log (Rule 6).</Alert>}
          <Typography variant="body2" color="text.secondary">Who won?</Typography>
          <RadioGroup row value={result?.winner || 'aka'} onChange={(e) => setResult({ ...result, winner: e.target.value })}>
            <FormControlLabel value="aka" control={<Radio sx={{ color: AKA }} />} label={<><Chip size="small" label="AKA" sx={{ bgcolor: AKA, color: '#fff', mr: 1 }} />{result?.m.aka?.name}</>} />
            <FormControlLabel value="ao" control={<Radio sx={{ color: AO }} />} label={<><Chip size="small" label="AO" sx={{ bgcolor: AO, color: '#fff', mr: 1 }} />{result?.m.ao?.name}</>} />
          </RadioGroup>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="How it ended" value={result?.resultType || 'COMPLETED'} onChange={(e) => setResult({ ...result, resultType: e.target.value })}>
                {Object.entries(RESULT_TYPE_LABEL).filter(([k]) => k !== 'CANCELLED').map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth type="number" label="AKA points" value={result?.aka ?? ''} onChange={(e) => setResult({ ...result, aka: e.target.value })} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth type="number" label="AO points" value={result?.ao ?? ''} onChange={(e) => setResult({ ...result, ao: e.target.value })} /></Grid>
            {result && result.resultType !== 'COMPLETED' && (
              <Grid size={{ xs: 12 }}><TextField fullWidth required label="Finish reason" placeholder="e.g. AO did not report after three calls" value={result.finishReason} onChange={(e) => setResult({ ...result, finishReason: e.target.value })} /></Grid>
            )}
            {result?.m.won && (
              <Grid size={{ xs: 12 }}><TextField fullWidth required label="Reason for the correction" value={result.reason} onChange={(e) => setResult({ ...result, reason: e.target.value })} /></Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResult(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveResult}
            disabled={action.busy || (result && ((result.resultType !== 'COMPLETED' && !result.finishReason.trim()) || (result.m.won && !result.reason.trim())))}>
            Save result
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
