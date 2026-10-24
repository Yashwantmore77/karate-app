import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDb, userRows } = vi.hoisted(() => {
  const userRows = new Map()
  return { getDb: vi.fn(), userRows }
})

vi.mock('./db/mongo.js', () => ({
  isMongoConfigured: () => true,
  getDb,
}))

import { BACKUP_FORMAT, restoreBackup } from './lib/backup.js'

const usersCollection = {
  countDocuments: vi.fn(async () => userRows.size),
  deleteMany: vi.fn(async ({ uid: { $nin: retainedUids } }) => {
    for (const uid of userRows.keys()) if (!retainedUids.includes(uid)) userRows.delete(uid)
  }),
  updateOne: vi.fn(async ({ uid }, { $set }) => {
    userRows.set(uid, { ...userRows.get(uid), ...$set })
  }),
  findOne: vi.fn(async ({ uid }) => userRows.get(uid) || null),
}

const backup = (users = []) => ({ format: BACKUP_FORMAT, collections: {}, users })

beforeEach(() => {
  userRows.clear()
  vi.clearAllMocks()
  getDb.mockResolvedValue({ collection: () => usersCollection })
})

describe('MongoDB account restore', () => {
  it('refuses a non-empty target even when only accounts exist', async () => {
    userRows.set('existing', { uid: 'existing' })

    await expect(restoreBackup({}, backup())).rejects.toMatchObject({ code: 'target_not_empty' })
  })

  it('removes accounts missing from a replacement and preserves retained two-factor secrets', async () => {
    userRows.set('retained', { uid: 'retained', twoFactorSecret: 'existing-secret' })
    userRows.set('stale', { uid: 'stale' })

    await restoreBackup({}, backup([
      { uid: 'retained', email: 'retained@example.com', twoFactorLeftOut: true },
      { uid: 'new', email: 'new@example.com' },
    ]), { replace: true })

    expect([...userRows.keys()].sort()).toEqual(['new', 'retained'])
    expect(userRows.get('retained')).toMatchObject({ twoFactorSecret: 'existing-secret' })
  })

  it('removes every account when the replacement backup has no accounts', async () => {
    userRows.set('existing', { uid: 'existing' })

    await restoreBackup({}, backup(), { replace: true })

    expect(userRows.size).toBe(0)
  })
})
