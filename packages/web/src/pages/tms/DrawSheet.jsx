import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import { EmojiEvents } from '@mui/icons-material'
import { BOX_W, BOX_H, AKA, AO, boardHeight, boardCentres } from '../../components/tms/bracketBoard'

const LINE = 'rgba(255,255,255,0.55)'

/**
 * A knockout category's sheet before it is confirmed, drawn like the paper
 * draw sheet and the Bracket tab: the players in the first-round AKA / AO
 * boxes, the later rounds still empty, then 1st / 2nd / 3rd and, when it is
 * played, the 3rd/4th place bout. Drag a player onto another box to swap
 * them, or onto an empty box (a bye); on a tablet tap one box, then another.
 */
export default function DrawSheet({ places, nameOf, teamOf, editable, onSwap, thirdPlace }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [picked, setPicked] = useState(null)
  const size = places.length
  const columns = Math.log2(size)
  const height = boardHeight(size)
  const centres = boardCentres(size)
  const medalX = columns * BOX_W + 50

  const swap = (a, b) => {
    setPicked(null)
    if (a !== b) onSwap(a, b)
  }
  const tap = (i) => {
    if (!editable) return
    if (picked == null) setPicked(i)
    else swap(picked, i)
  }

  // A plain render function, not a component, so a drag-over does not remount the boxes.
  const box = (col, i) => {
    const side = i % 2 === 0 ? 'aka' : 'ao'
    const id = col === 0 ? places[i] : null
    const first = col === 0
    const isOver = first && over === i
    const isPicked = first && picked === i
    return (
      <Box key={`${col}-${i}`} data-testid={first ? `place-${i}` : undefined}
        draggable={first && editable && !!id}
        onDragStart={first && editable && id ? (e) => { setDragging(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) } : undefined}
        onDragEnd={() => { setDragging(null); setOver(null) }}
        onDragOver={first && editable ? (e) => { if (dragging != null && dragging !== i) { e.preventDefault(); setOver(i) } } : undefined}
        onDragLeave={() => setOver(null)}
        onDrop={first && editable ? (e) => { e.preventDefault(); if (dragging != null) swap(dragging, i); setDragging(null); setOver(null) } : undefined}
        onClick={first ? () => tap(i) : undefined}
        role={first && editable ? 'button' : undefined}
        aria-label={first ? `${side === 'aka' ? 'Aka' : 'Ao'} ${id ? nameOf(id) : 'empty place (bye)'}` : undefined}
        sx={{
          position: 'absolute', left: col * BOX_W, top: centres[col][i] - BOX_H / 2, width: BOX_W, height: BOX_H,
          border: '1.5px solid', borderColor: isOver || isPicked ? 'info.main' : LINE,
          bgcolor: isOver ? 'rgba(147,255,255,0.18)' : isPicked ? 'rgba(147,255,255,0.12)' : 'rgba(255,255,255,0.03)',
          borderLeft: `4px solid ${side === 'aka' ? AKA : AO}`,
          cursor: first && editable ? (id ? 'grab' : 'pointer') : 'default',
          px: 0.75, pt: '1px', overflow: 'hidden', userSelect: 'none',
        }}>
        <Typography sx={{ fontSize: 10, lineHeight: 1.1, color: 'text.secondary' }}>{side === 'aka' ? 'Aka' : 'Ao'}{first && id && teamOf(id) ? ` · ${teamOf(id)}` : ''}</Typography>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: id ? 'text.primary' : 'text.secondary' }}>
          {first ? (id ? nameOf(id) : (editable ? 'bye — drop a player here' : 'bye')) : ''}
        </Typography>
      </Box>
    )
  }

  const lines = []
  for (let col = 0; col < columns; col += 1) {
    for (let i = 0; i < centres[col].length; i += 2) {
      lines.push(<Box key={`l${col}-${i}`} sx={{ position: 'absolute', left: (col + 1) * BOX_W - 1, top: centres[col][i], height: centres[col][i + 1] - centres[col][i], borderLeft: `1.5px solid ${LINE}` }} />)
    }
  }
  const medalTop = Math.max(40, height / 2 - 130)
  const medal = (place, y) => (
    <Box sx={{ position: 'absolute', left: medalX, top: y, width: BOX_W + 20, minHeight: 60, border: `1.5px solid ${LINE}`, p: 1 }}>
      <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{place}</Typography>
    </Box>
  )

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ position: 'relative', width: medalX + BOX_W + 40, height: Math.max(height, 300) + (thirdPlace ? 120 : 0) }}>
        {lines}
        {centres.map((list, col) => list.map((_, i) => box(col, i)))}
        {medal(<><EmojiEvents sx={{ fontSize: 16, verticalAlign: 'text-bottom', color: '#f5c242' }} /> 1st</>, medalTop)}
        {medal('2nd', medalTop + 90)}
        {medal('3rd', medalTop + 180)}
        {thirdPlace && (
          <Box sx={{ position: 'absolute', left: Math.max(0, columns - 1) * BOX_W, top: height + 10 }}>
            <Typography sx={{ mb: 0.5 }}>3rd/4th Place</Typography>
            {['aka', 'ao'].map((side) => (
              <Box key={side} sx={{ width: BOX_W, height: BOX_H, mb: 0.5, px: 0.75, border: `1.5px solid ${LINE}`, borderLeft: `4px solid ${side === 'aka' ? AKA : AO}` }}>
                <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{side === 'aka' ? 'Aka' : 'Ao'}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
