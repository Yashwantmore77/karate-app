import { scrypt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { isMongoConfigured, getDb } from '../db/mongo.js'
import { validate } from '../lib/validate.js'
import { conflict, notFound, badRequest } from '../lib/errors.js'

const scryptAsync = promisify(scrypt)
const KEY_LEN = 64
const COLLECTION = 'users'
// PRD section 3. Coaches are not accounts: they arrive through a registration
// link (see signCoachToken), and the public needs no sign-in at all.
export const ROLES = ['admin', 'referee', 'judge', 'super_admin', 'registration_officer', 'weighin_officer', 'announcer', 'scoreboard_operator', 'viewer']

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
  // PRD section 4: the tournaments this account may work. Empty or absent
  // means all of them, which is how every existing account behaves.
  tournamentIds: { type: 'array', items: { type: 'string', max: 80 }, maxItems: 200, unique: true, nullable: true },
  // PRD point 33 (SaaS): the organisation this account belongs to. Absent
  // means none, which is how every existing account behaves.
  organizationId: { type: 'string', max: 80, nullable: true },
  // PRD v1 §4: a different role inside particular tournaments, e.g. admin of
  // one event and referee everywhere else. { tournamentId: role }.
  tournamentRoles: { type: 'object', nullable: true },
}

/** Keeps only well-formed tournament roles; anything else is refused. */
function cleanTournamentRoles(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest('invalid_tournamentRoles')
  const entries = Object.entries(value)
  if (entries.length > 200) throw badRequest('invalid_tournamentRoles')
  const out = {}
  for (const [tid, role] of entries) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(tid) || !ROLES.includes(role) || role === 'super_admin') throw badRequest('invalid_tournamentRoles')
    out[tid] = role
  }
  return Object.keys(out).length ? out : null
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

// The demo roster, password "test123". Used directly, in memory, when no
// MONGODB_URI is configured, so local development and the test suite need no
// database. Into MongoDB it is seeded only outside production, or when
// SEED_DEMO_ACCOUNTS=true: a published password must never open a real
// event. A production database starts with one super admin instead, from
// BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.
const SEED = [
  { uid: 'admin-uid-001', email: 'admin@kata.local', role: 'admin', password: 'test123' },
  { uid: 'ref-uid-001', email: 'referee@kata.local', role: 'referee', password: 'test123' },
  { uid: 'judge1-uid', email: 'judge1@kata.local', role: 'judge', seat: 1, password: 'test123' },
  { uid: 'judge2-uid', email: 'judge2@kata.local', role: 'judge', seat: 2, password: 'test123' },
  { uid: 'judge3-uid', email: 'judge3@kata.local', role: 'judge', seat: 3, password: 'test123' },
  { uid: 'judge4-uid', email: 'judge4@kata.local', role: 'judge', seat: 4, password: 'test123' },
  // PRD section 3 staff roles. Not on the login screen's quick-select chips,
  // which stay as they were; sign in with the address.
  { uid: 'registrar-uid', email: 'registrar@kata.local', role: 'registration_officer', password: 'test123' },
  { uid: 'weighin-uid', email: 'weighin@kata.local', role: 'weighin_officer', password: 'test123' },
  { uid: 'announcer-uid', email: 'announcer@kata.local', role: 'announcer', password: 'test123' },
  { uid: 'scoreboard-uid', email: 'scoreboard@kata.local', role: 'scoreboard_operator', password: 'test123' },
  { uid: 'superadmin-uid', email: 'superadmin@kata.local', role: 'super_admin', password: 'test123' },
  { uid: 'viewer-uid', email: 'viewer@kata.local', role: 'viewer', password: 'test123' },
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
  const { email, password, role, seat, tournamentIds, organizationId, tournamentRoles: rawRoles } = validate(input, USER_SCHEMA)
  const tournamentRoles = cleanTournamentRoles(rawRoles)
  const users = await loadMemoryUsers()
  if (users.has(email)) throw conflict('email_taken')
  const user = {
    uid: randomUUID(),
    email,
    role,
    ...(seat !== null && seat !== undefined ? { seat } : {}),
    ...(tournamentIds?.length ? { tournamentIds } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(tournamentRoles ? { tournamentRoles } : {}),
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
  if (fields.tournamentIds !== undefined) next.tournamentIds = fields.tournamentIds || []
  if (fields.organizationId !== undefined) {
    if (fields.organizationId) next.organizationId = fields.organizationId
    else delete next.organizationId
  }
  if (fields.tournamentRoles !== undefined) {
    const roles = cleanTournamentRoles(fields.tournamentRoles)
    if (roles) next.tournamentRoles = roles
    else delete next.tournamentRoles
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

const isProduction = () => process.env.NODE_ENV === 'production'
export const seedDemoAccounts = () => process.env.SEED_DEMO_ACCOUNTS === 'true'
  || (!isProduction() && process.env.SEED_DEMO_ACCOUNTS !== 'false')

/** The first accounts of an empty database: the demo roster, or one super admin. */
export async function initialAccounts(env = process.env) {
  if (seedDemoAccounts()) {
    return Promise.all(SEED.map(async ({ password, ...user }) => ({ ...user, passwordHash: await hashPassword(password) })))
  }
  const email = normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL || '')
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || ''
  if (!email || password.length < 12) {
    console.warn('[auth] No accounts yet. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ characters) to create the first super admin.')
    return []
  }
  return [{ uid: randomUUID(), email, role: 'super_admin', passwordHash: await hashPassword(password) }]
}

/** In production, names any demo account that still has the demo password. */
async function warnAboutDemoPasswords(collection) {
  if (!isProduction()) return
  const exposed = []
  for (const { email, password } of SEED) {
    const row = await collection.findOne({ email }, { projection: { passwordHash: 1 } })
    if (row && (await verifyPassword(password, row.passwordHash))) exposed.push(email)
  }
  if (exposed.length) console.warn(`[auth] SECURITY: these accounts still use the published demo password; change or delete them: ${exposed.join(', ')}`)
}

async function usersCollection() {
  const db = await getDb()
  const collection = db.collection(COLLECTION)
  if (!seeded) {
    seeded = true // set before awaiting: two near-simultaneous callers must not both seed
    if ((await collection.countDocuments()) === 0) {
      const docs = await initialAccounts()
      if (docs.length) await collection.insertMany(docs)
    }
    warnAboutDemoPasswords(collection).catch(() => {})
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
  const { email, password, role, seat, tournamentIds, organizationId, tournamentRoles: rawRoles } = validate(input, USER_SCHEMA)
  const tournamentRoles = cleanTournamentRoles(rawRoles)
  const collection = await usersCollection()
  const doc = {
    uid: randomUUID(),
    email,
    role,
    ...(seat !== null && seat !== undefined ? { seat } : {}),
    ...(tournamentIds?.length ? { tournamentIds } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(tournamentRoles ? { tournamentRoles } : {}),
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
  if (fields.tournamentIds !== undefined) $set.tournamentIds = fields.tournamentIds || []
  if (fields.organizationId !== undefined) {
    if (fields.organizationId) $set.organizationId = fields.organizationId
    else $unset.organizationId = ''
  }
  if (fields.tournamentRoles !== undefined) {
    const roles = cleanTournamentRoles(fields.tournamentRoles)
    if (roles) $set.tournamentRoles = roles
    else $unset.tournamentRoles = ''
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

// Secrets never leave this module: not the hash, not a two-factor secret.
const strip = (user) => {
  const { passwordHash, _id, twoFactorSecret, pendingTwoFactorSecret, ...safe } = user
  return { ...safe, twoFactorEnabled: !!twoFactorSecret }
}

/**
 * Security fields no request body may set directly: a new password hash
 * (reset), two-factor secrets. Only the auth routes call this.
 */
export async function setSecurity(uid, { password, twoFactorSecret, pendingTwoFactorSecret }) {
  const patch = {}
  if (password !== undefined) patch.passwordHash = await hashPassword(password)
  if (twoFactorSecret !== undefined) patch.twoFactorSecret = twoFactorSecret
  if (pendingTwoFactorSecret !== undefined) patch.pendingTwoFactorSecret = pendingTwoFactorSecret
  if (isMongoConfigured()) {
    const collection = await usersCollection()
    const $set = {}
    const $unset = {}
    for (const [k, v] of Object.entries(patch)) (v === null ? $unset : $set)[k] = v === null ? '' : v
    const update = {}
    if (Object.keys($set).length) update.$set = $set
    if (Object.keys($unset).length) update.$unset = $unset
    await collection.updateOne({ uid }, update)
    return
  }
  const user = await findMemoryUserByUid(uid)
  if (!user) throw notFound()
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete user[k]
    else user[k] = v
  }
}

/** The raw record, secrets included, for the auth routes only. */
export const findUserRecord = (uid) => findByUid(uid)
export const findUserRecordByEmail = (email) => findByEmail(email)

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
  return { ...strip(user), twoFactorSecret: user.twoFactorSecret || null }
}

export async function findUser(uid) {
  const user = await findByUid(uid)
  return user ? strip(user) : null
}

/**
 * The roster, a page at a time, searchable by address or role.
 *
 * Paged in memory for both backends: the account list is small by nature —
 * the officials at one venue — and a Mongo-side skip/limit would buy nothing
 * while splitting the search rules across two implementations.
 */
export async function listUsers({ q = '', page = 1, limit = 25, organizationId = null } = {}) {
  const all = (await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())).filter((u) => u.role !== 'coach')
  const users = organizationId ? all.filter((u) => u.organizationId === organizationId) : all
  const needle = q.trim().toLowerCase()

  const found = needle
    ? users.filter((user) =>
      String(user.email || '').toLowerCase().includes(needle)
      || String(user.role || '').toLowerCase().includes(needle))
    : users

  const ordered = [...found].sort((a, b) => String(a.email).localeCompare(String(b.email)))
  const start = (page - 1) * limit
  return { rows: ordered.slice(start, start + limit).map(strip), total: found.length }
}

/**
 * Everyone who can be put on a match, for the assignment pickers.
 *
 * Deliberately not the account roster: this is readable by a referee building
 * their own panel, so it carries only what is needed to choose a person and
 * nothing about managing them. Admins are included because an admin may take
 * a mat.
 */
export async function listAssignableOfficials() {
  const users = await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())
  return users
    .filter((user) => ROLES.includes(user.role))
    .map(({ uid, email, role, seat }) => ({ uid, email, role, ...(seat === undefined ? {} : { seat }) }))
    .sort((a, b) => a.role.localeCompare(b.role) || String(a.email).localeCompare(String(b.email)))
}

/**
 * PRD v1 §7 "Team manager login": a coach who registered through the link may
 * keep a login for their team, so they can come back without the link
 * password. A coach account belongs to one tournament and one team.
 */
export async function createCoachAccount({ email, password, tournamentId, teamId }) {
  const fields = validate({ email, password }, { email: USER_SCHEMA.email, password: USER_SCHEMA.password })
  const doc = { uid: randomUUID(), email: fields.email, role: 'coach', tournamentId, teamId, passwordHash: await hashPassword(fields.password) }
  if (isMongoConfigured()) {
    try {
      await (await usersCollection()).insertOne({ ...doc })
    } catch (err) {
      if (err?.code === 11000) throw conflict('email_taken')
      throw err
    }
  } else {
    const users = await loadMemoryUsers()
    if (users.has(doc.email)) throw conflict('email_taken')
    users.set(doc.email, doc)
  }
  return { uid: doc.uid, email: doc.email, role: 'coach', tournamentId, teamId }
}

export async function createUser(input) {
  const user = await (isMongoConfigured() ? createMongoUser(input) : createMemoryUser(input))
  return strip(user)
}

export async function updateUser(uid, patch) {
  const user = await (isMongoConfigured() ? updateMongoUser(uid, patch) : updateMemoryUser(uid, patch))
  return strip(user)
}

/** Team manager logins (each belongs to one tournament and team). */
export async function listCoachAccounts() {
  const users = await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())
  return users.filter((user) => user.role === 'coach').map(({ uid, email, tournamentId, teamId }) => ({ uid, email, tournamentId, teamId }))
}

export async function deleteUser(uid) {
  return isMongoConfigured() ? deleteMongoUser(uid) : deleteMemoryUser(uid)
}
