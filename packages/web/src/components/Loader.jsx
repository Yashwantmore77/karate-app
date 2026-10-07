import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Box, CircularProgress, LinearProgress, Typography } from '@mui/material'
import { getInFlight, onActivity } from '../data/http'

/** A screen's first load: a spinner where the content will be. */
export function PageLoader({ label = 'Loading…', minHeight = 240 }) {
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, minHeight, py: 4 }}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  )
}

/**
 * Wraps a screen's loads. `loading` is true until the first one settles (show
 * a PageLoader or an empty table's spinner); `refreshing` is true while a
 * later one runs (a thin bar, so the content stays put).
 */
export function useLoading() {
  const [state, setState] = useState({ loading: true, refreshing: false })
  const loaded = useRef(false)
  const pending = useRef(0)
  const wrap = useCallback((promise) => {
    pending.current += 1
    setState({ loading: !loaded.current, refreshing: loaded.current })
    return Promise.resolve(promise).finally(() => {
      pending.current -= 1
      loaded.current = true
      if (!pending.current) setState({ loading: false, refreshing: false })
    })
  }, [])
  return { ...state, wrap }
}

const SHOW_AFTER_MS = 250

/**
 * The bar across the top of the app while the server is being asked for
 * something. Waits a moment before showing, so quick answers never flicker.
 */
// Hall screens are watched, not used: no loading bar over a scoreboard.
const QUIET_SCREENS = ['/display', '/live']

export function GlobalProgress() {
  const { pathname } = useLocation()
  const [busy, setBusy] = useState(getInFlight() > 0)
  const [shown, setShown] = useState(false)
  useEffect(() => onActivity((n) => setBusy(n > 0)), [])
  useEffect(() => {
    if (!busy) { setShown(false); return undefined }
    const id = setTimeout(() => setShown(true), SHOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [busy])
  if (!shown || QUIET_SCREENS.includes(pathname)) return null
  return <LinearProgress aria-label="Loading" sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.tooltip + 1, height: 3 }} />
}
