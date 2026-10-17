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
export const ROLES = ['admin', 'tournament_owner', 'referee', 'judge', 'super_admin', 'registration_officer', 'weighin_officer', 'announcer', 'scoreboard_operator', 'viewer']

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
    // A super admin is system-wide and an owner is an account-level role
    // granted by assignment, so neither is handed out per tournament.
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(tid) || !ROLES.includes(role)
      || ['super_admin', 'tournament_owner'].includes(role)) throw badRequest('invalid_tournamentRoles')
    out[tid] = role
  }
  return Object.keys(out).length ? out : null
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

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

// --- the first account ------------------------------------------------------

// The shortest password any account may have (USER_SCHEMA), applied to the
// bootstrap administrator too: one rule, not a special case.
const MIN_PASSWORD = USER_SCHEMA.password.min

/**
 * The one account an empty database starts with, read from the environment.
 *
 * Nothing here ships a roster. Accounts live in the database and are made by
 * an administrator through /users; the only one that can appear on its own is
 * this administrator, and its address and password come from
 * BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD rather than from code.
 * Set neither and the database stays empty, with nothing to sign in as.
 */
export async function initialAccounts(env = process.env) {
  const email = normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL || '')
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || ''
  if (!email || password.length < MIN_PASSWORD) return []
  // A super admin: the first account of an installation is the one that sets
  // the installation up, and organisations are the one thing an administrator
  // cannot manage. Everything an administrator may do, this may do too
  // (requireRole admits a super admin wherever it asks for an admin).
  return [{ uid: randomUUID(), email, role: 'super_admin', passwordHash: await hashPassword(password) }]
}

// --- in-memory store (no MONGODB_URI) --------------------------------------

const memoryUsers = new Map()
let memoryReady = null

async function loadMemoryUsers() {
  // Latched on the promise rather than on the map's size: an empty bootstrap
  // leaves the map empty, and a size check would redo the work on every call.
  if (!memoryReady) {
    memoryReady = (async () => {
      for (const user of await initialAccounts()) memoryUsers.set(user.email, user)
    })()
  }
  await memoryReady
  return memoryUsers
}

/**
 * Puts a ready-made roster into the in-memory store, hashing each password.
 *
 * This exists for the test suite, which signs in as a dozen different roles
 * (see `test/roster.js`). Keeping it out here is the point: no account and no
 * password is written down in the code that serves the app, so there is
 * nothing to publish and nothing to forget to remove. Refused once a database
 * is configured, where the only account that appears by itself is the
 * bootstrap administrator.
 */
export async function installAccounts(accounts) {
  if (isMongoConfigured()) throw new Error('installAccounts is for the in-memory store only')
  const users = await loadMemoryUsers()
  for (const { password, ...user } of accounts) {
    users.set(user.email.toLowerCase(), { ...user, passwordHash: await hashPassword(password) })
  }
  return users.size
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
      const docs = await initialAccounts()
      if (docs.length) await collection.insertMany(docs)
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

async function deleteMongoUser(uid) {
  const collection = await usersCollection()
  const result = await collection.deleteOne({ uid })
  if (!result.deletedCount) throw notFound()
}

// --- writes: one set of rules, whichever store is in use --------------------

/** A new account from a request body: validated, password hashed. */
async function newAccount(input) {
  const { email, password, role, seat, tournamentIds, organizationId, tournamentRoles: rawRoles } = validate(input, USER_SCHEMA)
  const tournamentRoles = cleanTournamentRoles(rawRoles)
  return {
    uid: randomUUID(),
    email,
    role,
    ...(seat !== null && seat !== undefined ? { seat } : {}),
    ...(tournamentIds?.length ? { tournamentIds } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(tournamentRoles ? { tournamentRoles } : {}),
    passwordHash: await hashPassword(password),
  }
}

/** A change from a request body, field by field; null removes the field. */
async function accountChange(patch) {
  const fields = validate(patch, USER_SCHEMA, { partial: true })
  const change = {}
  for (const key of ['email', 'role', 'seat']) if (fields[key] !== undefined) change[key] = fields[key]
  if (fields.tournamentIds !== undefined) change.tournamentIds = fields.tournamentIds || []
  if (fields.organizationId !== undefined) change.organizationId = fields.organizationId || null
  if (fields.tournamentRoles !== undefined) change.tournamentRoles = cleanTournamentRoles(fields.tournamentRoles)
  if (fields.password) change.passwordHash = await hashPassword(fields.password)
  return change
}

const applyChange = (record, change) => {
  for (const [key, value] of Object.entries(change)) {
    if (value === null) delete record[key]
    else record[key] = value
  }
  return record
}

const mongoUpdate = (change) => {
  const $set = {}
  const $unset = {}
  for (const [key, value] of Object.entries(change)) {
    if (value === null) $unset[key] = ''
    else $set[key] = value
  }
  return { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) }
}

async function insertAccount(doc) {
  if (!isMongoConfigured()) {
    const users = await loadMemoryUsers()
    if (users.has(doc.email)) throw conflict('email_taken')
    users.set(doc.email, doc)
    return doc
  }
  try {
    // A copy: the driver adds _id to whatever it is handed.
    await (await usersCollection()).insertOne({ ...doc })
  } catch (err) {
    // The unique index is what actually decides; catching its violation avoids
    // a read-then-write race that a check up front would still lose.
    if (err?.code === 11000) throw conflict('email_taken')
    throw err
  }
  return doc
}

async function updateAccount(uid, change) {
  if (!isMongoConfigured()) {
    const users = await loadMemoryUsers()
    const existing = await findMemoryUserByUid(uid)
    if (!existing) throw notFound()
    const next = applyChange({ ...existing }, change)
    if (next.email !== existing.email && users.has(next.email)) throw conflict('email_taken')
    // Keyed by address, so a changed address moves the row rather than leaving a
    // stale key pointing at it.
    users.delete(existing.email)
    users.set(next.email, next)
    return next
  }
  const collection = await usersCollection()
  if (!(await collection.findOne({ uid }))) throw notFound()
  try {
    await collection.updateOne({ uid }, mongoUpdate(change))
  } catch (err) {
    if (err?.code === 11000) throw conflict('email_taken')
    throw err
  }
  return collection.findOne({ uid })
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
  const change = {}
  if (password !== undefined) change.passwordHash = await hashPassword(password)
  if (twoFactorSecret !== undefined) change.twoFactorSecret = twoFactorSecret
  if (pendingTwoFactorSecret !== undefined) change.pendingTwoFactorSecret = pendingTwoFactorSecret
  if (isMongoConfigured()) {
    await (await usersCollection()).updateOne({ uid }, mongoUpdate(change))
    return
  }
  const user = await findMemoryUserByUid(uid)
  if (!user) throw notFound()
  applyChange(user, change)
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
export async function listAssignableOfficials({ organizationId = null, reaches = null } = {}) {
  const users = await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())
  return users
    .filter((user) => ROLES.includes(user.role))
    // Inside an organisation the picker shows that organisation's people, the
    // same scope the account roster uses (PRD point 33).
    .filter((user) => !organizationId || (user.organizationId || null) === organizationId)
    // For one tournament, only people who can open it: anyone else put on a bout could never score it.
    .filter((user) => !reaches || reaches(user))
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
  const doc = await insertAccount({ uid: randomUUID(), email: fields.email, role: 'coach', tournamentId, teamId, passwordHash: await hashPassword(fields.password) })
  return { uid: doc.uid, email: doc.email, role: 'coach', tournamentId, teamId }
}

export async function createUser(input) {
  return strip(await insertAccount(await newAccount(input)))
}

export async function updateUser(uid, patch) {
  return strip(await updateAccount(uid, await accountChange(patch)))
}

/** Team manager logins (each belongs to one tournament and team). */
export async function listCoachAccounts() {
  const users = await (isMongoConfigured() ? listMongoUsers() : listMemoryUsers())
  return users.filter((user) => user.role === 'coach').map(({ uid, email, tournamentId, teamId }) => ({ uid, email, tournamentId, teamId }))
}

export async function deleteUser(uid) {
  return isMongoConfigured() ? deleteMongoUser(uid) : deleteMemoryUser(uid)
}
