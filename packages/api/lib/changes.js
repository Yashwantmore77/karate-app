const MUTATIONS = ['insert', 'insertMany', 'update', 'remove', 'removeWhere']

/**
 * Wraps stores so every successful write announces which collection changed.
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
          if (changed) onChange(name)
          return result
        }
      }
      return [name, wrapped]
    })
  )
}
