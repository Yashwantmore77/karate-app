import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64

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

// Development accounts, mirroring the ones the client's mock auth offers.
// A real deployment replaces this with a user collection (BE-2).
const SEED = [
  { uid: 'admin-uid-001', email: 'admin@kata.local', role: 'admin', password: 'test123' },
  { uid: 'ref-uid-001', email: 'referee@kata.local', role: 'referee', password: 'test123' },
  { uid: 'judge1-uid', email: 'judge1@kata.local', role: 'judge', seat: 1, password: 'test123' },
  { uid: 'judge2-uid', email: 'judge2@kata.local', role: 'judge', seat: 2, password: 'test123' },
  { uid: 'judge3-uid', email: 'judge3@kata.local', role: 'judge', seat: 3, password: 'test123' },
  { uid: 'judge4-uid', email: 'judge4@kata.local', role: 'judge', seat: 4, password: 'test123' },
]

const users = new Map()

export async function loadUsers() {
  if (users.size) return users
  for (const { password, ...user } of SEED) {
    users.set(user.email.toLowerCase(), { ...user, passwordHash: await hashPassword(password) })
  }
  return users
}

/**
 * Returns the user when the credentials check out, otherwise null. Callers get
 * one undifferentiated failure: saying which half was wrong tells an attacker
 * which addresses exist.
 */
export async function authenticate(email, password) {
  await loadUsers()
  const user = users.get(String(email || '').trim().toLowerCase())
  if (!user) {
    // Spend comparable time on an unknown address so the response does not
    // reveal whether it exists.
    await hashPassword(String(password || ''))
    return null
  }
  const ok = await verifyPassword(String(password || ''), user.passwordHash)
  if (!ok) return null
  const { passwordHash, ...safe } = user
  return safe
}

export const findUser = async (uid) => {
  await loadUsers()
  return [...users.values()].find((u) => u.uid === uid) || null
}
