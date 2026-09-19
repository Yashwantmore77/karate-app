import { useEffect, useState } from 'react'
import { remainingNow } from '../shared/clock'
import { formatClock } from '../shared/format'
import { useServerNow } from './useServerNow'

const TICK_MS = 100

/**
 * Renders a clock anchor. Every screen showing the same anchor agrees, because
 * each recomputes from it rather than counting its own ticks.
 */
export function useMatchClock(clock) {
  const serverNow = useServerNow()
  const [, setTick] = useState(0)
  const running = !!clock?.running

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [running])

  const remainingMs = clock ? remainingNow(clock, serverNow()) : 0
  return { running, remainingMs, display: formatClock(remainingMs), expired: remainingMs === 0 }
}
