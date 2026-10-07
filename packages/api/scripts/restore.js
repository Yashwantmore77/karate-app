// Restores a backup written by `npm run backup`. Run from packages/api:
//
//   npm run restore -- backups/day1.json            into an empty database
//   npm run restore -- backups/day1.json --replace  wipe and replace
//
// Without --replace it refuses a database that already holds data.

import { readFile } from 'node:fs/promises'
import { createStores } from '../lib/store.js'
import { restoreBackup } from '../lib/backup.js'
import { isMongoConfigured, closeMongo } from '../db/mongo.js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Usage: npm run restore -- <backup.json> [--replace]')
  process.exit(1)
}
if (!isMongoConfigured()) console.warn('MONGODB_URI is not set: restoring into memory only checks the file.')
try {
  const counts = await restoreBackup(createStores(), JSON.parse(await readFile(file, 'utf8')), { replace: args.includes('--replace') })
  console.error(`Restored: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'}`)
} catch (err) {
  console.error(`Restore failed: ${err.code || err.message}`)
  process.exitCode = 1
} finally {
  await closeMongo()
}
