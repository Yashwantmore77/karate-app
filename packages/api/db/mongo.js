import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || null
const dbName = process.env.MONGODB_DB || 'kumite'

export const isMongoConfigured = () => !!uri

let client = null
let dbPromise = null

/**
 * Lazily connects on first use and reuses one client for the process, rather
 * than opening a connection per request. Only ever called when
 * isMongoConfigured() is true — callers fall back to an in-memory store
 * otherwise, the same way the client falls back to its local adapter when no
 * VITE_SERVER_URL is set.
 */
export function getDb() {
  if (!uri) {
    throw new Error('MONGODB_URI is not set — call isMongoConfigured() first')
  }
  if (!dbPromise) {
    client = new MongoClient(uri)
    dbPromise = client.connect().then((c) => c.db(dbName))
  }
  return dbPromise
}

// For tests, and for a clean process shutdown.
export async function closeMongo() {
  if (!client) return
  await client.close()
  client = null
  dbPromise = null
}
