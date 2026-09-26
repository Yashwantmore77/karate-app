import { useEffect, useRef } from 'react'
import { Box, useMediaQuery } from '@mui/material'
import { AO, AKA, CYAN, INK } from '../theme/tokens'

const SPOTLIGHT_SIZE = 900 // px, generous enough that the fade edge is offscreen

/**
 * The backdrop every screen sits on: the two sides of a mat bled into the
 * dark, a faint grid, and a spotlight that follows the pointer.
 *
 * `fill` centres a single panel (the sign-in screen). Otherwise the stage
 * scrolls with the page it wraps.
 */
export default function AppStage({ children, fill = false }) {
  const spotlightRef = useRef(null)
  const raf = useRef(0)
  const stillness = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    if (stillness) return undefined

    // The spotlight's gradient is static; only its position moves, and only
    // via `transform`. That keeps every frame compositor-only (GPU), instead
    // of the previous approach — a custom property driving a `background`
    // repaint of a full-viewport layer on every raw pointermove event — which
    // is what made the whole page feel laggy while the mouse moved.
    let pending = null

    const apply = () => {
      raf.current = 0
      const el = spotlightRef.current
      if (!el || !pending) return
      const x = pending.x - SPOTLIGHT_SIZE / 2
      const y = pending.y - SPOTLIGHT_SIZE / 2
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }

    const onMove = (e) => {
      // clientX/Y are already viewport-relative, matching these `position:
      // fixed` layers, so no getBoundingClientRect() — that forces a
      // synchronous layout read on every single mousemove event.
      pending = { x: e.clientX, y: e.clientY }
      if (!raf.current) raf.current = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [stillness])

  const drift = stillness ? 'none' : 'drift 18s ease-in-out infinite alternate'

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        bgcolor: INK,
        overflow: fill ? 'hidden' : 'visible',
        ...(fill && { display: 'grid', placeItems: 'center', px: 2 }),
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
        filter: 'blur(40px)', animation: drift, willChange: 'transform', pointerEvents: 'none',
      }} />
      <Box aria-hidden sx={{
        position: 'fixed', width: '58vmax', height: '58vmax', right: '-16vmax', bottom: '-16vmax',
        background: `radial-gradient(circle, ${AKA}bb 0%, ${AKA}00 62%)`,
        filter: 'blur(40px)', animation: drift, animationDelay: '-9s', willChange: 'transform', pointerEvents: 'none',
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
      {!stillness && (
        <Box
          ref={spotlightRef}
          aria-hidden
          sx={{
            position: 'fixed', top: 0, left: 0,
            width: SPOTLIGHT_SIZE, height: SPOTLIGHT_SIZE,
            pointerEvents: 'none',
            willChange: 'transform',
            transform: 'translate3d(-450px, -450px, 0)',
            background: `radial-gradient(circle, ${CYAN}16, transparent 70%)`,
          }}
        />
      )}

      <Box sx={{ position: 'relative', ...(fill && { width: '100%', maxWidth: 440 }) }}>
        {children}
      </Box>
    </Box>
  )
}
