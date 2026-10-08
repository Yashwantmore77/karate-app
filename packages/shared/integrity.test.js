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

describe('standard category sets', () => {
  it('SGFI weights follow the federation chart', async () => {
    const { CATEGORY_PRESETS, weightClasses } = await import('./presets.js')
    const groups = CATEGORY_PRESETS.sgfi.groups
    expect(groups.map((g) => g.name)).toEqual(['U-14 Boys', 'U-14 Girls', 'U-17 Boys', 'U-17 Girls', 'U-19 Boys', 'U-19 Girls'])
    const u14boys = weightClasses(groups[0].weights)
    expect(u14boys[0]).toEqual({ name: '-20 KG', minWeight: null, maxWeight: 20 })
    expect(u14boys[1]).toEqual({ name: '-25 KG', minWeight: 20, maxWeight: 25 })
    expect(u14boys.at(-1)).toEqual({ name: '+60 KG', minWeight: 60, maxWeight: null })
    expect(groups.map((g) => g.weights.length)).toEqual([10, 11, 13, 11, 13, 11])
  })
})
