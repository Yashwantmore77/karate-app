import { useState } from 'react'
import { Paper, Stack, Typography, Button, Grid, List, ListItem, ListItemText, Chip, Alert } from '@mui/material'
import { Add, Print, CheckCircle, LockOpen } from '@mui/icons-material'
import { poolName } from '@kumite/shared/pools.js'
import { tms } from '../../data/tms'
import ConfirmDialog from '../../components/tms/ConfirmDialog'
import DrawSheet from './DrawSheet'

const layoutOf = (pools) => pools.map((p) => ({ id: p.id, playerIds: p.playerIds }))
const sameLayout = (a, b) => a.length === b.length && a.every((p, i) => p.id === b[i].id && p.playerIds.join() === b[i].playerIds.join())
const bouts = (n) => (n * (n - 1)) / 2

/**
 * One drawn category on the Draw tab. Players are dragged between pools (or
 * tapped, then "Move here" on the pool they go to); Add pool makes an empty
 * one. A knockout category shows its sheet instead, where players are
 * dragged between the Aka / Ao boxes. Nothing is saved until Save or
 * Confirm, and Confirm also makes the category final and creates its
 * matches. A confirmed category is reopened with a reason.
 */
export default function PoolBoard({ tid, division, pools, nameOf, teamOf, maxSize, thirdPlace, drawLocked, action, onChanged, onPrint }) {
  const saved = layoutOf(pools)
  const [draft, setDraft] = useState(null)
  // A knockout category's sheet: first-round places, AKA then AO, null for a bye.
  const sheet = pools.length === 1 && pools[0].poolSystem === 'knockout' && Array.isArray(pools[0].places) ? pools[0].places : null
  const [sheetDraft, setSheetDraft] = useState(null)
  const places = sheetDraft || sheet
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [picked, setPicked] = useState(null)
  const [asking, setAsking] = useState(null)

  const layout = draft || saved
  const kept = layout.filter((p) => p.playerIds.length)
  const changed = sheet ? !!sheetDraft && sheetDraft.join() !== sheet.join() : !!draft && !sameLayout(kept, saved)
  const confirmed = pools.length > 0 && pools.every((p) => p.confirmedAt)
  const knockout = pools[0]?.poolSystem === 'knockout'
  const editable = !confirmed && !drawLocked
  const emptyBout = !!sheet && places.some((id, i) => i % 2 === 0 && !id && !places[i + 1])
  const lonely = !sheet && kept.some((p) => p.playerIds.length < 2)
  const overMax = !sheet && kept.some((p) => p.playerIds.length > maxSize)
  const blocked = lonely || emptyBout
  const needs = lonely ? 'Every pool needs at least two players, or none.' : emptyBout ? 'Every first-round bout needs at least one player.' : undefined
  const firstBouts = sheet ? places.filter((id, i) => i % 2 === 0 && id && places[i + 1]).length : 0

  const move = (playerId, from, to) => {
    if (from === to) return
    const next = layout.map((p) => ({ ...p, playerIds: p.playerIds.filter((id) => id !== playerId) }))
    next[to] = { ...next[to], playerIds: [...next[to].playerIds, playerId] }
    setDraft(next)
    setPicked(null)
  }
  const sent = () => layout.map(({ id, playerIds }) => (id ? { id, playerIds } : { playerIds }))
  const discard = () => { setDraft(null); setSheetDraft(null); setPicked(null) }
  const done = () => { discard(); onChanged() }
  const swap = (a, b) => {
    const next = [...places]
    ;[next[a], next[b]] = [next[b], next[a]]
    setSheetDraft(next)
  }

  const save = async (reason) => {
    setAsking(null)
    const ok = await action.run(() => (sheet ? tms.arrangeSheet(tid, division.key, places) : tms.arrangePools(tid, division.key, sent(), { reason, force: overMax })), sheet ? 'Sheet saved' : 'Pools saved')
    if (ok) done()
  }
  const confirm = async (reason) => {
    setAsking(null)
    const edited = sheet ? (sheetDraft ? { places } : {}) : (draft ? { pools: sent() } : {})
    const ok = await action.run(() => tms.confirmPools(tid, division.key, { ...edited, reason, force: overMax }),
      (r) => `${division.label} confirmed: ${r.created} match${r.created === 1 ? '' : 'es'} created${r.drawLocked ? '. Every category is confirmed, so the draw is now locked' : ''}`)
    if (ok) done()
  }
  const reopen = async (reason) => {
    setAsking(null)
    const ok = await action.run(() => tms.reopenPools(tid, division.key, reason), `${division.label} reopened: its pools can be changed again`)
    if (ok) done()
  }

  const dropOn = (to) => (e) => {
    e.preventDefault()
    if (dragging) move(dragging.playerId, dragging.from, to)
    setDragging(null)
    setOver(null)
  }
  const confirmText = sheet
    ? `Its sheet becomes final and its ${firstBouts} first-round bout${firstBouts === 1 ? ' is' : 's are'} made now; the winners move on as results come in.`
    : knockout
      ? 'Its list becomes final and its bracket is made now.'
      : `Its pools become final and its ${kept.reduce((n, p) => n + bouts(p.playerIds.length), 0)} matches are made now.`

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h3">{division.label}</Typography>
          {confirmed && <Chip size="small" color="success" icon={<CheckCircle />} label="Confirmed" />}
          {changed && <Chip size="small" color="warning" variant="outlined" label="Not saved" />}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {editable && !knockout && <Button size="small" startIcon={<Add />} onClick={() => setDraft([...layout, { id: null, playerIds: [] }])}
            data-tip="Adds an empty pool to this category. Drag players into it; an empty pool is dropped when you save.">Add pool</Button>}
          {editable && (draft || sheetDraft) && <Button size="small" onClick={discard} data-tip="Puts the draw back as it was saved.">Discard</Button>}
          {editable && changed && <Button size="small" variant="outlined" disabled={blocked} onClick={() => setAsking('save')}
            data-tip="Saves this draw without confirming it. You can still change it, and no matches are made." data-tip-needs={needs}>{sheet ? 'Save sheet' : 'Save pools'}</Button>}
          {editable && <Button size="small" variant="contained" disabled={blocked} onClick={() => setAsking('confirm')}
            data-tip="Saves these pools, makes them final and creates this category's matches. The other categories stay open." data-tip-needs={needs}>Confirm</Button>}
          {confirmed && <Button size="small" color="warning" startIcon={<LockOpen />} disabled={drawLocked} onClick={() => setAsking('reopen')}
            data-tip="Deletes this category's unplayed matches so its pools can be changed again. Needs a reason."
            data-tip-needs={drawLocked ? 'Unlock the draw on the Dashboard first.' : undefined}>Reopen</Button>}
          <Button size="small" variant="outlined" startIcon={<Print />} onClick={onPrint}>Print draw sheet</Button>
        </Stack>
      </Stack>
      {editable && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {sheet
            ? <>Drag a player onto another box to swap them, or onto an empty box to give a bye. On a tablet, tap one box and then another. Nothing is saved until you click Save sheet or Confirm.</>
            : <>Drag a player to another pool, or tap the player and then <b>Move here</b> on the pool. Nothing is saved until you click Save pools or Confirm.</>}
        </Typography>
      )}
      {confirmed && <Alert severity="success" sx={{ mb: 1 }}>Confirmed: this category's matches are on the Matches tab{sheet ? ', and its bracket on the Bracket tab' : ''}.</Alert>}
      {emptyBout && <Alert severity="error" sx={{ mb: 1 }}>A first-round bout has nobody in it. Move a player into it.</Alert>}
      {sheet && <DrawSheet places={places} nameOf={nameOf} teamOf={teamOf} editable={editable} onSwap={swap} thirdPlace={thirdPlace} />}
      {!sheet && <Grid container spacing={2}>
        {layout.map((pool, index) => {
          const n = pool.playerIds.length
          const target = editable && (dragging ? dragging.from !== index : picked && picked.from !== index)
          return (
            <Grid key={pool.id || `new-${index}`} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Paper variant="outlined" data-testid={`pool-${poolName(index)}`}
                onDragOver={(e) => { if (target) { e.preventDefault(); setOver(index) } }}
                onDragLeave={() => setOver(null)}
                onDrop={dropOn(index)}
                sx={{ p: 1.5, height: '100%', borderColor: over === index ? 'info.main' : undefined, bgcolor: over === index ? 'action.hover' : undefined }}>
                <Typography variant="h4">Pool {poolName(index)} <Typography component="span" color="text.secondary">({n})</Typography></Typography>
                {n === 0 && <Typography variant="body2" color="text.secondary">Empty: drag players here, or it is dropped when you save.</Typography>}
                {n === 1 && <Typography variant="body2" color="error.main">Needs at least two players.</Typography>}
                {n > maxSize && <Typography variant="body2" color="warning.main">Over the maximum of {maxSize}: saving asks for a reason.</Typography>}
                <List dense>
                  {pool.playerIds.map((id) => (
                    <ListItem key={id} disableGutters draggable={editable}
                      onDragStart={editable ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDragging({ playerId: id, from: index }) } : undefined}
                      onDragEnd={() => { setDragging(null); setOver(null) }}
                      onClick={editable ? () => setPicked(picked?.playerId === id ? null : { playerId: id, from: index }) : undefined}
                      sx={{ px: 0.5, borderRadius: 1, cursor: editable ? 'grab' : 'default', bgcolor: picked?.playerId === id ? 'action.selected' : undefined }}>
                      <ListItemText primary={nameOf(id)} secondary={teamOf(id)} />
                    </ListItem>
                  ))}
                </List>
                {editable && picked && picked.from !== index && (
                  <Button size="small" variant="outlined" onClick={() => move(picked.playerId, picked.from, index)}
                    data-tip="Moves the player you tapped into this pool.">Move here</Button>
                )}
              </Paper>
            </Grid>
          )
        })}
      </Grid>}

      <ConfirmDialog open={asking === 'save'} title={`Save the ${sheet ? 'sheet' : 'pools'} of ${division.label}?`} confirmLabel={sheet ? 'Save sheet' : 'Save pools'}
        message={overMax ? `A pool has more than ${maxSize} players. Say why; it is kept in the audit log.` : `The ${sheet ? 'sheet is' : 'pools are'} saved. You can still change ${sheet ? 'it' : 'them'}; no matches are made yet.`}
        requireReason={overMax} onClose={() => setAsking(null)} onConfirm={save} />
      <ConfirmDialog open={asking === 'confirm'} title={`Confirm ${division.label}?`} confirmLabel="Confirm"
        message={`${confirmText} The other categories stay open.${overMax ? ` A pool has more than ${maxSize} players: say why; it is kept in the audit log.` : ''}`}
        requireReason={overMax} onClose={() => setAsking(null)} onConfirm={confirm} />
      <ConfirmDialog open={asking === 'reopen'} title={`Reopen ${division.label}?`} confirmLabel="Reopen" danger requireReason reasonLabel="Reason"
        message="Its unplayed matches are deleted and its pools can be changed again. Not possible once a bout has a result."
        onClose={() => setAsking(null)} onConfirm={reopen} />
    </Paper>
  )
}
