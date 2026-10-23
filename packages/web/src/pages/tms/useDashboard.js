import { useCallback, useEffect, useRef, useState } from 'react'
import { onRequest } from '../../data/http'
import { tms } from '../../data/tms'

// After a save: wait for the burst to settle (an "approve all" is many saves).
const SETTLE_MS = 400

/**
 * A tournament's dashboard numbers, loaded once for the whole tournament
 * screen: the guide bar under the tabs and the Dashboard tab read the same
 * copy (KAN-368). Loaded once the tournament has, again when it reloads, and once after
 * a burst of saves, since a save can fix a problem or make one; a reload
 * that already ran after the saves is not repeated.
 */
export default function useDashboard(tid, version) {
  const [dashboard, setDashboard] = useState(null)
  const loads = useRef(0)
  const load = useCallback(() => {
    loads.current += 1
    return tms.dashboard(tid).then(setDashboard).catch(() => setDashboard({}))
  }, [tid])

  // Version 0 is before the tournament has loaded: nothing to show yet.
  useEffect(() => { if (version) load() }, [load, version])
  useEffect(() => {
    let timer = null
    const off = onRequest(({ method }) => (method === 'GET' ? null : () => {
      clearTimeout(timer)
      const seen = loads.current
      timer = setTimeout(() => { if (loads.current === seen) load() }, SETTLE_MS)
    }))
    return () => { off(); clearTimeout(timer) }
  }, [load])

  return dashboard
}
