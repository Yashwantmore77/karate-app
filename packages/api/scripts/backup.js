// Writes a full backup (PRD v1 §23) as JSON. Run from packages/api:
//
//   npm run backup                       print to stdout
//   npm run backup -- backups/day1.json  write to a file
//
// Reads .env like the server, so with MONGODB_URI set it backs up that
// database. Schedule it with cron for the "automated" part.

import { writeFile } from 'node:fs/promises'
import { createStores } from '../lib/store.js'
import { createBackup } from '../lib/backup.js'
import { isMongoConfigured, closeMongo } from '../db/mongo.js'

if (!isMongoConfigured()) console.warn('MONGODB_URI is not set: the in-memory store is empty in a separate process.')
const backup = await createBackup(createStores())
const json = JSON.stringify(backup)
const [out] = process.argv.slice(2)
if (out) {
  await writeFile(out, json)
  const rows = Object.values(backup.collections).reduce((n, list) => n + list.length, 0)
  console.error(`Backup written to ${out}: ${rows} records, ${backup.users.length} accounts.`)
} else {
  process.stdout.write(json)
}
await closeMongo()
