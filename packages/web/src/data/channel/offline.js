import { stepBout, applyExpiry, withOutcome } from '@kumite/shared/commands.js'
import { remainingNow } from '@kumite/shared/clock.js'

// Offline scoring (Phase 2). When the connection drops while this device
// holds a mat, the console keeps scoring on the device with the same shared
// step the server runs, and every action is kept, in order, with the time it
// happened. On reconnect the actions are replayed to the server, each with
// its own id so none is applied twice. The record survives a page reload.

const KEY = (matchId) => `kt:v1:offline:${matchId}`

const read = (matchId) => {
  try { return JSON.parse(localStorage.getItem(KEY(matchId)) || 'null') } catch { return null }
}
const write = (matchId, record) => {
  try {
    if (record) localStorage.setItem(KEY(matchId), JSON.stringify(record))
    else localStorage.removeItem(KEY(matchId))
  } catch { /* storage full or blocked: the actions stay in memory */ }
}

/**
 * The offline record for one bout:
 *   { baseSeq, handoffs, state, history, actions: [{ cmd, payload, clientEventId, at }] }
 * baseSeq / handoffs are what the server had when the connection dropped.
 */
export function offlineMatch(matchId) {
  let record = read(matchId)
  return {
    get record() { return record },
    get pending() { return record?.actions.length || 0 },
    /** Starts offline scoring from the last state the server sent. */
    begin({ seq, handoffs, state, history = [] }) {
      if (record) return record
      record = { baseSeq: seq, handoffs: handoffs ?? 0, state, history, actions: [] }
      write(matchId, record)
      return record
    },
    /** Applies one action on the device; returns the new state, or null if nothing changed. */
    apply(cmd, payload, at, clientEventId = null) {
      if (!record) return null
      const step = stepBout({ state: record.state, history: record.history }, cmd, payload, at)
      // Kept even when it changes nothing locally (the server decides), except an empty undo.
      if (!step.changed && cmd === 'UNDO') return null
      record = {
        ...record,
        state: step.state,
        history: step.history,
        actions: [...record.actions, { cmd, payload: payload ?? {}, clientEventId: clientEventId || `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at }],
      }
      write(matchId, record)
      return step.changed ? step.state : null
    },
    /** Time running out while offline, as the server would note it. */
    expire(at) {
      if (!record) return null
      const next = withOutcome(applyExpiry(record.state, at, remainingNow), undefined, at)
      if (next === record.state) return null
      record = { ...record, state: next }
      write(matchId, record)
      return next
    },
    /** Drops actions the server has taken (or that the referee discarded). */
    clear() { record = null; write(matchId, null) },
    dropFirst() {
      if (!record) return
      record = { ...record, actions: record.actions.slice(1) }
      write(matchId, record)
    },
  }
}
