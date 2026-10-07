import { describe, it, expect } from 'vitest'
import { matchesQuery, toMongo, searchRows } from './query.js'

const rows = [
  { id: '1', name: 'asha Rao', club: 'ABC Dojo', events: ['kata', 'kumite'], payment: { status: 'PAID' }, entries: { kata: { ageGroupId: 'g1' } } },
  { id: '2', name: 'Ravi Kumar', club: 'abc dojo', events: ['kumite'], entries: { kumite: { ageGroupId: 'g2' } } },
  { id: '3', name: 'Bina', club: 'XYZ', events: ['kata'], payment: { status: 'PENDING' }, entries: {} },
]

describe('portable store query (PRD section 62)', () => {
  it('filters by equality, array membership, case, substring, absence and either/or', () => {
    const ids = (q) => rows.filter((r) => matchesQuery(r, q)).map((r) => r.id)
    expect(ids({ events: 'kumite' })).toEqual(['1', '2'])
    expect(ids({ club: { $ieq: 'ABC DOJO' } })).toEqual(['1', '2'])
    expect(ids({ name: { $contains: 'ra' } })).toEqual(['1', '2'])
    expect(ids({ $or: [{ 'payment.status': 'PENDING' }, { 'payment.status': { $missing: true } }] })).toEqual(['2', '3'])
    expect(ids({ $or: [{ 'entries.kata.ageGroupId': 'g2' }, { 'entries.kumite.ageGroupId': 'g2' }] })).toEqual(['2'])
    expect(ids({ id: { $in: ['1', '3'] } })).toEqual(['1', '3'])
  })

  it('sorts ignoring case and pages with the total', () => {
    const { rows: page, total } = searchRows(rows, {}, { sort: { name: 1 }, skip: 1, limit: 1 })
    expect(total).toBe(3)
    expect(page.map((r) => r.name)).toEqual(['Bina'])
  })

  it('escapes text before it becomes a database regex', () => {
    expect(toMongo({ name: { $contains: '(a+)+' } })).toEqual({ name: { $regex: '\\(a\\+\\)\\+', $options: 'i' } })
    expect(toMongo({ club: { $ieq: 'A.B' } }).club.$regex).toBe('^A\\.B$')
    expect(toMongo({ $and: [{ x: 1 }, { y: { $missing: true } }] })).toEqual({ $and: [{ x: 1 }, { y: { $in: [null] } }] })
  })
})
