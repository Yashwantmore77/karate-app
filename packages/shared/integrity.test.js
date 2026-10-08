import { describe, it, expect } from 'vitest'
import { teamProblems, feeChange, tournamentProblems } from './tms.js'

describe('team details (review 9, 15)', () => {
  it('names each problem so forms can show it next to the field', () => {
    expect(teamProblems({ name: 'Dojo One', email: 'coach@dojo.in', mobile: '+91 98111 11111' })).toEqual({})
    expect(teamProblems({ name: 'D', email: 'nope', mobile: 'call me' })).toEqual({
      name: expect.any(String), email: expect.any(String), mobile: expect.any(String),
    })
    // An edit is checked only for what it changes.
    expect(teamProblems({ email: 'a@b.co' }, { partial: true })).toEqual({})
  })
})

describe('fee changes after payment (review 8)', () => {
  it('owes the difference, or a refund', () => {
    expect(feeChange({ status: 'PENDING', amount: 700 }, 1000)).toEqual({ status: 'PENDING', amount: 1000 })
    expect(feeChange({ status: 'PAID', amount: 700 }, 1000)).toMatchObject({ status: 'PENDING', paidAmount: 700, balanceDue: 300 })
    expect(feeChange({ status: 'PAID', amount: 1000, paidAmount: 1000 }, 500)).toMatchObject({ status: 'PAID', refundDue: 500 })
    expect(feeChange({ status: 'PAID', amount: 700 }, 700)).not.toHaveProperty('balanceDue')
  })
})

describe('tournament dates (review 10)', () => {
  const base = { startDate: '2027-01-15', endDate: '2027-01-16' }
  const fields = (t) => tournamentProblems(t).map((p) => p.field)
  it('closes registration by the last day and weighs in by then', () => {
    expect(fields({ ...base, registrationClose: '2027-01-16' })).toEqual([])
    expect(fields({ ...base, registrationClose: '2027-01-17T10:00' })).toEqual(['registrationClose'])
    expect(fields({ ...base, weighInDate: '2027-01-14' })).toEqual([])
    expect(fields({ ...base, weighInDate: '2027-01-20' })).toEqual(['weighInDate'])
  })
})
