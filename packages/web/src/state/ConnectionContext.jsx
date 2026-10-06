import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { serverUrl } from '../data/session'
import { publicSocket, onClockOffset, onConnectionStatus } from '../data/channel/socket'

// Every device needs to agree what "now" is before it can derive a clock from
// an anchor. On the local adapter there is no server, so the offset is zero;
// with a server, the measured handshake offset from the public channel is used
// by every screen — referee, judge, scoreboard alike.
const ConnectionContext = createContext({
  offset: 0,
  status: 'local',
  setOffset: () => {},
  setStatus: () => {},
})

export function ConnectionProvider({ children }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState(serverUrl() ? 'connecting' : 'local')

  useEffect(() => {
    if (!serverUrl()) return undefined
    publicSocket()
    const offOffset = onClockOffset(setOffset)
    const offStatus = onConnectionStatus((s) => setStatus(s === 'offline' ? 'offline' : s))
    return () => { offOffset(); offStatus() }
  }, [])

  const value = useMemo(
    () => ({ offset, status, setOffset, setStatus }),
    [offset, status]
  )
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export const useConnection = () => useContext(ConnectionContext)
