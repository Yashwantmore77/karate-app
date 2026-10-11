// Empties the database and leaves one administrator. Run from packages/api:
//
//   npm run db:reset -- --yes
//
// Everything goes: tournaments, categories, players, matches, results, files,
// the audit and sign-in logs, and every account. In their place the script
// puts the single administrator named by BOOTSTRAP_ADMIN_EMAIL and
// BOOTSTRAP_ADMIN_PASSWORD, which is the same account an empty database would
// have created for itself at the next start.
//
// This is for handing a fresh installation over, or for clearing out test data
// before real entries arrive. There is no undo: take a backup first
// (`npm run backup -- backups/before-reset.json`) if the data might be wanted.

import { getDb, isMongoConfigured, closeMongo } from '../db/mongo.js'
import { initialAccounts } from '../auth/users.js'

/**
 * Drops every collection in `db` and inserts `accounts` into `users`.
 *
 * Dropping beats deleting the documents: it takes the indexes with it, so a
 * collection whose shape has changed since it was created comes back clean
 * rather than keeping an index nothing uses any more. MongoDB's own
 * `system.*` collections are left alone.
 */
export async function resetDatabase(db, accounts, { log = console.log } = {}) {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('system.'))
    .sort()

  for (const name of names) {
    await db.collection(name).drop()
    log(`  dropped ${name}`)
  }

  if (accounts.length) {
    const users = db.collection('users')
    await users.insertMany(accounts.map((account) => ({ ...account })))
    await users.createIndex({ email: 1 }, { unique: true })
    await users.createIndex({ uid: 1 }, { unique: true })
  }
  return names
}

const main = async () => {
  if (!isMongoConfigured()) {
    console.error('MONGODB_URI is not set, so there is no database to reset. The in-memory store starts empty in every new process.')
    return 1
  }

  // Checked before anything is dropped: a reset that empties the database and
  // leaves no way back in would be worse than no reset at all.
  const accounts = await initialAccounts()
  if (!accounts.length) {
    console.error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (8+ characters) first: they are the administrator this leaves behind, and without them nothing could sign in afterwards.')
    return 1
  }

  if (!process.argv.slice(2).includes('--yes')) {
    console.error('This deletes every record and every account in the database. Re-run with --yes to go ahead.')
    return 1
  }

  const db = await getDb()
  console.log(`Resetting ${db.databaseName}:`)
  const dropped = await resetDatabase(db, accounts)
  console.log(dropped.length ? `Dropped ${dropped.length} collections.` : 'Nothing to drop; the database was already empty.')
  console.log(`One account remains: ${accounts[0].email} (administrator).`)
  return 0
}

if (process.argv[1]?.endsWith('reset-db.js')) {
  const code = await main()
  await closeMongo()
  process.exit(code)
}
