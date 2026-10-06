import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { serverUrl } from '../data/session'
import { publicSocket, onClockOffset, onConnectionStatus } from '../data/channel/socket'

// Every device needs to agree what "now" is before it can derive a clock from
// an anchor. The offset is zero until it has been measured against the server
// over the public channel, and every screen — referee, judge, scoreboard —
// then uses the same one.
const ConnectionContext = createContext({
  offset: 0,
  status: 'connecting',
  setOffset: () => {},
  setStatus: () => {},
})

export function ConnectionProvider({ children }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    if (!serverUrl()) return undefined
    publicSocket()
    const offOffset = onClockOffset(setOffset)
    const offStatus = onConnectionStatus(setStatus)
    return () => { offOffset(); offStatus() }
  }, [])

  const value = useMemo(
    () => ({ offset, status, setOffset, setStatus }),
    [offset, status]
  )
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export const useConnection = () => useContext(ConnectionContext)
