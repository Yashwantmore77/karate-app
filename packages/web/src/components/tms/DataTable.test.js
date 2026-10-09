import { describe, it, expect } from 'vitest'
import { tableRows, rowMatches } from './DataTable'
import { describeLiveEvent } from '../../pages/tms/MatchesTab'

describe('list exports (PRD point 29)', () => {
  it('writes the visible columns, using export and sort values, and leaves out actions', () => {
    const columns = [
      { key: 'name', label: 'Name' },
      { key: 'team', label: 'Team', value: (r) => r.teamName, render: () => 'JSX' },
      { key: 'payment', label: 'Payment', exportValue: (r) => r.payment.status },
      { key: 'events', label: 'Events' },
      { key: 'actions', label: '', render: () => 'buttons' },
    ]
    const rows = [{ name: 'Asha', teamName: 'ABC', payment: { status: 'PAID' }, events: ['kata', 'kumite'] }]
    expect(tableRows(columns, rows)).toEqual([['Name', 'Team', 'Payment', 'Events'], ['Asha', 'ABC', 'PAID', 'kata, kumite']])
  })
})

describe('list search', () => {
  it('finds a row by what the screen shows, not only by the value it sorts by', () => {
    const columns = [
      { key: 'matchNumber', label: 'Match', value: (m) => Number(String(m.matchNumber).replace(/\D/g, '')) },
      { key: 'payment', label: 'Payment', value: (r) => r.payment.status },
    ]
    const bout = { matchNumber: 'M-001', payment: { status: 'PAID' } }
    expect(rowMatches(columns, bout, 'm-001')).toBe(true)
    expect(rowMatches(columns, bout, '1')).toBe(true)
    expect(rowMatches(columns, bout, 'paid')).toBe(true)
    // A field that is an object is never searched as "[object Object]".
    expect(rowMatches(columns, bout, 'object')).toBe(false)
    expect(rowMatches(columns, bout, 'm-002')).toBe(false)
  })
})

describe('live score log (PRD point 33)', () => {
  it('reads a score change as a sentence', () => {
    expect(describeLiveEvent({ cmd: 'SCORE', payload: { side: 'aka', type: 'wazaAri' }, scoreBefore: { aka: 2, ao: 0 }, scoreAfter: { aka: 4, ao: 0 } }))
      .toBe('Waza-ari to AKA — AKA 2 → 4, AO 0 → 0')
    expect(describeLiveEvent({ cmd: 'TIMEOUT', payload: { side: 'ao' }, scoreBefore: { aka: 1, ao: 1 }, scoreAfter: { aka: 1, ao: 1 } })).toBe('Timeout for AO')
  })
})
