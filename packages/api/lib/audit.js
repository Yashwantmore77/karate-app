// PRD section 48. Every change an official could later be asked to justify
// leaves a record: who, what, before, after, when and why.
//
// Written through the ordinary store contract, so it lands in Mongo or memory
// exactly like every other collection.

export const AUDIT_ACTIONS = {
  TOURNAMENT_STATUS_CHANGED: 'tournament.status_changed',
  PLAYER_UPDATED: 'player.updated',
  PLAYER_CATEGORY_OVERRIDDEN: 'player.category_overridden',
  REGISTRATION_STATUS_CHANGED: 'registration.status_changed',
  WEIGH_IN_RECORDED: 'weighin.recorded',
  ENTRIES_LOCKED: 'entries.locked',
  ENTRIES_UNLOCKED: 'entries.unlocked',
  DRAW_LOCKED: 'draw.locked',
  DRAW_UNLOCKED: 'draw.unlocked',
  POOLS_GENERATED: 'pools.generated',
  PLAYER_MOVED_POOL: 'pool.player_moved',
  MATCH_RESULT_CHANGED: 'match.result_changed',
  SCORE_UNDONE: 'match.score_undone',
}

/** Only the fields that actually differ, so a record says what changed. */
export function diff(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  const changed = {}
  for (const key of keys) {
    const from = before?.[key]
    const to = after?.[key]
    if (JSON.stringify(from) !== JSON.stringify(to)) changed[key] = { from, to }
  }
  return changed
}

/**
 * Records one auditable change. `actor` is the authenticated caller, so a
 * record can never claim to be someone the request was not.
 */
export function createAuditLog(collection) {
  return {
    async record({
      tournamentId, actor, action, entity, entityId, before, after, reason, requestMeta,
    }) {
      return collection.insert({
        tournamentId: tournamentId ?? null,
        actorId: actor?.uid ?? null,
        actorRole: actor?.role ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        changes: before || after ? diff(before, after) : null,
        reason: reason ?? null,
        ip: requestMeta?.ip ?? null,
        userAgent: requestMeta?.userAgent ?? null,
        at: new Date().toISOString(),
      })
    },

    trailFor: (entity, entityId) => collection.list({ entity, entityId }),
    forTournament: (tournamentId) => collection.list({ tournamentId }),
  }
}
