import { useCallback, useEffect, useState } from 'react'
import { publicSocket } from '../data/channel/socket'

/**
 * The live score of bouts on the mats (KAN-428), as each mat's scoreboard is
 * pushed over the public channel: no requests of its own. `scoreOf(bout)` is
 * the latest pushed row showing that bout, or the bout's own `scoreboard`
 * from the last page load until one arrives; null once its scoreboard closes.
 */
export function useMatScoreboards() {
  const [rows, setRows] = useState({})
  useEffect(() => {
    const sock = publicSocket()
    const onMat = ({ mat, display } = {}) => setRows((r) => ({ ...r, [mat]: display || null }))
    sock?.on('display:mat', onMat)
    return () => { sock?.off('display:mat', onMat) }
  }, [])
  return useCallback((bout) => {
    const pushed = Object.values(rows).find((r) => r?.matchId === bout.id)
    if (pushed) return pushed.status === 'open' ? pushed : null
    return bout.scoreboard || null
  }, [rows])
}
