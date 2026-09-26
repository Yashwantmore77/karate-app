// localStorage adapter. Async on purpose even though localStorage is not:
// synchronous call sites are what make a transport swap painful later.

const PREFIX = 'kt:v1'
const key = (collection) => `${PREFIX}:${collection}`

const listeners = new Map() // collection -> Set<callback>

// Other tabs on this machine. A real device-to-device channel arrives with the
// socket adapter; this keeps the same subscribe() contract in the meantime.
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(PREFIX)
  : null

const readAll = (collection) => {
  try {
    return JSON.parse(localStorage.getItem(key(collection)) || '[]')
  } catch {
    return []
  }
}

const writeAll = (collection, rows) => {
  localStorage.setItem(key(collection), JSON.stringify(rows))
  notify(collection)
  channel?.postMessage({ collection })
}

const notify = (collection) => {
  const rows = readAll(collection)
  listeners.get(collection)?.forEach((cb) => cb(rows))
}

channel?.addEventListener('message', (e) => {
  if (e.data?.collection) notify(e.data.collection)
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(`${PREFIX}:`)) notify(e.key.slice(PREFIX.length + 1))
  })
}

const matches = (row, query) =>
  Object.entries(query).every(([field, value]) => row[field] === value)

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const now = () => Date.now()

export const list = async (collection, query = {}) =>
  readAll(collection).filter((row) => matches(row, query))

export const get = async (collection, id) =>
  readAll(collection).find((row) => row.id === id) || null

export const create = async (collection, doc) => {
  const row = { ...doc, id: doc.id || newId(), createdAt: doc.createdAt || new Date().toISOString() }
  writeAll(collection, [...readAll(collection), row])
  return row
}

export const update = async (collection, id, patch) => {
  writeAll(collection, readAll(collection).map((row) => (row.id === id ? { ...row, ...patch } : row)))
}

export const remove = async (collection, id) => {
  writeAll(collection, readAll(collection).filter((row) => row.id !== id))
}

export const subscribe = (collection, query, cb) => {
  const wrapped = (rows) => cb(rows.filter((row) => matches(row, query)))
  if (!listeners.has(collection)) listeners.set(collection, new Set())
  listeners.get(collection).add(wrapped)
  wrapped(readAll(collection))
  return () => listeners.get(collection)?.delete(wrapped)
}

// Escape hatch for tests and the migration only.
export const _key = key
