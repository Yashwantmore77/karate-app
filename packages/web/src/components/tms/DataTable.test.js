import { describe, it, expect } from 'vitest'
import { tableRows } from './DataTable'
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

describe('live score log (PRD point 33)', () => {
  it('reads a score change as a sentence', () => {
    expect(describeLiveEvent({ cmd: 'SCORE', payload: { side: 'aka', type: 'wazaAri' }, scoreBefore: { aka: 2, ao: 0 }, scoreAfter: { aka: 4, ao: 0 } }))
      .toBe('Waza-ari to AKA — AKA 2 → 4, AO 0 → 0')
    expect(describeLiveEvent({ cmd: 'TIMEOUT', payload: { side: 'ao' }, scoreBefore: { aka: 1, ao: 1 }, scoreAfter: { aka: 1, ao: 1 } })).toBe('Timeout for AO')
  })
})
