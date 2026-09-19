import { useEffect, useRef, useState } from 'react'
import { openMatch } from '../data/channel'

/**
 * Opens a match on whichever transport is configured and returns its state
 * plus a command sender. Observers pass control: false and get the same
 * projection with a sender that does nothing.
 */
export function useMatchChannel(matchId, { control = true } = {}) {
  const [state, setState] = useState(null)
  const channel = useRef(null)

  useEffect(() => {
    const ch = openMatch(matchId, { control })
    channel.current = ch
    const off = ch.subscribe(setState)
    return () => {
      off()
      ch.close()
      channel.current = null
    }
  }, [matchId, control])

  const send = useRef((cmd, payload) => channel.current?.send(cmd, payload)).current

  return [state, send]
}
