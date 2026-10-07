import { useEffect, useState } from 'react'

// The browser offers installation once (beforeinstallprompt); it is kept
// here so a button can show it when the person asks. Gone once installed.
let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    listeners.forEach((fn) => fn(true))
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((fn) => fn(false))
  })
}

/** { canInstall, install } for an "Install app" button. */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferred)
  useEffect(() => {
    listeners.add(setCanInstall)
    return () => listeners.delete(setCanInstall)
  }, [])
  const install = async () => {
    if (!deferred) return false
    deferred.prompt()
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }))
    if (outcome === 'accepted') { deferred = null; setCanInstall(false) }
    return outcome === 'accepted'
  }
  return { canInstall, install }
}
