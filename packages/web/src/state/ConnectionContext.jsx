import { createContext, useContext, useMemo, useState } from 'react'

// Every device needs to agree what "now" is before it can derive a clock from
// an anchor. The offset is zero until the socket has measured it against the
// server during its handshake.
const ConnectionContext = createContext({
  offset: 0,
  status: 'connecting',
  setOffset: () => {},
  setStatus: () => {},
})

export function ConnectionProvider({ children }) {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('connecting')
  const value = useMemo(
    () => ({ offset, status, setOffset, setStatus }),
    [offset, status]
  )
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export const useConnection = () => useContext(ConnectionContext)
