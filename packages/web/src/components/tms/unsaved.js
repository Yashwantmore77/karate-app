import { useEffect } from 'react'

// Changes on screen that are not saved yet (a draw being rearranged).
// Closing or reloading the page, or leaving the tab, would drop them, so the
// browser and the tournament screen ask first.
const pending = new Set()

/** Holds the page while `dirty` is true: the browser asks before it is closed or reloaded. */
export function useUnsaved(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    const token = {}
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    pending.add(token)
    window.addEventListener('beforeunload', warn)
    return () => { pending.delete(token); window.removeEventListener('beforeunload', warn) }
  }, [dirty])
}

/** Whether anything on screen holds unsaved changes. */
export const hasUnsaved = () => pending.size > 0
