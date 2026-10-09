const MUTATIONS = ['insert', 'insertMany', 'update', 'remove', 'removeWhere']

// The one row a write touched: update and remove name it, insert returns it.
const rowId = (method, [first], result) => {
  if (method === 'update' || method === 'remove') return typeof first === 'string' ? first : null
  if (method === 'insert') return result?.id ?? first?.id ?? null
  return null
}

/**
 * Wraps stores so every successful write announces which collection changed,
 * and which row when the write names one (`{ id }`, else null).
 *
 * Subscribers are told *what* changed, not how: they re-read the collection
 * they care about. Shipping the delta instead would mean every client had to
 * apply changes in the same order the server did to stay correct, and a client
 * that missed one event would drift without ever knowing.
 */
export function withChangeEvents(stores, onChange) {
  return Object.fromEntries(
    Object.entries(stores).map(([name, collection]) => {
      const wrapped = { ...collection }
      for (const method of MUTATIONS) {
        wrapped[method] = async (...args) => {
          const result = await collection[method](...args)
          // A remove that matched nothing is not a change worth waking clients
          // for, and update returns null when the row was already gone.
          const changed = result !== null && result !== false && result !== 0
            && !(Array.isArray(result) && result.length === 0)
          if (changed) onChange(name, { id: rowId(method, args, result) })
          return result
        }
      }
      return [name, wrapped]
    })
  )
}
