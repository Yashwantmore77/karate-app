import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Box, CircularProgress, LinearProgress, Typography } from '@mui/material'
import { getInFlight, getWrites, onActivity, onRequest } from '../data/http'

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
const BUTTON_AFTER_MS = 120
// A request this soon after a click (or a form submit) was asked for by that button.
const CLICK_WINDOW_MS = 1000
const BUTTONS = '.MuiButton-root, .MuiIconButton-root, .MuiFab-root, .MuiToggleButton-root, .MuiListItemButton-root, .MuiMenuItem-root, button:not([role="tab"])'

/**
 * Puts a spinner on the button that started a request, until every request
 * it started has finished. It works for any button in the app, so no screen
 * has to remember to; it also stops a second click sending the request twice.
 * The busy state lives in data attributes React does not manage, so a
 * re-render never wipes it.
 */
export function trackButtonRequests(doc = document) {
  let last = null
  const remember = (el) => { if (el) last = { el, at: Date.now() } }
  const onClick = (e) => remember(e.target?.closest?.(BUTTONS))
  const onSubmit = (e) => remember(e.submitter || e.target?.querySelector?.('[type="submit"]'))
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('submit', onSubmit, true)
  const off = onRequest(() => {
    if (!last || Date.now() - last.at > CLICK_WINDOW_MS || !last.el.isConnected) return null
    const el = last.el
    el.dataset.ktPending = String(Number(el.dataset.ktPending || 0) + 1)
    // The label's colour now, before the button greys out as disabled.
    const color = getComputedStyle(el).color
    // Quick answers never flicker: the spinner shows only if it takes a moment.
    const timer = setTimeout(() => {
      if (!el.dataset.ktPending) return
      el.style.setProperty('--kt-busy-color', color)
      el.setAttribute('data-kt-busy', '')
      el.setAttribute('aria-busy', 'true')
    }, BUTTON_AFTER_MS)
    return () => {
      const left = Number(el.dataset.ktPending || 1) - 1
      if (left > 0) { el.dataset.ktPending = String(left); return }
      clearTimeout(timer)
      delete el.dataset.ktPending
      el.removeAttribute('data-kt-busy')
      el.removeAttribute('aria-busy')
    }
  })
  return () => {
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('submit', onSubmit, true)
    off()
  }
}

// Hall screens are watched, not used: no loading spinner over a scoreboard.
const QUIET_SCREENS = ['/display', '/live']

/**
 * While the server is being asked for something: a bar across the top and a
 * spinner saying "Loading…" or "Saving…", and a spinner on the button that
 * asked. Waits a moment before showing, so quick answers never flicker.
 */
export function GlobalProgress() {
  const { pathname } = useLocation()
  const [activity, setActivity] = useState({ busy: getInFlight() > 0, saving: getWrites() > 0 })
  const [shown, setShown] = useState(false)
  useEffect(() => onActivity((n, w) => setActivity({ busy: n > 0, saving: w > 0 })), [])
  useEffect(() => trackButtonRequests(), [])
  useEffect(() => {
    if (!activity.busy) { setShown(false); return undefined }
    const id = setTimeout(() => setShown(true), SHOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [activity.busy])
  if (!shown || QUIET_SCREENS.includes(pathname)) return null
  return (
    <>
      <LinearProgress aria-hidden sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.tooltip + 1, height: 3 }} />
      <Box role="status" aria-live="polite" sx={{
        position: 'fixed', bottom: 16, left: 16, zIndex: (t) => t.zIndex.tooltip + 1, display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 0.75, borderRadius: 999, bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: 3, pointerEvents: 'none',
      }}>
        <CircularProgress size={16} thickness={5} />
        <Typography variant="body2">{activity.saving ? 'Saving…' : 'Loading…'}</Typography>
      </Box>
    </>
  )
}
