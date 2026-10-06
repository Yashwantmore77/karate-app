import { randomUUID } from 'node:crypto'
import { isMongoConfigured, getDb } from '../db/mongo.js'
import { clientIp, edgeGeo, lookupGeo, userAgent } from '../lib/requestMeta.js'

/**
 * An append-only record of who tried to sign in, from where, and whether it
 * worked.
 *
 * Failures are kept alongside successes on purpose: a run of rejected attempts
 * against one account is the single most useful thing this log can show, and a
 * log of successes alone cannot show it. What is never written is the password
 * that was tried — a credential in an audit trail is a credential in a backup.
 *
 * Writes are deliberately off the response path. An audit record must not make
 * signing in slower, and must not be able to fail a login that otherwise
 * succeeded, so recordLogin() is started and not awaited. Tests and shutdown
 * wait on flushLoginLog() instead.
 */

const COLLECTION = 'loginEvents'
const DEFAULT_TTL_DAYS = 365
const MEMORY_CAP = 500
const MAX_PAGE = 200
const DEFAULT_PAGE = 50

export const OUTCOMES = ['success', 'invalid_credentials', 'rate_limited']

const ttlSeconds = () => {
  const days = Number(process.env.LOGIN_LOG_TTL_DAYS ?? DEFAULT_TTL_DAYS)
  // 0 (or nonsense) means keep everything: a deliberate choice for anyone whose
  // record-keeping rules outlive a year.
  return Number.isFinite(days) && days > 0 ? Math.round(days * 86_400) : null
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase().slice(0, 200) || null

/**
 * Coordinates the browser reported about itself.
 *
 * Kept apart from the IP-derived location and labelled `browser`, because it is
 * a claim by the caller rather than an observation about them: precise when
 * honest, and trivially faked. Malformed input is dropped rather than rejected
 * — a bad coordinate is not a reason to refuse someone entry.
 */
function browserCoords(raw) {
  if (!raw || typeof raw !== 'object') return null
  const latitude = Number(raw.latitude ?? raw.lat)
  const longitude = Number(raw.longitude ?? raw.lng ?? raw.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null

  const accuracy = Number(raw.accuracy ?? raw.accuracyM)
  return {
    source: 'browser',
    latitude,
    longitude,
    accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
  }
}

async function buildEntry({ req, email, user, outcome, coords }) {
  const ip = clientIp(req)
  // Edge headers cost nothing; the lookup only runs when one is configured and
  // the address is routable, so local development never calls out.
  const geo = edgeGeo(req) ?? (await lookupGeo(ip))

  return {
    id: randomUUID(),
    at: new Date(),
    outcome,
    email: normalizeEmail(email ?? user?.email),
    uid: user?.uid ?? null,
    role: user?.role ?? null,
    ip,
    userAgent: userAgent(req),
    geo,
    browserCoords: browserCoords(coords),
  }
}

// --- in-memory log (no MONGODB_URI) -----------------------------------------

let memoryLog = []

function appendMemory(entry) {
  memoryLog.unshift(entry)
  // Bounded: a process that runs for a season must not grow a row per attempt.
  if (memoryLog.length > MEMORY_CAP) memoryLog.length = MEMORY_CAP
}

// --- Mongo-backed log (MONGODB_URI set) -------------------------------------

let indexed = false

async function loginCollection() {
  const collection = (await getDb()).collection(COLLECTION)
  if (indexed) return collection
  indexed = true // set before awaiting: two concurrent logins must not both build indexes

  const expireAfterSeconds = ttlSeconds()
  try {
    // One index on `at` serves both the newest-first read and the expiry, so
    // there is no second copy of the same key to keep in step.
    await collection.createIndex({ at: 1 }, expireAfterSeconds ? { expireAfterSeconds } : {})
  } catch (error) {
    // Changing LOGIN_LOG_TTL_DAYS later collides with the index already built
    // under the old value. Say so plainly rather than failing a login over it.
    console.warn(`[loginLog] could not apply retention index (${error.message}). `
      + `Drop the "at_1" index on ${COLLECTION} to change LOGIN_LOG_TTL_DAYS.`)
  }
  await collection.createIndex({ email: 1, at: -1 })
  await collection.createIndex({ outcome: 1, at: -1 })
  return collection
}

// --- the interface the routes actually call ---------------------------------

const pending = new Set()

/**
 * Writes one attempt. Start it and walk away: the returned promise is tracked
 * so flushLoginLog() can wait, and a failure is logged rather than thrown,
 * because nothing upstream is in a position to do anything about it.
 */
export function recordLogin({ req, email, user = null, outcome, coords = null }) {
  const write = (async () => {
    const entry = await buildEntry({ req, email, user, outcome, coords })
    if (isMongoConfigured()) await (await loginCollection()).insertOne({ ...entry })
    else appendMemory(entry)
  })().catch((error) => {
    console.error(`[loginLog] failed to record a ${outcome} attempt:`, error.message)
  })

  pending.add(write)
  write.finally(() => pending.delete(write))
  return write
}

/** Waits for in-flight writes. For tests, and for a clean shutdown. */
export const flushLoginLog = () => Promise.all([...pending])

/** Empties the in-memory log. Tests only — Mongo records are never dropped here. */
export function resetLoginLog() {
  memoryLog = []
}

const serialize = ({ _id, at, ...entry }) => ({ ...entry, at: new Date(at).toISOString() })

/**
 * Newest first, optionally narrowed to one account or one outcome.
 *
 * Always capped: an audit log is the one collection guaranteed to outgrow every
 * other, so there is no way to ask for all of it in one response.
 */
export async function listLogins({ limit, email, outcome, page = 1 } = {}) {
  const requested = Number(limit)
  const size = Number.isFinite(requested) && requested > 0 ? Math.min(Math.trunc(requested), MAX_PAGE) : DEFAULT_PAGE
  const skip = (Math.max(1, page) - 1) * size

  const filter = {}
  if (email) filter.email = normalizeEmail(email)
  if (outcome && OUTCOMES.includes(outcome)) filter.outcome = outcome

  if (!isMongoConfigured()) {
    const found = memoryLog
      .filter((entry) => Object.entries(filter).every(([field, value]) => entry[field] === value))
    return { rows: found.slice(skip, skip + size).map(serialize), total: found.length }
  }

  const collection = await loginCollection()
  const [rows, total] = await Promise.all([
    collection
      .find(filter, { projection: { _id: 0 } })
      // Newest first, and sorted before skipping so a page is stable.
      .sort({ at: -1 })
      .skip(skip)
      .limit(size)
      .toArray(),
    collection.countDocuments(filter),
  ])
  return { rows: rows.map(serialize), total }
}
