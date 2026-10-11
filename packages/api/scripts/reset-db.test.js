import { describe, it, expect } from 'vitest'
import { resetDatabase } from './reset-db.js'

/**
 * Enough of a MongoDB database to see what the reset does to it: which
 * collections it drops, and what it puts back.
 */
const fakeDb = (seed) => {
  const data = new Map(Object.entries(seed))
  const indexes = []
  return {
    databaseName: 'kumite-test',
    contents: data,
    indexes,
    listCollections: () => ({ toArray: async () => [...data.keys()].map((name) => ({ name })) }),
    collection: (name) => ({
      drop: async () => { data.delete(name) },
      insertMany: async (docs) => { data.set(name, docs) },
      createIndex: async (spec, options) => { indexes.push({ name, spec, options }) },
    }),
  }
}

const ADMIN = { uid: 'u1', email: 'boss@club.test', role: 'admin', passwordHash: 'salt:hash' }

describe('resetDatabase', () => {
  it('takes every collection with it and leaves one administrator', async () => {
    const db = fakeDb({
      tournaments: [{ id: 't1' }], categories: [{ id: 'c1' }], competitors: [{ id: 'p1' }],
      matches: [{ id: 'm1' }], auditLog: [{ id: 'a1' }], loginEvents: [{ id: 'l1' }],
      users: [{ uid: 'old' }, { uid: 'older' }],
    })

    const dropped = await resetDatabase(db, [ADMIN], { log: () => {} })

    expect(dropped).toEqual(['auditLog', 'categories', 'competitors', 'loginEvents', 'matches', 'tournaments', 'users'])
    // The fresh data the operator is about to enter goes into an empty
    // database, not alongside the last event's.
    expect([...db.contents.keys()]).toEqual(['users'])
    expect(db.contents.get('users')).toEqual([ADMIN])
  })

  it('puts the unique indexes back on the accounts it inserts', async () => {
    const db = fakeDb({ users: [{ uid: 'old' }] })
    await resetDatabase(db, [ADMIN], { log: () => {} })
    // Dropping a collection takes its indexes too, so without this a second
    // account could be created on an address that already has one.
    expect(db.indexes).toEqual([
      { name: 'users', spec: { email: 1 }, options: { unique: true } },
      { name: 'users', spec: { uid: 1 }, options: { unique: true } },
    ])
  })

  it("leaves MongoDB's own collections alone", async () => {
    const db = fakeDb({ 'system.views': [{}], tournaments: [{ id: 't1' }] })
    const dropped = await resetDatabase(db, [ADMIN], { log: () => {} })
    expect(dropped).toEqual(['tournaments'])
    expect(db.contents.has('system.views')).toBe(true)
  })

  it('works on a database that is already empty', async () => {
    const db = fakeDb({})
    expect(await resetDatabase(db, [ADMIN], { log: () => {} })).toEqual([])
    expect(db.contents.get('users')).toEqual([ADMIN])
  })
})
