import { describe, it, expect, beforeEach } from 'vitest'
import { offlineMatch } from './offline'
import { initialMatchState, stepBout } from '@kumite/shared/commands.js'

// Offline scoring: the device applies actions with the same shared step the
// server runs, keeps them in order with their times, and survives a reload.

describe('offline scoring record', () => {
  beforeEach(() => localStorage.clear())

  it('scores on the device, keeps every action, and survives a reload', () => {
    const start = initialMatchState()
    const rec = offlineMatch('m-off')
    rec.begin({ seq: 7, handoffs: 1, state: start })
    const s1 = rec.apply('SCORE', { side: 'aka', type: 'ippon' }, 1000)
    expect(s1.match.scores.aka).toBe(3)
    rec.apply('SCORE', { side: 'ao', type: 'yuko' }, 2000)
    rec.apply('UNDO', {}, 3000)
    expect(rec.record.state.match.scores).toEqual({ aka: 3, ao: 0 })
    expect(rec.pending).toBe(3)
    expect(rec.record).toMatchObject({ baseSeq: 7, handoffs: 1 })
    // a reload reads the same record back
    const again = offlineMatch('m-off')
    expect(again.pending).toBe(3)
    expect(again.record.actions.map((a) => a.cmd)).toEqual(['SCORE', 'SCORE', 'UNDO'])
    expect(new Set(again.record.actions.map((a) => a.clientEventId)).size).toBe(3)
  })

  it('replays to the same result the server reaches', () => {
    const start = initialMatchState()
    const rec = offlineMatch('m-same')
    rec.begin({ seq: 0, handoffs: 0, state: start })
    const actions = [['SCORE', { side: 'aka', type: 'wazaAri' }], ['SCORE', { side: 'ao', type: 'ippon' }], ['UNDO', {}], ['SCORE', { side: 'aka', type: 'yuko' }]]
    actions.forEach(([cmd, payload], i) => rec.apply(cmd, payload, 1000 + i))
    // the server steps the same actions with the same shared function
    let server = { state: start, history: [] }
    for (const a of rec.record.actions) server = stepBout(server, a.cmd, a.payload, a.at)
    expect(server.state.match.scores).toEqual(rec.record.state.match.scores)
  })

  it('ignores an undo with nothing to undo, and clears once synced', () => {
    const rec = offlineMatch('m-empty')
    rec.begin({ seq: 0, handoffs: 0, state: initialMatchState() })
    expect(rec.apply('UNDO', {}, 1)).toBeNull()
    expect(rec.pending).toBe(0)
    rec.apply('SCORE', { side: 'aka', type: 'yuko' }, 2)
    rec.dropFirst()
    expect(rec.pending).toBe(0)
    rec.clear()
    expect(offlineMatch('m-empty').record).toBeNull()
  })
})
