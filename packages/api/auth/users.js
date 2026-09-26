import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { isMongoConfigured, getDb } from '../db/mongo.js'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64
const COLLECTION = 'users'

export const hashPassword = async (password, salt = randomBytes(16).toString('hex')) => {
  const derived = await scryptAsync(password, salt, KEY_LEN)
  return `${salt}:${derived.toString('hex')}`
}

export const verifyPassword = async (password, stored) => {
  const [salt, expected] = String(stored).split(':')
  if (!salt || !expected) return false
  const derived = await scryptAsync(password, salt, KEY_LEN)
  const expectedBuf = Buffer.from(expected, 'hex')
  // Lengths must match before timingSafeEqual, and the comparison itself stays
  // constant-time so a wrong password leaks nothing through timing.
  if (expectedBuf.length !== derived.length) return false
  return timingSafeEqual(expectedBuf, derived)
}

// The demo roster. Seeded into MongoDB on first connect when the users
// collection is empty, and used directly, in memory, when no MONGODB_URI is
// configured at all — so local development and the test suite need no
// database, while a real deployment gets the same accounts in Mongo the
// moment MONGODB_URI is set.
const SEED = [
  { uid: 'admin-uid-001', email: 'admin@kata.local', role: 'admin', password: 'test123' },
  { uid: 'ref-uid-001', email: 'referee@kata.local', role: 'referee', password: 'test123' },
  { uid: 'judge1-uid', email: 'judge1@kata.local', role: 'judge', seat: 1, password: 'test123' },
  { uid: 'judge2-uid', email: 'judge2@kata.local', role: 'judge', seat: 2, password: 'test123' },
  { uid: 'judge3-uid', email: 'judge3@kata.local', role: 'judge', seat: 3, password: 'test123' },
  { uid: 'judge4-uid', email: 'judge4@kata.local', role: 'judge', seat: 4, password: 'test123' },
]

// --- in-memory store (no MONGODB_URI) --------------------------------------

const memoryUsers = new Map()

async function loadMemoryUsers() {
  if (memoryUsers.size) return memoryUsers
  for (const { password, ...user } of SEED) {
    memoryUsers.set(user.email.toLowerCase(), { ...user, passwordHash: await hashPassword(password) })
  }
  return memoryUsers
}

async function findMemoryUserByEmail(email) {
  const users = await loadMemoryUsers()
  return users.get(String(email || '').trim().toLowerCase()) || null
}

async function findMemoryUserByUid(uid) {
  const users = await loadMemoryUsers()
  return [...users.values()].find((u) => u.uid === uid) || null
}

// --- Mongo-backed store (MONGODB_URI set) -----------------------------------

let seeded = false

async function usersCollection() {
  const db = await getDb()
  const collection = db.collection(COLLECTION)
  if (!seeded) {
    seeded = true // set before awaiting: two near-simultaneous callers must not both seed
    if ((await collection.countDocuments()) === 0) {
      const docs = await Promise.all(
        SEED.map(async ({ password, ...user }) => ({ ...user, passwordHash: await hashPassword(password) }))
      )
      await collection.insertMany(docs)
    }
    await collection.createIndex({ email: 1 }, { unique: true })
    await collection.createIndex({ uid: 1 }, { unique: true })
  }
  return collection
}

async function findMongoUserByEmail(email) {
  const collection = await usersCollection()
  return collection.findOne({ email: String(email || '').trim().toLowerCase() })
}

async function findMongoUserByUid(uid) {
  const collection = await usersCollection()
  return collection.findOne({ uid })
}

// --- the interface server/index.js actually calls ---------------------------

const findByEmail = (email) => (isMongoConfigured() ? findMongoUserByEmail(email) : findMemoryUserByEmail(email))
const findByUid = (uid) => (isMongoConfigured() ? findMongoUserByUid(uid) : findMemoryUserByUid(uid))

/**
 * Returns the user when the credentials check out, otherwise null. Callers get
 * one undifferentiated failure: saying which half was wrong tells an attacker
 * which addresses exist.
 */
export async function authenticate(email, password) {
  const user = await findByEmail(email)
  if (!user) {
    // Spend comparable time on an unknown address so the response does not
    // reveal whether it exists.
    await hashPassword(String(password || ''))
    return null
  }
  const ok = await verifyPassword(String(password || ''), user.passwordHash)
  if (!ok) return null
  const { passwordHash, _id, ...safe } = user
  return safe
}

export async function findUser(uid) {
  const user = await findByUid(uid)
  if (!user) return null
  const { passwordHash, _id, ...safe } = user
  return safe
}
