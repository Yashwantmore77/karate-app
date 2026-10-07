import { useEffect, useRef, useState } from 'react'
import { openMatch } from '../data/channel'

/**
 * Opens a match on whichever transport is configured and returns its state
 * plus a command sender. Observers pass control: false and get the same
 * projection with a sender that does nothing.
 */
const IDLE_STATUS = { holdsControl: false, controllerId: null, contested: false, lastError: null }

export function useMatchChannel(matchId, { control = true } = {}) {
  const [state, setState] = useState(null)
  // Whether this screen actually holds the mat, which is the server's call and
  // not the same as having asked for it.
  const [status, setStatus] = useState(IDLE_STATUS)
  const channel = useRef(null)

  useEffect(() => {
    const ch = openMatch(matchId, { control })
    channel.current = ch
    const off = ch.subscribe(setState)
    const offStatus = ch.subscribeStatus?.(setStatus) ?? (() => {})
    return () => {
      off()
      offStatus()
      ch.close()
      channel.current = null
      setStatus(IDLE_STATUS)
    }
  }, [matchId, control])

  const send = useRef((cmd, payload) => channel.current?.send(cmd, payload)).current
  const takeover = useRef(() => channel.current?.takeover?.()).current
  // Offline scoring: 'apply' or 'discard' actions the server could not take on its own.
  const resolveOffline = useRef((choice) => channel.current?.resolve?.(choice)).current

  return [state, send, { ...status, takeover, resolveOffline }]
}
