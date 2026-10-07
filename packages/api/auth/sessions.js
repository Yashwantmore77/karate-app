import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// PRD v1 §26 "sessions": every sign-in is a session the person can see and
// end, on this device or another. A token names its session; a revoked
// session's token stops working at once (within the short cache below).

const TTL_MS = 12 * 60 * 60_000 // matches the token
const CACHE_MS = 15_000
const memory = new Map()
const cache = new Map()

async function collection() {
  const db = await getDb()
  const c = db.collection('sessions')
  await c.createIndex({ sid: 1 }, { unique: true })
  await c.createIndex({ uid: 1 })
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  return c
}

export async function createSession({ uid, ip = null, userAgent = null }, now = Date.now()) {
  const row = { sid: randomUUID(), uid, ip, userAgent: userAgent ? String(userAgent).slice(0, 200) : null, createdAt: new Date(now), lastSeenAt: new Date(now), expiresAt: new Date(now + TTL_MS), revokedAt: null }
  if (isMongoConfigured()) await (await collection()).insertOne({ ...row })
  else memory.set(row.sid, row)
  return row.sid
}

async function find(sid) {
  if (isMongoConfigured()) return (await collection()).findOne({ sid }, { projection: { _id: 0 } })
  return memory.get(sid) || null
}

/** Whether a session may still be used. Cached briefly: it is checked on every request. */
export async function sessionActive(sid, now = Date.now()) {
  if (!sid) return true // tokens from before sessions existed, and coach link sessions
  const hit = cache.get(sid)
  if (hit && now - hit.at < CACHE_MS) return hit.active
  const row = await find(sid)
  const active = !!row && !row.revokedAt && new Date(row.expiresAt).getTime() > now
  cache.set(sid, { active, at: now })
  if (cache.size > 5000) cache.delete(cache.keys().next().value)
  if (active && row && now - new Date(row.lastSeenAt).getTime() > 60_000) {
    const patch = { lastSeenAt: new Date(now) }
    if (isMongoConfigured()) (await collection()).updateOne({ sid }, { $set: patch }).catch(() => {})
    else memory.set(sid, { ...row, ...patch })
  }
  return active
}

export async function listSessions(uid, now = Date.now()) {
  const rows = isMongoConfigured()
    ? await (await collection()).find({ uid }, { projection: { _id: 0 } }).toArray()
    : [...memory.values()].filter((r) => r.uid === uid)
  return rows.filter((r) => !r.revokedAt && new Date(r.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
}

export async function revokeSession(sid, uid) {
  const row = await find(sid)
  if (!row || row.uid !== uid) return false
  const patch = { revokedAt: new Date() }
  if (isMongoConfigured()) await (await collection()).updateOne({ sid }, { $set: patch })
  else memory.set(sid, { ...row, ...patch })
  cache.delete(sid)
  return true
}

export async function revokeOtherSessions(uid, keepSid) {
  let count = 0
  for (const row of await listSessions(uid)) {
    if (row.sid === keepSid) continue
    if (await revokeSession(row.sid, uid)) count += 1
  }
  return count
}
