import { COLLECTIONS } from './store.js'
import { isMongoConfigured, getDb } from '../db/mongo.js'

// PRD v1 §23 "Automated backups + tested restore". A backup is every
// collection as JSON, accounts included (their password hashes stay hashes,
// and their second-factor secrets stay out: see backupAccount).
// The same file restores into an empty store; `npm run backup` and
// `npm run restore` wrap these for the venue machine and a cron job.

export const BACKUP_FORMAT = 'kumite-backup/1'

/**
 * An account as a backup keeps it: without its second-factor secrets. Those
 * are stored as they are (an authenticator app needs the secret itself), and
 * a backup is a file that gets downloaded, copied and mailed; whoever holds
 * it could make the codes. Restored over the same database an account keeps
 * its own; restored into a new one, it sets up two-step sign-in again.
 */
export function backupAccount({ twoFactorSecret, pendingTwoFactorSecret, ...account }) {
  return twoFactorSecret ? { ...account, twoFactorLeftOut: true } : account
}

async function mongoAccounts() {
  if (!isMongoConfigured()) return []
  return (await getDb()).collection('users').find({}, { projection: { _id: 0 } }).toArray()
}

export async function createBackup(stores, { now = new Date(), accounts = mongoAccounts } = {}) {
  const data = {}
  for (const name of COLLECTIONS) data[name] = stores[name] ? await stores[name].list({}) : []
  return { format: BACKUP_FORMAT, createdAt: now.toISOString(), collections: data, users: (await accounts()).map(backupAccount) }
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
    let setUpAgain = 0
    for (const { twoFactorLeftOut, ...u } of backup.users) {
      await users.updateOne({ uid: u.uid }, { $set: u }, { upsert: true })
      if (twoFactorLeftOut && !(await users.findOne({ uid: u.uid }, { projection: { twoFactorSecret: 1 } }))?.twoFactorSecret) setUpAgain += 1
    }
    counts.users = backup.users.length
    // Said by the restore, so nobody assumes their second step still guards these.
    if (setUpAgain) counts.twoFactorToSetUpAgain = setUpAgain
  }
  return counts
}
