import { scrypt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { isMongoConfigured, getDb } from '../db/mongo.js'
import { validate } from '../lib/validate.js'
import { conflict, notFound } from '../lib/errors.js'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64
const COLLECTION = 'users'
export const ROLES = ['admin', 'referee', 'judge']

// Deliberately loose: the point is to catch a transposed field, not to arbitrate
// what a valid address is. Anything stricter rejects real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A minimum length is the one password rule worth enforcing here. These accounts
// are handed out by an administrator at a venue, so complexity rules mostly
// produce passwords taped to a laptop.
const USER_SCHEMA = {
  email: { type: 'string', required: true, max: 200, lowercase: true, pattern: EMAIL_PATTERN },
  password: { type: 'string', required: true, min: 8, max: 200, trim: false },
  role: { type: 'enum', values: ROLES, required: true },
  seat: { type: 'integer', min: 1, max: 99, nullable: true },
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

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
  return users.get(normalizeEmail(email)) || null
}

async function findMemoryUserByUid(uid) {
  const users = await loadMemoryUsers()
  return [...users.values()].find((u) => u.uid === uid) || null
}

async function listMemoryUsers() {
  const users = await loadMemoryUsers()
  return [...users.values()]
}

async function createMemoryUser(input) {
  const { email, password, role, seat } = validate(input, USER_SCHEMA)
  const users = await loadMemoryUsers()
  if (users.has(email)) throw conflict('email_taken')
  const user = {
    uid: randomUUID(),
    email,
    role,
    ...(seat !== null && seat !== undefined ? { seat } : {}),
    passwordHash: await hashPassword(password),
  }
  users.set(email, user)
  return user
}

async function updateMemoryUser(uid, patch) {
  const fields = validate(patch, USER_SCHEMA, { partial: true })
  const users = await loadMemoryUsers()
  const existing = [...users.values()].find((u) => u.uid === uid)
  if (!existing) throw notFound()

  const next = { ...existing }
  if (fields.email !== undefined) next.email = fields.email
  if (fields.role !== undefined) next.role = fields.role
  if (fields.seat !== undefined) {
    if (fields.seat === null) delete next.seat
    else next.seat = fields.seat
  }
  if (fields.password) next.passwordHash = await hashPassword(fields.password)

  if (next.email !== existing.email && users.has(next.email)) throw conflict('email_taken')

  // Keyed by address, so a changed address moves the row rather than leaving a
  // stale key pointing at it.
  users.delete(existing.email)
  users.set(next.email, next)
  return next
}

async function deleteMemoryUser(uid) {
  const users = await loadMemoryUsers()
  const existing = [...users.values()].find((u) => u.uid === uid)
  if (!existing) throw notFound()
  users.delete(existing.email)
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
  return collection.findOne({ email: normalizeEmail(email) })
}

async function findMongoUserByUid(uid) {
  const collection = await usersCollection()
  return collection.findOne({ uid })
}

async function listMongoUsers() {
  const collection = await usersCollection()
  return collection.find({}).toArray()
}

async function createMongoUser(input) {
  const { email, password, role, seat } = validate(input, USER_SCHEMA)
  const collection = await usersCollection()
  const doc = {
    uid: randomUUID(),
    email,
    role,
    ...(seat !== null && seat !== undefined ? { seat } : {}),
    passwordHash: await hashPassword(password),
  }
  try {
    await collection.insertOne(doc)
  } catch (err) {
    // The unique index is what actually decides; catching its violation avoids
    // a read-then-write race that a check up front would still lose.
    if (err?.code === 11000) throw conflict('email_taken')
    throw err
  }
  return doc
}

async function updateMongoUser(uid, patch) {
  const fields = validate(patch, USER_SCHEMA, { partial: true })
  const collection = await usersCollection()
  const existing = await collection.findOne({ uid })
  if (!existing) throw notFound()

  const $set = {}
  const $unset = {}
  if (fields.email !== undefined) $set.email = fields.email
  if (fields.role !== undefined) $set.role = fields.role
  if (fields.seat !== undefined) {
    if (fields.seat === null) $unset.seat = ''
    else $set.seat = fields.seat
  }
  if (fields.password) $set.passwordHash = await hashPassword(fields.password)

  try {
    const update = {}
    if (Object.keys($set).length) update.$set = $set
    if (Object.keys($unset).length) update.$unset = $unset
    await collection.updateOne({ uid }, update)
  } catch (err) {
    if (err?.code === 11000) throw conflict('email_taken')
    throw err
  }
  return collection.findOne({ uid })
}

async function deleteMongoUser(uid) {
  const collection = await usersCollection()
  const result = await collection.deleteOne({ uid })
  if (!result.deletedCount) throw notFound()
}

// --- the interface server/index.js actually calls ---------------------------

const findByEmail = (email) => (isMongoConfigured() ? findMongoUserByEmail(email) : findMemoryUserByEmail(email))
const findByUid = (uid) => (isMongoConfigured() ? findMongoUserByUid(uid) : findMemoryUserByUid(uid))

const strip = (user) => {
  const { passwordHash, _id, ...safe } = user
  return safe
}

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
  return strip(user)
}

export async function findUser(uid) {
  const user = await findByUid(uid)
  return user ? strip(user) : null
}

export async function listUsers() {
  const users = await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())
  return users.map(strip)
}

export async function createUser(input) {
  const user = await (isMongoConfigured() ? createMongoUser(input) : createMemoryUser(input))
  return strip(user)
}

export async function updateUser(uid, patch) {
  const user = await (isMongoConfigured() ? updateMongoUser(uid, patch) : updateMemoryUser(uid, patch))
  return strip(user)
}

export async function deleteUser(uid) {
  return isMongoConfigured() ? deleteMongoUser(uid) : deleteMemoryUser(uid)
}
