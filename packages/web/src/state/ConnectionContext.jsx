import { createContext, useContext, useMemo, useState } from 'react'

// Every device needs to agree what "now" is before it can derive a clock from
// an anchor. On the local adapter there is no server, so the offset is zero;
// the socket adapter replaces it with the measured handshake offset.
const ConnectionContext = createContext({
  offset: 0,
  status: 'local',
  setOffset: () => {},
  setStatus: () => {},
})

export function ConnectionProvider({ children }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('local')
  const value = useMemo(
    () => ({ offset, status, setOffset, setStatus }),
    [offset, status]
  )
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export const useConnection = () => useContext(ConnectionContext)
