import { useEffect, useRef, useState } from 'react'
import { Popper, Paper, Typography } from '@mui/material'
import { useLocation } from 'react-router-dom'
import { explainAction } from '../../help/actions'

// Anything a person can press: buttons, icon buttons, toggles, tabs, menu
// actions, and the column headers that sort a table.
const ACTIONABLE = 'button, [role="button"], [role="tab"], [role="menuitem"], a.MuiButton-root, a.MuiIconButton-root'
const SHOW_AFTER_MS = 450
// Hall screens are watched, not used: no tooltips over a scoreboard.
const QUIET_SCREENS = ['/display', '/live']

const labelOf = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()
const isDisabled = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('Mui-disabled')

/**
 * What the tooltip for an action says: { title, tip, needs, disabled }, or
 * null when it has nothing to add. An explicit `data-tip` on the element
 * wins; otherwise the label is looked up in help/actions.js.
 */
export function describeAction(el) {
  // The ⓘ help icons, and anything else with a tooltip of its own, keep theirs.
  if (el.hasAttribute('data-mui-internal-clone-element') || el.getAttribute('title')) return null
  const label = labelOf(el)
  const own = el.getAttribute('data-tip')
  let entry = own ? { tip: own } : null
  if (!entry && el.classList.contains('MuiTableSortLabel-root') && label) entry = { tip: `Sorts the list by ${label}. Press again to reverse the order.` }
  if (!entry) entry = explainAction(label)
  // An icon with a name but no explanation still says what it is.
  if (!entry && label && !el.textContent.trim()) entry = { tip: label }
  if (!entry) return null
  const disabled = isDisabled(el)
  return {
    title: label && label !== entry.tip ? label : null,
    tip: entry.tip,
    needs: disabled ? (el.getAttribute('data-tip-needs') || entry.needs || null) : null,
    disabled,
  }
}

/**
 * One tooltip for every action in the app, so none goes without an
 * explanation: on hover (after a moment) and on keyboard focus, it says what
 * the action does, and for a disabled one what has to happen first. Not on
 * touch screens, where a press is a press.
 */
export default function ActionTips() {
  const { pathname } = useLocation()
  const [shown, setShown] = useState(null) // { el, info }
  const target = useRef(null)
  const timer = useRef(null)
  const quiet = QUIET_SCREENS.includes(pathname)

  useEffect(() => {
    if (quiet) return undefined
    const hide = () => {
      clearTimeout(timer.current)
      target.current = null
      setShown(null)
    }
    const show = (el, delay, { hovered = true } = {}) => {
      clearTimeout(timer.current)
      target.current = el
      timer.current = setTimeout(() => {
        // Only if the pointer is still on it (the page may have scrolled away).
        if (target.current !== el || !el.isConnected || (hovered && !el.matches(':hover'))) return
        const info = describeAction(el)
        setShown(info ? { el, info } : null)
      }, delay)
    }
    const onOver = (e) => {
      if (e.pointerType === 'touch') return
      const el = e.target.closest?.(ACTIONABLE)
      if (!el) { if (target.current) hide(); return }
      if (el !== target.current) show(el, SHOW_AFTER_MS)
    }
    const onOut = (e) => {
      // Still inside the same action (between its icon and its text).
      if (target.current && e.relatedTarget && target.current.contains(e.relatedTarget)) return
      hide()
    }
    const onFocus = (e) => {
      const el = e.target.closest?.(ACTIONABLE)
      // Keyboard focus only: a mouse click focuses too, and has its own hover.
      if (el && el.matches(':focus-visible')) show(el, 0, { hovered: false })
    }
    const onKey = (e) => { if (e.key === 'Escape') hide() }
    // Scrolling moves the page under the pointer: drop a tooltip whose action is no longer under it.
    const onScroll = () => { if (target.current && !target.current.matches(':hover') && !target.current.matches(':focus-visible')) hide() }
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', hide)
    // Pressing the button hides its tooltip.
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [quiet])

  if (!shown) return null
  const { el, info } = shown
  return (
    <Popper
      open
      anchorEl={el}
      placement="top"
      modifiers={[{ name: 'offset', options: { offset: [0, 8] } }, { name: 'preventOverflow', options: { padding: 8 } }]}
      sx={{ zIndex: (t) => t.zIndex.tooltip, pointerEvents: 'none', maxWidth: 340 }}
    >
      <Paper role="tooltip" elevation={8} sx={{ px: 1.5, py: 1, bgcolor: '#14181c', border: '1px solid', borderColor: 'rgba(255,255,255,0.18)' }}>
        {info.title && <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'info.light', mb: 0.25 }}>{info.title}</Typography>}
        <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.45 }}>{info.tip}</Typography>
        {info.disabled && (
          <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.45, mt: 0.5, color: 'warning.light' }}>
            {info.needs ? `Not available now: ${info.needs}` : 'Not available right now.'}
          </Typography>
        )}
      </Paper>
    </Popper>
  )
}
