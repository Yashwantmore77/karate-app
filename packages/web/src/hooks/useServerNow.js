import { useCallback } from 'react'
import { useConnection } from '../state/ConnectionContext'

export function useServerNow() {
  const { offset } = useConnection()
  return useCallback(() => Date.now() + offset, [offset])
}
