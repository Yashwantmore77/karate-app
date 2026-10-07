import { COLLECTIONS } from './store.js'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// PRD v1 §23 "Automated backups + tested restore". A backup is every
// collection as JSON, accounts included (their password hashes stay hashes).
// The same file restores into an empty store; `npm run backup` and
// `npm run restore` wrap these for the venue machine and a cron job.

export const BACKUP_FORMAT = 'kumite-backup/1'

async function accounts() {
  if (!isMongoConfigured()) return []
  return (await getDb()).collection('users').find({}, { projection: { _id: 0 } }).toArray()
}

export async function createBackup(stores, { now = new Date() } = {}) {
  const data = {}
  for (const name of COLLECTIONS) data[name] = stores[name] ? await stores[name].list({}) : []
  return { format: BACKUP_FORMAT, createdAt: now.toISOString(), collections: data, users: await accounts() }
}

/** Loads a backup into stores. Refuses a non-empty target unless told to replace. */
export async function restoreBackup(stores, backup, { replace = false } = {}) {
  if (backup?.format !== BACKUP_FORMAT || typeof backup.collections !== 'object') throw Object.assign(new Error('invalid_backup'), { code: 'invalid_backup' })
  if (!replace) {
    for (const name of COLLECTIONS) if (stores[name] && (await stores[name].count({})) > 0) throw Object.assign(new Error('target_not_empty'), { code: 'target_not_empty' })
  }
  const counts = {}
  for (const [name, rows] of Object.entries(backup.collections)) {
    if (!stores[name] || !Array.isArray(rows)) continue
    if (replace) await stores[name].removeWhere({})
    if (rows.length) await stores[name].insertMany(rows)
    counts[name] = rows.length
  }
  if (isMongoConfigured() && Array.isArray(backup.users) && backup.users.length) {
    const users = (await getDb()).collection('users')
    for (const u of backup.users) await users.updateOne({ uid: u.uid }, { $set: u }, { upsert: true })
    counts.users = backup.users.length
  }
  return counts
}
