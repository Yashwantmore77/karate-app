import { createHash, randomBytes } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// One-time password-reset tokens (PRD section 4). Only a hash is stored, so a
// leaked database row cannot be used to reset anyone's password.

export const RESET_TTL_MS = 30 * 60_000
const memory = new Map()
const hash = (token) => createHash('sha256').update(String(token)).digest('hex')

async function collection() {
  const db = await getDb()
  const c = db.collection('passwordResets')
  await c.createIndex({ hash: 1 }, { unique: true })
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  return c
}

export async function issueReset(uid, now = Date.now()) {
  const token = randomBytes(32).toString('hex')
  const row = { hash: hash(token), uid, expiresAt: new Date(now + RESET_TTL_MS) }
  if (isMongoConfigured()) {
    const c = await collection()
    await c.deleteMany({ uid }) // a new request replaces any earlier link
    await c.insertOne(row)
  } else {
    for (const [k, v] of memory) if (v.uid === uid) memory.delete(k)
    memory.set(row.hash, row)
  }
  return token
}

/** Returns the uid and burns the token, or null if unknown or expired. */
export async function redeemReset(token, now = Date.now()) {
  const key = hash(token)
  let row
  if (isMongoConfigured()) {
    row = await (await collection()).findOneAndDelete({ hash: key })
  } else {
    row = memory.get(key) || null
    memory.delete(key)
  }
  if (!row || new Date(row.expiresAt).getTime() < now) return null
  return row.uid
}
