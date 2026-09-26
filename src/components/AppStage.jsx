import { useRef } from 'react'
import { Box, useMediaQuery } from '@mui/material'
import { AO, AKA, CYAN, INK } from '../theme/tokens'

/**
 * The backdrop every screen sits on: the two sides of a mat bled into the
 * dark, a faint grid, and a spotlight that follows the pointer.
 *
 * `fill` centres a single panel (the sign-in screen). Otherwise the stage
 * scrolls with the page it wraps.
 */
export default function AppStage({ children, fill = false }) {
  const stageRef = useRef(null)
  const stillness = useMediaQuery('(prefers-reduced-motion: reduce)')

  // Written straight to CSS variables: pointer moves fire far too often to put
  // through React state.
  const trackPointer = (e) => {
    const el = stageRef.current
    if (!el || stillness) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--px', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--py', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }

  const drift = stillness ? 'none' : 'drift 18s ease-in-out infinite alternate'

  return (
    <Box
      ref={stageRef}
      onPointerMove={trackPointer}
      sx={{
        position: 'relative',
        minHeight: '100vh',
        bgcolor: INK,
        overflow: fill ? 'hidden' : 'visible',
        ...(fill && { display: 'grid', placeItems: 'center', px: 2 }),
        '--px': '50%',
        '--py': '30%',
        '@keyframes drift': {
          from: { transform: 'translate3d(0,0,0) scale(1)' },
          to: { transform: 'translate3d(0,-6%,0) scale(1.15)' },
        },
        '@keyframes sweep': {
          from: { backgroundPosition: '0% 50%' },
          to: { backgroundPosition: '200% 50%' },
        },
        '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
      }}
    >
      <Box aria-hidden sx={{
        position: 'fixed', width: '62vmax', height: '62vmax', left: '-18vmax', top: '-14vmax',
        background: `radial-gradient(circle, ${AO}bb 0%, ${AO}00 62%)`,
        filter: 'blur(40px)', animation: drift, pointerEvents: 'none',
      }} />
      <Box aria-hidden sx={{
        position: 'fixed', width: '58vmax', height: '58vmax', right: '-16vmax', bottom: '-16vmax',
        background: `radial-gradient(circle, ${AKA}bb 0%, ${AKA}00 62%)`,
        filter: 'blur(40px)', animation: drift, animationDelay: '-9s', pointerEvents: 'none',
      }} />
      <Box aria-hidden sx={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse at 50% 30%, #000 15%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, #000 15%, transparent 75%)',
      }} />
      <Box aria-hidden sx={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(520px circle at var(--px) var(--py), ${CYAN}16, transparent 70%)`,
        transition: 'background 120ms linear',
      }} />

      <Box sx={{ position: 'relative', ...(fill && { width: '100%', maxWidth: 440 }) }}>
        {children}
      </Box>
    </Box>
  )
}
