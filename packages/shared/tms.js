// The tournament management service: every PRD workflow from setup to
// certificates, written once against the store contract
// ({ list, get, insert, update, remove, removeWhere }).
//
// The API runs it on Mongo or memory; the offline web build runs the very same
// code on localStorage. That is how the business rules (locks, audit, Rule 1
// ages, Rule 6 corrections) cannot differ between the two.
//
// Authorisation of *who* may call a method is the caller's job (the API's role
// guards, the web's routes). What is enforced here is what no caller may skip:
// locks, lifecycles, coaches touching only their own team, and the audit trail.

import { calculateAge } from './age.js'
import { categorizePlayer, categoryLabel, EVENTS } from './categories.js'
import {
  TOURNAMENT_STATUS, REGISTRATION_STATUS, tournamentLifecycle, registrationLifecycle,
  assertTransition, InvalidTransition,
} from './lifecycle.js'
import { AUDIT_ACTIONS as A, createAuditLog, diff } from './audit.js'
import { DomainError, rule, invalid, missing, denied } from './errors.js'
import { DEFAULT_POOL_SIZE, DRAW_METHODS, POOL_MODES, drawPools, roundRobin, seededRandom, poolName, shuffle as shuffleWith } from './pools.js'
import {
  DEFAULT_RESULT_RULES, poolStandings, poolComplete, qualifierSeeds, buildBracket,
  bracketMedals, poolMedals, medalTally, boutOutcome,
} from './results.js'
import {
  formFields, normalizeForm, validatePlayer, validateBulkRows, parseCsv, playerIdentity,
  publicPlayer, publicTeam,
} from './registration.js'
import { hashSecret, verifySecret, randomToken } from './secret.js'
import { checkFile, base64Size, safeFileName, FILE_PURPOSES } from './files.js'
import { paginate, pageOptions } from './paging.js'
import { normalizeKataScore, kataFinal, rankKata } from './kata.js'

const R = REGISTRATION_STATUS
const T = TOURNAMENT_STATUS

export const DEFAULT_SETTINGS = {
  poolSize: DEFAULT_POOL_SIZE,
  ...DEFAULT_RESULT_RULES,
  mats: 2,
  matchDurationSec: 180,
  pointGap: 8,
  weighInAutoMove: true,
  emailNotifications: true,
  // PRD point 12: how uneven entries are split (see pools.js POOL_MODES).
  poolMode: 'max',
  // Round robin in pools, or straight knockout.
  poolSystem: 'round_robin',
  // PRD point 16: score values, yuko / waza-ari / ippon.
  points: { yuko: 1, wazaAri: 2, ippon: 3 },
  ruleset: 'WKF',
  // PRD point 19: kata is judged by a panel, not fought as bouts.
  kataMode: 'panel',
  kataJudges: 5,
  kataMethod: 'drop_high_low_average',
  kataQualifiers: 8,
  kataRounds: 2,
  fees: { kata: 0, kumite: 0, both: 0, team: 0 },
}

export const PAYMENT_STATUS = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
export const RESULT_TYPES = ['COMPLETED', 'WALKOVER', 'DISQUALIFIED', 'CANCELLED']
export const WEIGH_IN_STATUS = ['PENDING', 'PASSED', 'FAILED', 'RECHECK_REQUIRED']

// A player takes part in the draw once approved, and not if rejected.
const DRAW_ELIGIBLE = new Set([
  R.APPROVED, R.PAYMENT_PENDING, R.PAYMENT_VERIFIED, R.WEIGH_IN_PENDING,
  R.WEIGH_IN_VERIFIED, R.CATEGORY_CONFIRMED, R.DRAW_ASSIGNED, R.COMPLETED,
])

export const divisionKey = (event, ageGroupId, weightCategoryId) =>
  `${event}:${ageGroupId}:${event === EVENTS.KATA ? '-' : (weightCategoryId || '-')}`

export const parseDivisionKey = (key) => {
  const [event, ageGroupId, weightCategoryId] = String(key).split(':')
  return { event, ageGroupId, weightCategoryId: weightCategoryId === '-' ? null : weightCategoryId }
}

const pad = (n, width = 3) => String(n).padStart(width, '0')
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''))
const LOCKED_PLAYER_FIELDS = ['dob', 'gender', 'weight', 'events', 'teamId']

export function settingsOf(tournament) {
  const s = { ...DEFAULT_SETTINGS, ...(tournament?.settings || {}) }
  s.fees = { ...DEFAULT_SETTINGS.fees, ...(tournament?.settings?.fees || {}) }
  s.points = { ...DEFAULT_SETTINGS.points, ...(tournament?.settings?.points || {}) }
  return s
}

/**
 * What a single category may set for itself (PRD point 3); anything it leaves
 * out falls back to its age group, then to the tournament.
 */
export const CATEGORY_SETTING_KEYS = [
  'poolSize', 'poolMode', 'poolSystem', 'matchDurationSec', 'pointGap', 'qualifiersPerPool',
  'ruleset', 'kataJudges', 'kataMethod', 'kataQualifiers', 'kataRounds',
]

export const POOL_SYSTEMS = ['round_robin', 'knockout']
export const KATA_METHODS = ['drop_high_low_average', 'average', 'drop_high_low_sum', 'sum']

const SETTING_LIMITS = {
  poolSize: [2, 64], matchDurationSec: [30, 600], pointGap: [0, 20], qualifiersPerPool: [1, 8],
  kataJudges: [3, 7], kataQualifiers: [1, 64], kataRounds: [1, 5],
}

/** Keeps only valid category overrides; an empty value means "inherit". */
export function normalizeCategorySettings(input) {
  if (!input || typeof input !== 'object') return {}
  const out = {}
  for (const key of CATEGORY_SETTING_KEYS) {
    const v = input[key]
    if (v === undefined || v === null || v === '') continue
    if (SETTING_LIMITS[key]) {
      const n = Number(v)
      if (!Number.isInteger(n) || n < SETTING_LIMITS[key][0] || n > SETTING_LIMITS[key][1]) throw invalid(`invalid_${key}`)
      out[key] = n
    } else if (key === 'poolMode') {
      if (!POOL_MODES.includes(v)) throw invalid('invalid_poolMode')
      out[key] = v
    } else if (key === 'poolSystem') {
      if (!POOL_SYSTEMS.includes(v)) throw invalid('invalid_poolSystem')
      out[key] = v
    } else if (key === 'kataMethod') {
      if (!KATA_METHODS.includes(v)) throw invalid('invalid_kataMethod')
      out[key] = v
    } else {
      out[key] = String(v).slice(0, 60)
    }
  }
  return out
}

/** Tournament settings with the age group's, then the weight category's, overrides. */
export function divisionSettingsOf(tournament, ageGroup, weightCategory) {
  return { ...settingsOf(tournament), ...(ageGroup?.settings || {}), ...(weightCategory?.settings || {}) }
}

export const lifecycleOf = (tournament) => tournament?.lifecycleStatus || T.DRAFT

/** What a player owes for the events they entered (section 18). */
export function feeFor(player, settings) {
  const events = player.events || []
  if (events.includes('kata') && events.includes('kumite')) {
    return settings.fees.both || (settings.fees.kata + settings.fees.kumite)
  }
  return events.reduce((sum, e) => sum + (settings.fees[e] || 0), 0)
}

export function createTms(stores, { now = () => new Date(), onNotify = null } = {}) {
  const audit = createAuditLog(stores.auditLog)
  const iso = () => now().toISOString()

  // --- helpers --------------------------------------------------------------

  const load = async (collection, id, code = 'not_found') => {
    const row = id ? await stores[collection].get(id) : null
    if (!row) throw missing(code)
    return row
  }

  const tournamentOf = (id) => load('tournaments', id, 'tournament_not_found')

  const inTournament = async (collection, tournamentId, id) => {
    const row = await load(collection, id)
    if (row.tournamentId !== tournamentId) throw missing()
    return row
  }

  const record = (actor, entry) => audit.record({ actor, requestMeta: actor?.meta, ...entry })

  // In-app first; then any other channel the host wires in (the API sends
  // email). A failing channel never fails the action that caused it.
  const notify = async (tournamentId, audience, type, message, extra = {}) => {
    const row = await stores.notifications.insert({ tournamentId, audience, type, message, read: false, at: iso(), ...extra })
    if (onNotify) {
      try {
        const tournament = await stores.tournaments.get(tournamentId)
        if (settingsOf(tournament).emailNotifications !== false) await onNotify(row, tournament)
      } catch {
        // the in-app notification stands
      }
    }
    return row
  }

  const config = async (tournamentId) => {
    const tournament = await tournamentOf(tournamentId)
    const [ageGroups, weightCategories] = await Promise.all([
      stores.ageGroups.list({ tournamentId }),
      stores.weightCategories.list({ tournamentId }),
    ])
    return { tournament, masterAgeDate: tournament.masterAgeDate, ageGroups, weightCategories, settings: settingsOf(tournament) }
  }

  const divisionSettingsFor = (cfg, division) => divisionSettingsOf(
    cfg.tournament,
    cfg.ageGroups.find((g) => g.id === division.ageGroupId),
    cfg.weightCategories.find((w) => w.id === division.weightCategoryId),
  )

  // Kata judged by a panel has rounds, not pools and bouts (PRD point 19).
  const isPanelKata = (division, settings) => division.event === EVENTS.KATA && settings.kataMode === 'panel'

  const assertConfigOpen = (tournament) => {
    if (tournament.entriesLocked) throw rule('entries_locked')
  }

  const isCoach = (actor) => actor?.role === 'coach'

  /** Rule 7, and a coach only ever reaches their own team. */
  const assertCoachMayWrite = (actor, tournament, teamId) => {
    if (!isCoach(actor)) return
    if (actor.tournamentId !== tournament.id) throw denied()
    if (teamId !== undefined && actor.teamId !== teamId) throw denied('not_your_team')
    if (tournament.entriesLocked) throw rule('entries_locked')
    if (lifecycleOf(tournament) !== T.REGISTRATION_OPEN) throw rule('registration_closed')
  }

  /**
   * Rule 1 and Rule 2: recompute age and suggested categories. An entry an
   * admin overrode keeps the override; everything else follows the data.
   */
  const categorizeFields = (player, cfg) => {
    const age = calculateAge(player.dob, cfg.tournament.masterAgeDate)
    const entries = {}
    const issues = []
    for (const event of player.events || []) {
      const previous = player.entries?.[event]
      if (previous?.override) {
        entries[event] = { ...previous, divisionKey: divisionKey(event, previous.ageGroupId, previous.weightCategoryId) }
        continue
      }
      const suggestion = categorizePlayer(player, event, cfg)
      suggestion.issues.forEach((message) => issues.push({ event, message }))
      entries[event] = {
        ageGroupId: suggestion.ageGroup?.id || null,
        weightCategoryId: suggestion.weightCategory?.id || null,
        override: false,
        resolved: suggestion.resolved,
        divisionKey: suggestion.resolved
          ? divisionKey(event, suggestion.ageGroup.id, suggestion.weightCategory?.id) : null,
      }
    }
    return { age, entries, categoryIssues: issues }
  }

  const advanceRegistration = (player, target) => {
    const from = player.registrationStatus || R.DRAFT
    return registrationLifecycle.can(from, target) ? target : from
  }

  /** Walks forward through each step the lifecycle allows, stopping at the first it does not. */
  const walkRegistration = (status, steps) => {
    let current = status || R.DRAFT
    for (const step of steps) if (registrationLifecycle.can(current, step)) current = step
    return current
  }

  // --- tournament -------------------------------------------------------------

  async function updateTournament(actor, tournamentId, patch) {
    const before = await tournamentOf(tournamentId)
    // Rule 1 depends on the master date: changing it after entries are locked
    // would silently move every player.
    if ('masterAgeDate' in patch && patch.masterAgeDate !== before.masterAgeDate) assertConfigOpen(before)
    const next = { ...patch }
    if (patch.settings) next.settings = { ...(before.settings || {}), ...patch.settings }
    const after = await stores.tournaments.update(tournamentId, next)
    await record(actor, { tournamentId, action: A.TOURNAMENT_UPDATED, entity: 'tournament', entityId: tournamentId, before, after: { ...before, ...next } })
    if ('masterAgeDate' in patch) await recategorizeAll(actor, tournamentId, { silent: true })
    return after
  }

  async function setLifecycle(actor, tournamentId, to, reason = null) {
    const tournament = await tournamentOf(tournamentId)
    const from = lifecycleOf(tournament)
    try {
      assertTransition(tournamentLifecycle, from, to)
    } catch (err) {
      if (err instanceof InvalidTransition) throw rule('invalid_transition', { from, to })
      throw err
    }
    if (to === T.REGISTRATION_OPEN && !tournament.masterAgeDate) throw rule('master_age_date_required')
    const after = await stores.tournaments.update(tournamentId, { lifecycleStatus: to })
    await record(actor, { tournamentId, action: A.TOURNAMENT_STATUS_CHANGED, entity: 'tournament', entityId: tournamentId, before: { lifecycleStatus: from }, after: { lifecycleStatus: to }, reason })
    return after
  }

  async function setEntriesLock(actor, tournamentId, locked, reason = null) {
    const tournament = await tournamentOf(tournamentId)
    if (!!tournament.entriesLocked === !!locked) return tournament
    if (!locked) {
      if (tournament.drawLocked) throw rule('draw_locked')
      if (!reason) throw invalid('reason_required')
    }
    const after = await stores.tournaments.update(tournamentId, { entriesLocked: !!locked })
    await record(actor, { tournamentId, action: locked ? A.ENTRIES_LOCKED : A.ENTRIES_UNLOCKED, entity: 'tournament', entityId: tournamentId, reason })
    return after
  }

  async function setDrawLock(actor, tournamentId, locked, reason = null) {
    const tournament = await tournamentOf(tournamentId)
    if (!!tournament.drawLocked === !!locked) return tournament
    if (locked) {
      if (!tournament.entriesLocked) throw rule('entries_not_locked')
      const pools = await stores.pools.list({ tournamentId })
      // Panel kata has rounds instead of pools, so it alone is enough.
      if (!pools.length && !(await kataDivisions(tournamentId)).length) throw rule('no_pools')
    } else if (!reason) throw invalid('reason_required')
    const after = await stores.tournaments.update(tournamentId, { drawLocked: !!locked })
    await record(actor, { tournamentId, action: locked ? A.DRAW_LOCKED : A.DRAW_UNLOCKED, entity: 'tournament', entityId: tournamentId, reason })
    if (locked) await notify(tournamentId, 'team', 'draw_published', 'The draw has been published.')
    return after
  }

  async function updateForm(actor, tournamentId, fields) {
    const before = await tournamentOf(tournamentId)
    if (!Array.isArray(fields)) throw invalid('invalid_fields')
    const registrationForm = normalizeForm(fields)
    const after = await stores.tournaments.update(tournamentId, { registrationForm })
    await record(actor, { tournamentId, action: A.FORM_UPDATED, entity: 'tournament', entityId: tournamentId, before: { registrationForm: before.registrationForm || null }, after: { registrationForm } })
    return after
  }

  // --- age groups and weight categories ------------------------------------

  const configCrud = (collection, entity, validateDoc) => ({
    list: async (tournamentId) => (await stores[collection].list({ tournamentId })).sort((a, b) =>
      (a.minAge ?? 0) - (b.minAge ?? 0) || (a.maxWeight ?? 999) - (b.maxWeight ?? 999) || byName(a, b)),
    async create(actor, tournamentId, doc) {
      const tournament = await tournamentOf(tournamentId)
      assertConfigOpen(tournament)
      await validateDoc(tournamentId, doc)
      const row = await stores[collection].insert({ active: true, ...doc, settings: normalizeCategorySettings(doc.settings), tournamentId })
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: row.id, after: row })
      await recategorizeAll(actor, tournamentId, { silent: true })
      return row
    },
    async update(actor, tournamentId, id, patch) {
      const tournament = await tournamentOf(tournamentId)
      // Category settings (pool size, duration, ...) decide nobody's category,
      // so they may still be tuned after entries are locked; nothing else may.
      const settingsOnly = Object.keys(patch).every((k) => k === 'settings')
      if (!settingsOnly) assertConfigOpen(tournament)
      const before = await inTournament(collection, tournamentId, id)
      const next = { ...patch }
      if ('settings' in patch) next.settings = normalizeCategorySettings(patch.settings)
      await validateDoc(tournamentId, { ...before, ...next })
      const after = await stores[collection].update(id, next)
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: id, before, after })
      if (!settingsOnly) await recategorizeAll(actor, tournamentId, { silent: true })
      return after
    },
    async remove(actor, tournamentId, id) {
      const tournament = await tournamentOf(tournamentId)
      assertConfigOpen(tournament)
      const before = await inTournament(collection, tournamentId, id)
      if (collection === 'ageGroups') await stores.weightCategories.removeWhere({ tournamentId, ageGroupId: id })
      await stores[collection].remove(id)
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: id, before, reason: 'deleted' })
      await recategorizeAll(actor, tournamentId, { silent: true })
    },
  })

  const ageGroups = configCrud('ageGroups', 'age_group', async (_tid, doc) => {
    if (!doc.name) throw invalid('name_required')
    if (!['M', 'F', 'Mixed'].includes(doc.gender)) throw invalid('invalid_gender')
    if (!(doc.minAge >= 0) || !(doc.maxAge >= doc.minAge)) throw invalid('invalid_age_range')
  })

  const weightCategories = configCrud('weightCategories', 'weight_category', async (tournamentId, doc) => {
    if (!doc.name) throw invalid('name_required')
    await inTournament('ageGroups', tournamentId, doc.ageGroupId).catch(() => { throw invalid('invalid_ageGroupId') })
    if (doc.minWeight == null && doc.maxWeight == null) throw invalid('weight_bound_required')
    if (doc.minWeight != null && doc.maxWeight != null && doc.maxWeight <= doc.minWeight) throw invalid('invalid_weight_range')
  })

  // --- teams ------------------------------------------------------------------

  const teams = {
    list: async (tournamentId) => (await stores.teams.list({ tournamentId })).sort(byName),
    get: (tournamentId, id) => inTournament('teams', tournamentId, id),
    async create(actor, tournamentId, doc) {
      const tournament = await tournamentOf(tournamentId)
      if (isCoach(actor)) {
        assertCoachMayWrite(actor, tournament)
        if (actor.teamId) throw rule('team_already_registered')
      } else if (tournament.entriesLocked) throw rule('entries_locked')
      if (!doc.name) throw invalid('name_required')
      const existing = await stores.teams.list({ tournamentId })
      if (existing.some((t) => t.name.trim().toLowerCase() === doc.name.trim().toLowerCase())) throw rule('team_exists')
      const row = await stores.teams.insert({ ...doc, tournamentId })
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: row.id, after: row })
      if (isCoach(actor)) await notify(tournamentId, 'admin', 'new_registration', `New team registered: ${row.name}`)
      return row
    },
    async update(actor, tournamentId, id, patch) {
      const tournament = await tournamentOf(tournamentId)
      assertCoachMayWrite(actor, tournament, id)
      const before = await inTournament('teams', tournamentId, id)
      const after = await stores.teams.update(id, patch)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: id, before, after })
      return after
    },
    async remove(actor, tournamentId, id) {
      const tournament = await tournamentOf(tournamentId)
      if (tournament.entriesLocked) throw rule('entries_locked')
      assertCoachMayWrite(actor, tournament, id)
      const before = await inTournament('teams', tournamentId, id)
      const players = await stores.players.list({ tournamentId, teamId: id })
      for (const p of players) await stores.players.remove(p.id)
      await stores.teams.remove(id)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: id, before, reason: `deleted with ${players.length} players` })
    },
  }

  // --- players ----------------------------------------------------------------

  const matchesFilter = (player, f, cfg) => {
    if (f.teamId && player.teamId !== f.teamId) return false
    if (f.gender && player.gender !== f.gender) return false
    if (f.event && !(player.events || []).includes(f.event)) return false
    if (f.registrationStatus && player.registrationStatus !== f.registrationStatus) return false
    if (f.paymentStatus && (player.payment?.status || 'PENDING') !== f.paymentStatus) return false
    if (f.weighInStatus && (player.weighIn?.status || 'PENDING') !== f.weighInStatus) return false
    if (f.ageGroupId && !Object.values(player.entries || {}).some((e) => e.ageGroupId === f.ageGroupId)) return false
    if (f.weightCategoryId && player.entries?.kumite?.weightCategoryId !== f.weightCategoryId) return false
    for (const key of ['club', 'district', 'state', 'country']) {
      if (f[key] && String(player[key] || '').toLowerCase() !== String(f[key]).toLowerCase()) return false
    }
    if (f.q) {
      const q = String(f.q).toLowerCase()
      const team = cfg.teamsById.get(player.teamId)
      const hay = [player.name, player.id, player.playerNumber, player.club, team?.name, team?.code].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }

  async function listPlayers(tournamentId, filter = {}) {
    const [rows, teamRows] = await Promise.all([
      stores.players.list({ tournamentId }),
      stores.teams.list({ tournamentId }),
    ])
    const teamsById = new Map(teamRows.map((t) => [t.id, t]))
    return rows.filter((p) => matchesFilter(p, filter, { teamsById })).sort(byName)
  }

  /** A page of players (section 62), with the same filters as listPlayers. */
  async function pagePlayers(tournamentId, filter = {}, options = {}) {
    return paginate(await listPlayers(tournamentId, filter), { sort: 'name', ...options })
  }

  /**
   * A page of the audit trail, newest first. Paged in the store itself, so a
   * long tournament's thousands of records are never all read for one screen;
   * a text search falls back to reading them.
   */
  async function pageAudit(tournamentId, { q, ...options } = {}) {
    const { page, pageSize } = pageOptions(options)
    if (q) {
      const needle = String(q).toLowerCase()
      const all = (await audit.forTournament(tournamentId)).filter((a) =>
        [a.action, a.actorId, a.actorRole, a.entity, a.entityId, a.reason].join(' ').toLowerCase().includes(needle))
      return paginate(all, { page, pageSize })
    }
    const [rows, total] = await Promise.all([
      stores.auditLog.list({ tournamentId }, { sort: { at: -1 }, skip: page * pageSize, limit: pageSize }),
      stores.auditLog.count({ tournamentId }),
    ])
    return { rows, total, page, pageSize }
  }

  async function nextPlayerNumber(tournamentId) {
    const rows = await stores.players.list({ tournamentId })
    const max = rows.reduce((m, p) => Math.max(m, Number(String(p.playerNumber || '').replace(/\D/g, '')) || 0), 0)
    return `P-${pad(max + 1, 4)}`
  }

  async function createPlayer(actor, tournamentId, input, { status, skipNotify = false } = {}) {
    const cfg = await config(tournamentId)
    const { tournament } = cfg
    if (tournament.entriesLocked) throw rule('entries_locked')
    const teamId = isCoach(actor) ? actor.teamId : input.teamId
    assertCoachMayWrite(actor, tournament, teamId)
    await inTournament('teams', tournamentId, teamId).catch(() => { throw invalid('invalid_teamId') })

    const { player, errors } = validatePlayer(input, formFields(tournament))
    if (errors.length) throw invalid('invalid_player', { errors })
    const existing = await stores.players.list({ tournamentId })
    if (existing.some((p) => playerIdentity(p) === playerIdentity(player))) throw rule('duplicate_player')

    const doc = {
      ...player,
      teamId,
      tournamentId,
      playerNumber: await nextPlayerNumber(tournamentId),
      seed: input.seed ?? null,
      registrationStatus: status || (isCoach(actor) ? R.SUBMITTED : R.PENDING_VERIFICATION),
      payment: { amount: feeFor(player, cfg.settings), status: 'PENDING' },
      weighIn: player.events?.includes('kumite') ? { registeredWeight: player.weight ?? null, status: 'PENDING' } : null,
    }
    Object.assign(doc, categorizeFields(doc, cfg))
    const row = await stores.players.insert(doc)
    await record(actor, { tournamentId, action: A.PLAYER_CREATED, entity: 'player', entityId: row.id, after: { name: row.name, teamId } })
    if (!skipNotify && isCoach(actor)) await notify(tournamentId, 'admin', 'new_registration', `New player registered: ${row.name}`)
    return row
  }

  async function updatePlayer(actor, tournamentId, id, input) {
    const cfg = await config(tournamentId)
    const before = await inTournament('players', tournamentId, id)
    assertCoachMayWrite(actor, cfg.tournament, before.teamId)
    if (isCoach(actor) && 'teamId' in input && input.teamId !== before.teamId) throw denied('not_your_team')

    const merged = { ...before, ...input, extra: { ...(before.extra || {}), ...(input.extra || {}) } }
    const { player, errors } = validatePlayer(merged, formFields(cfg.tournament))
    if (errors.length) throw invalid('invalid_player', { errors })
    const patch = { ...player }
    if (input.teamId && !isCoach(actor)) {
      await inTournament('teams', tournamentId, input.teamId).catch(() => { throw invalid('invalid_teamId') })
      patch.teamId = input.teamId
    }
    if ('seed' in input) patch.seed = input.seed

    // Section 21: once entries are locked, nothing that decides a category moves.
    if (cfg.tournament.entriesLocked) {
      const changed = LOCKED_PLAYER_FIELDS.filter((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k]))
      if (changed.length) throw rule('entries_locked', { fields: changed })
    }

    Object.assign(patch, categorizeFields({ ...before, ...patch }, cfg))
    if (patch.events && patch.events.join() !== (before.events || []).join()) {
      patch.payment = { ...(before.payment || {}), amount: feeFor(patch, cfg.settings) }
    }
    const after = await stores.players.update(id, patch)
    const auditBefore = {}
    const auditAfter = {}
    for (const [k, change] of Object.entries(diff(before, after))) {
      if (['updatedAt', 'categoryIssues'].includes(k)) continue
      auditBefore[k] = change.from
      auditAfter[k] = change.to
    }
    if (Object.keys(auditAfter).length) {
      await record(actor, { tournamentId, action: A.PLAYER_UPDATED, entity: 'player', entityId: id, before: auditBefore, after: auditAfter, reason: input.reason || null })
    }
    return after
  }

  async function removePlayer(actor, tournamentId, id) {
    const tournament = await tournamentOf(tournamentId)
    const before = await inTournament('players', tournamentId, id)
    if (tournament.entriesLocked) throw rule('entries_locked')
    assertCoachMayWrite(actor, tournament, before.teamId)
    await stores.players.remove(id)
    await record(actor, { tournamentId, action: A.PLAYER_DELETED, entity: 'player', entityId: id, before: { name: before.name, teamId: before.teamId } })
  }

  async function previewBulk(actor, tournamentId, csv, { teamId = null } = {}) {
    const tournament = await tournamentOf(tournamentId)
    const teamRows = await stores.teams.list({ tournamentId })
    const existing = await stores.players.list({ tournamentId })
    return validateBulkRows(parseCsv(csv), {
      fields: formFields(tournament),
      teams: isCoach(actor) ? teamRows.filter((t) => t.id === actor.teamId) : teamRows,
      existing,
      defaultTeamId: isCoach(actor) ? actor.teamId : teamId,
    })
  }

  /** Imports only a clean file: a half-imported team is worse than none. */
  async function importBulk(actor, tournamentId, csv, options = {}) {
    const preview = await previewBulk(actor, tournamentId, csv, options)
    if (preview.errors.length) throw invalid('bulk_has_errors', { errors: preview.errors })
    const created = []
    for (const player of preview.valid) {
      created.push(await createPlayer(actor, tournamentId, player, { skipNotify: true }))
    }
    await record(actor, { tournamentId, action: A.BULK_IMPORTED, entity: 'tournament', entityId: tournamentId, after: { count: created.length } })
    await notify(tournamentId, 'admin', 'bulk_upload_completed', `Bulk upload completed: ${created.length} players`)
    return { created: created.length, players: created }
  }

  // --- registration and verification ----------------------------------------

  async function setRegistrationStatus(actor, tournamentId, id, action, reason = null) {
    const before = await inTournament('players', tournamentId, id)
    const from = before.registrationStatus || R.DRAFT
    let path
    if (action === 'approve') {
      path = from === R.SUBMITTED ? [R.PENDING_VERIFICATION, R.APPROVED] : [R.APPROVED]
    } else if (action === 'reject') {
      if (!reason) throw invalid('rejection_reason_required')
      path = from === R.SUBMITTED ? [R.PENDING_VERIFICATION, R.REJECTED] : [R.REJECTED]
    } else if (action === 'request_correction') {
      // Back to the coach as a draft, with the reason attached.
      if (!reason) throw invalid('reason_required')
      path = from === R.PENDING_VERIFICATION ? [R.REJECTED, R.DRAFT] : [R.DRAFT]
    } else if (action === 'submit') {
      path = from === R.DRAFT ? [R.SUBMITTED] : [R.PENDING_VERIFICATION]
    } else if (Object.values(R).includes(action)) {
      path = [action]
    } else {
      throw invalid('invalid_action')
    }
    let status = from
    for (const step of path) {
      if (!registrationLifecycle.can(status, step)) throw rule('invalid_transition', { from: status, to: step })
      status = step
    }
    const patch = { registrationStatus: status, rejectionReason: status === R.REJECTED || action === 'request_correction' ? reason : null }
    const after = await stores.players.update(id, patch)
    await record(actor, { tournamentId, action: A.REGISTRATION_STATUS_CHANGED, entity: 'player', entityId: id, before: { registrationStatus: from }, after: { registrationStatus: status }, reason })
    if (['approve', 'reject', 'request_correction'].includes(action)) {
      await notify(tournamentId, 'team', `registration_${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'correction'}`,
        `${before.name}: registration ${action === 'approve' ? 'approved' : action === 'reject' ? `rejected — ${reason}` : `needs correction — ${reason}`}`, { teamId: before.teamId })
    }
    return after
  }

  async function recordPayment(actor, tournamentId, id, payment) {
    const before = await inTournament('players', tournamentId, id)
    if (payment.status && !PAYMENT_STATUS.includes(payment.status)) throw invalid('invalid_payment_status')
    const next = { ...(before.payment || {}), ...payment, recordedBy: actor?.uid || null, recordedAt: iso() }
    const patch = { payment: next }
    if (next.status === 'PAID') {
      let status = before.registrationStatus
      if (status === R.APPROVED) status = R.PAYMENT_PENDING
      if (status === R.PAYMENT_PENDING) status = R.PAYMENT_VERIFIED
      patch.registrationStatus = status
    }
    const after = await stores.players.update(id, patch)
    await record(actor, { tournamentId, action: A.PAYMENT_RECORDED, entity: 'player', entityId: id, before: { payment: before.payment }, after: { payment: next } })
    if (next.status === 'PAID') {
      await notify(tournamentId, 'team', 'payment_confirmed', `Payment confirmed for ${before.name}`, { teamId: before.teamId })
      await notify(tournamentId, 'admin', 'payment_received', `Payment received for ${before.name}`)
    }
    return after
  }

  // --- weigh-in -------------------------------------------------------------

  async function recordWeighIn(actor, tournamentId, id, { actualWeight, notes = null, status = null }) {
    const cfg = await config(tournamentId)
    if (cfg.tournament.entriesLocked) throw rule('entries_locked')
    const before = await inTournament('players', tournamentId, id)
    if (!(before.events || []).includes('kumite')) throw rule('not_a_kumite_player')
    if (!(Number(actualWeight) > 0)) throw invalid('invalid_actualWeight')
    const weight = Number(actualWeight)

    const previous = before.entries?.kumite || {}
    const suggestion = categorizePlayer({ ...before, weight }, EVENTS.KUMITE, cfg)
    const stillFits = !!previous.weightCategoryId && suggestion.weightCategory?.id === previous.weightCategoryId
    // Moving a player is allowed only where the tournament permits it, and
    // never over an admin's explicit override (section 3.4).
    const mayMove = !previous.override && (stillFits || (suggestion.resolved && cfg.settings.weighInAutoMove))
    let result = status
    let entries = before.entries
    if (!result) {
      if (stillFits || mayMove) result = 'PASSED'
      else if (suggestion.resolved) result = 'RECHECK_REQUIRED'
      else result = 'FAILED'
    }
    if (!WEIGH_IN_STATUS.includes(result)) throw invalid('invalid_status')

    const weighIn = {
      registeredWeight: before.weighIn?.registeredWeight ?? before.weight ?? null,
      actualWeight: weight,
      at: iso(),
      officerId: actor?.uid || null,
      status: result,
      notes,
    }
    const patch = { weighIn, weight }
    if (mayMove) {
      Object.assign(patch, categorizeFields({ ...before, weight }, cfg))
      entries = patch.entries
    }
    if (result === 'PASSED') patch.registrationStatus = walkRegistration(before.registrationStatus, [R.WEIGH_IN_PENDING, R.WEIGH_IN_VERIFIED])
    const after = await stores.players.update(id, patch)
    await record(actor, { tournamentId, action: A.WEIGH_IN_RECORDED, entity: 'player', entityId: id, before: { weight: before.weight, weighInStatus: before.weighIn?.status }, after: { weight, weighInStatus: result }, reason: notes })
    if (entries?.kumite?.weightCategoryId !== previous.weightCategoryId) {
      await record(actor, { tournamentId, action: A.PLAYER_CATEGORY_OVERRIDDEN, entity: 'player', entityId: id, before: { weightCategoryId: previous.weightCategoryId || null }, after: { weightCategoryId: entries?.kumite?.weightCategoryId || null }, reason: 'Moved at weigh-in' })
    }
    return after
  }

  // --- categorisation -----------------------------------------------------------

  async function recategorizeAll(actor, tournamentId, { silent = false } = {}) {
    const cfg = await config(tournamentId)
    const players = await stores.players.list({ tournamentId })
    const issues = []
    let categorized = 0
    for (const player of players) {
      const fields = categorizeFields(player, cfg)
      const patch = { ...fields }
      if (!silent && DRAW_ELIGIBLE.has(player.registrationStatus)
        && Object.values(fields.entries).every((e) => e.resolved || e.override)) {
        patch.registrationStatus = advanceRegistration(player, R.CATEGORY_CONFIRMED)
      }
      if (JSON.stringify({ ...player, ...patch }) !== JSON.stringify(player)) await stores.players.update(player.id, patch)
      if (Object.values(fields.entries).some((e) => e.resolved || e.override)) categorized += 1
      fields.categoryIssues.forEach((issue) => issues.push({ playerId: player.id, name: player.name, ...issue }))
    }
    if (!silent) {
      await record(actor, { tournamentId, action: A.PLAYERS_CATEGORIZED, entity: 'tournament', entityId: tournamentId, after: { categorized, issues: issues.length } })
    }
    return { categorized, issues }
  }

  async function categorize(actor, tournamentId) {
    const tournament = await tournamentOf(tournamentId)
    if (tournament.entriesLocked) throw rule('entries_locked')
    return recategorizeAll(actor, tournamentId)
  }

  /** Section 8: an admin may override the suggestion; the override is audited. */
  async function overrideCategory(actor, tournamentId, id, event, { ageGroupId, weightCategoryId = null }, reason) {
    const cfg = await config(tournamentId)
    if (cfg.tournament.entriesLocked) throw rule('entries_locked')
    if (!reason) throw invalid('reason_required')
    const before = await inTournament('players', tournamentId, id)
    if (!(before.events || []).includes(event)) throw invalid('invalid_event')
    if (ageGroupId) {
      const group = cfg.ageGroups.find((g) => g.id === ageGroupId)
      if (!group) throw invalid('invalid_ageGroupId')
    }
    if (event === EVENTS.KUMITE && weightCategoryId) {
      const wc = cfg.weightCategories.find((w) => w.id === weightCategoryId)
      if (!wc || wc.ageGroupId !== ageGroupId) throw invalid('invalid_weightCategoryId')
    }
    const previous = before.entries?.[event] || {}
    const entries = { ...(before.entries || {}) }
    if (!ageGroupId) {
      // Clearing the override hands the entry back to the automatic suggestion.
      entries[event] = { ...previous, override: false }
      const refreshed = categorizeFields({ ...before, entries }, cfg)
      const after = await stores.players.update(id, refreshed)
      await record(actor, { tournamentId, action: A.PLAYER_CATEGORY_OVERRIDDEN, entity: 'player', entityId: id, before: { [event]: previous }, after: { [event]: refreshed.entries[event] }, reason })
      return after
    }
    const resolved = !!ageGroupId && (event === EVENTS.KATA || !!weightCategoryId)
    entries[event] = {
      ageGroupId, weightCategoryId: event === EVENTS.KATA ? null : weightCategoryId, override: true, resolved,
      divisionKey: resolved ? divisionKey(event, ageGroupId, weightCategoryId) : null,
    }
    const after = await stores.players.update(id, { entries })
    await record(actor, { tournamentId, action: A.PLAYER_CATEGORY_OVERRIDDEN, entity: 'player', entityId: id, before: { [event]: { ageGroupId: previous.ageGroupId, weightCategoryId: previous.weightCategoryId } }, after: { [event]: { ageGroupId, weightCategoryId } }, reason })
    return after
  }

  /** Every division with entrants, labelled the way a draw sheet reads. */
  async function divisions(tournamentId) {
    const cfg = await config(tournamentId)
    const players = await stores.players.list({ tournamentId })
    const pools = await stores.pools.list({ tournamentId })
    const groups = new Map()
    for (const player of players) {
      if (!DRAW_ELIGIBLE.has(player.registrationStatus)) continue
      for (const [event, entry] of Object.entries(player.entries || {})) {
        if (!entry.divisionKey) continue
        if (!groups.has(entry.divisionKey)) {
          const ageGroup = cfg.ageGroups.find((g) => g.id === entry.ageGroupId)
          const weightCategory = cfg.weightCategories.find((w) => w.id === entry.weightCategoryId)
          groups.set(entry.divisionKey, {
            key: entry.divisionKey, event, ageGroupId: entry.ageGroupId, weightCategoryId: entry.weightCategoryId || null,
            label: categoryLabel({ ageGroup, weightCategory: weightCategory && { name: weightCategory.label || weightCategory.name } }, event),
            gender: ageGroup?.gender || null,
            playerIds: [],
          })
        }
        groups.get(entry.divisionKey).playerIds.push(player.id)
      }
    }
    return [...groups.values()].map((d) => ({
      ...d,
      count: d.playerIds.length,
      pools: pools.filter((p) => p.divisionKey === d.key).length,
    })).sort((a, b) => a.label.localeCompare(b.label))
  }

  // --- pools ------------------------------------------------------------------

  async function listPools(tournamentId, divisionKeyFilter = null) {
    const rows = await stores.pools.list(divisionKeyFilter ? { tournamentId, divisionKey: divisionKeyFilter } : { tournamentId })
    return rows.sort((a, b) => String(a.divisionKey).localeCompare(String(b.divisionKey)) || a.name.localeCompare(b.name))
  }

  async function assertNoBoutsPlayed(tournamentId, key) {
    const bridged = (await stores.categories.list({ tournamentId })).filter((c) => c.divisionKey === key)
    for (const category of bridged) {
      const bouts = await stores.matches.list({ categoryId: category.id })
      if (bouts.some((m) => boutOutcome(m))) throw rule('matches_already_played')
    }
    return bridged
  }

  async function clearBridge(tournamentId, key) {
    const bridged = await assertNoBoutsPlayed(tournamentId, key)
    for (const category of bridged) {
      await stores.matches.removeWhere({ categoryId: category.id })
      await stores.competitors.removeWhere({ categoryId: category.id })
      await stores.categories.remove(category.id)
    }
    await stores.brackets.removeWhere({ tournamentId, divisionKey: key })
  }

  /** Sections 22-23. Regenerating replaces the division's pools wholesale. */
  async function generatePools(actor, tournamentId, { divisionKey: only = null, method = DRAW_METHODS.RANDOM, poolSize = null, seed = null } = {}) {
    const tournament = await tournamentOf(tournamentId)
    if (!tournament.entriesLocked) throw rule('entries_not_locked')
    if (tournament.drawLocked) throw rule('draw_locked')
    if (!Object.values(DRAW_METHODS).includes(method)) throw invalid('invalid_method')
    const cfg = await config(tournamentId)
    const all = (await divisions(tournamentId)).filter((d) => !isPanelKata(d, cfg.settings))
    const targets = only ? all.filter((d) => d.key === only) : all
    if (only && !targets.length) throw missing('division_not_found')
    const players = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    const drawSeed = seed ?? Math.floor(now().getTime() % 2147483647)
    const random = seededRandom(drawSeed)
    const created = []

    let size = null
    for (const division of targets) {
      await clearBridge(tournamentId, division.key)
      await stores.pools.removeWhere({ tournamentId, divisionKey: division.key })
      const ds = divisionSettingsFor(cfg, division)
      size = poolSize || ds.poolSize
      // A knockout category is drawn as one list; the bracket is cut from it.
      const knockout = ds.poolSystem === 'knockout'
      const drawn = drawPools(division.playerIds.map((id) => players.get(id)), {
        poolSize: knockout ? division.playerIds.length || 1 : size, poolMode: knockout ? 'max' : ds.poolMode,
        method, random, teamOf: (p) => p.teamId, seedOf: (p) => p.seed,
      })
      for (const pool of drawn) {
        created.push(await stores.pools.insert({
          tournamentId, divisionKey: division.key, event: division.event, ageGroupId: division.ageGroupId,
          weightCategoryId: division.weightCategoryId, label: division.label, name: pool.name,
          playerIds: pool.players.map((p) => p.id), method, drawSeed, poolSize: size, poolSystem: knockout ? 'knockout' : 'round_robin', generatedAt: iso(),
        }))
      }
      for (const id of division.playerIds) {
        const p = players.get(id)
        const next = walkRegistration(p.registrationStatus, [R.CATEGORY_CONFIRMED, R.DRAW_ASSIGNED])
        if (next !== p.registrationStatus) {
          await stores.players.update(id, { registrationStatus: next })
          p.registrationStatus = next
        }
      }
    }
    await record(actor, { tournamentId, action: A.POOLS_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisions: targets.map((d) => d.key), method, poolSize: size, drawSeed } })
    if (lifecycleOf(tournament) === T.VERIFICATION || lifecycleOf(tournament) === T.WEIGH_IN) {
      await stores.tournaments.update(tournamentId, { lifecycleStatus: T.DRAW_GENERATED })
      await record(actor, { tournamentId, action: A.TOURNAMENT_STATUS_CHANGED, entity: 'tournament', entityId: tournamentId, before: { lifecycleStatus: lifecycleOf(tournament) }, after: { lifecycleStatus: T.DRAW_GENERATED }, reason: 'Pools generated' })
    }
    return created
  }

  /** Section 23, manual assignment: always logged, never once the draw is locked. */
  async function movePlayer(actor, tournamentId, { playerId, fromPoolId, toPoolId, reason = null }) {
    const tournament = await tournamentOf(tournamentId)
    if (tournament.drawLocked) throw rule('draw_locked')
    const from = await inTournament('pools', tournamentId, fromPoolId)
    const to = await inTournament('pools', tournamentId, toPoolId)
    if (from.divisionKey !== to.divisionKey) throw rule('different_division')
    if (!from.playerIds.includes(playerId)) throw invalid('player_not_in_pool')
    await assertNoBoutsPlayed(tournamentId, from.divisionKey)
    await clearBridge(tournamentId, from.divisionKey)
    await stores.pools.update(from.id, { playerIds: from.playerIds.filter((id) => id !== playerId) })
    await stores.pools.update(to.id, { playerIds: [...to.playerIds, playerId] })
    await record(actor, { tournamentId, action: A.PLAYER_MOVED_POOL, entity: 'player', entityId: playerId, before: { pool: from.name }, after: { pool: to.name }, reason })
    return listPools(tournamentId, from.divisionKey)
  }

  // --- matches (bridged onto the existing scoring records) ------------------

  /**
   * Each division becomes a category of the existing scoring app, its pool
   * players its competitors and its bouts its matches. The referee console,
   * judges and hall display then work on PRD draws without a second scoring
   * path. Red = AKA, blue = AO, exactly as the console already records them.
   */
  async function bridgeCategory(tournament, division, cfg) {
    const existing = (await stores.categories.list({ tournamentId: tournament.id })).find((c) => c.divisionKey === division.key)
    if (existing) return existing
    const ageGroup = cfg.ageGroups.find((g) => g.id === division.ageGroupId)
    const weightCategory = cfg.weightCategories.find((w) => w.id === division.weightCategoryId)
    return stores.categories.insert({
      tournamentId: tournament.id,
      name: division.label,
      ageGroup: ageGroup?.name || 'Open',
      gender: ageGroup?.gender || 'Mixed',
      division: division.event === EVENTS.KATA ? 'Kata' : (weightCategory?.label || weightCategory?.name || 'Open'),
      divisionKey: division.key,
      event: division.event,
      // The rules this category is fought under (PRD point 3), read by the
      // scoring console so a category can differ from the tournament default.
      rules: (({ matchDurationSec, pointGap, points, ruleset, poolSystem }) => ({ matchDurationSec, pointGap, points, ruleset, poolSystem }))(divisionSettingsOf(tournament, ageGroup, weightCategory)),
    })
  }

  async function nextMatchNumber(tournamentId) {
    const categories = await stores.categories.list({ tournamentId })
    let max = 0
    for (const category of categories) {
      for (const m of await stores.matches.list({ categoryId: category.id })) {
        max = Math.max(max, Number(String(m.matchNumber || '').replace(/\D/g, '')) || 0)
      }
    }
    return max + 1
  }

  async function generateMatches(actor, tournamentId, { divisionKey: only = null } = {}) {
    const cfg = await config(tournamentId)
    const { tournament, settings } = cfg
    if (!tournament.drawLocked) throw rule('draw_not_locked')
    const all = await divisions(tournamentId)
    const pools = await listPools(tournamentId)
    const targets = (only ? all.filter((d) => d.key === only) : all).filter((d) => pools.some((p) => p.divisionKey === d.key))
    const players = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    let number = await nextMatchNumber(tournamentId)
    let created = 0

    for (const [index, division] of targets.entries()) {
      const already = (await stores.categories.list({ tournamentId })).find((c) => c.divisionKey === division.key)
      if (already && (await stores.matches.list({ categoryId: already.id })).length) continue
      const category = await bridgeCategory(tournament, division, cfg)
      const mat = (index % Math.max(1, settings.mats)) + 1
      for (const pool of pools.filter((p) => p.divisionKey === division.key)) {
        const competitorOf = new Map()
        for (const [i, playerId] of pool.playerIds.entries()) {
          const p = players.get(playerId)
          const c = await stores.competitors.insert({
            categoryId: category.id, name: p.name, bib: p.playerNumber || pad(i + 1),
            age: p.age || 1, playerId, teamId: p.teamId, poolId: pool.id,
          })
          competitorOf.set(playerId, c.id)
        }
        // A knockout category goes straight to a bracket: seeds first (1 is
        // strongest), then the drawn order, byes to the top seeds.
        if (pool.poolSystem === 'knockout') {
          const order = [...pool.playerIds].sort((a, b) => (Number(players.get(a).seed) || 999) - (Number(players.get(b).seed) || 999))
          await stores.brackets.removeWhere({ tournamentId, divisionKey: division.key })
          await stores.brackets.insert({
            tournamentId, divisionKey: division.key, categoryId: category.id, knockoutOnly: true,
            entries: order.map((playerId) => ({ id: competitorOf.get(playerId), playerId, pool: pool.name, place: null })),
          })
          await stores.pools.update(pool.id, { categoryId: category.id })
          const before = (await stores.matches.list({ categoryId: category.id })).length
          await syncBracket(tournamentId, division.key)
          created += (await stores.matches.list({ categoryId: category.id })).length - before
          number = await nextMatchNumber(tournamentId)
          continue
        }
        for (const bout of roundRobin(pool.playerIds)) {
          await stores.matches.insert({
            categoryId: category.id, tournamentId, poolId: pool.id, stage: 'pool', round: bout.round,
            redId: competitorOf.get(bout.aka), blueId: competitorOf.get(bout.ao),
            akaPlayerId: bout.aka, aoPlayerId: bout.ao,
            matchNumber: `M-${pad(number)}`, mat, status: 'scheduled', winner: null,
          })
          number += 1
          created += 1
        }
        await stores.pools.update(pool.id, { categoryId: category.id })
      }
    }
    await record(actor, { tournamentId, action: A.MATCHES_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisions: targets.map((d) => d.key), created } })
    if (created) await notify(tournamentId, 'team', 'match_scheduled', `${created} matches have been scheduled.`)
    return { created }
  }

  /** Every bout in the tournament, with names, for the queue and public pages. */
  async function listMatches(tournamentId, filter = {}) {
    const categories = (await stores.categories.list({ tournamentId })).filter((c) => c.divisionKey)
    const pools = new Map((await stores.pools.list({ tournamentId })).map((p) => [p.id, p]))
    const out = []
    for (const category of categories) {
      const competitors = new Map((await stores.competitors.list({ categoryId: category.id })).map((c) => [c.id, c]))
      for (const m of await stores.matches.list({ categoryId: category.id })) {
        out.push({
          ...m,
          divisionKey: category.divisionKey,
          categoryName: category.name,
          poolName: m.poolId ? pools.get(m.poolId)?.name : null,
          resultType: m.result?.type || (m.status === 'cancelled' ? 'CANCELLED' : boutOutcome(m) ? 'COMPLETED' : null),
          akaName: competitors.get(m.redId)?.name || null,
          aoName: competitors.get(m.blueId)?.name || null,
          akaPlayerId: m.akaPlayerId || competitors.get(m.redId)?.playerId || null,
          aoPlayerId: m.aoPlayerId || competitors.get(m.blueId)?.playerId || null,
        })
      }
    }
    const num = (m) => Number(String(m.matchNumber || '').replace(/\D/g, '')) || 0
    return out
      .filter((m) => (!filter.status || m.status === filter.status) && (!filter.mat || m.mat === Number(filter.mat)) && (!filter.divisionKey || m.divisionKey === filter.divisionKey))
      .sort((a, b) => num(a) - num(b))
  }

  const findBridgedMatch = async (tournamentId, matchId) => {
    const match = await load('matches', matchId)
    const category = await load('categories', match.categoryId)
    if (category.tournamentId !== tournamentId) throw missing()
    return { match, category }
  }

  /** Rule 6: a finished result changes only with a reason, and leaves a record. */
  async function correctResult(actor, tournamentId, matchId, { winner, avgRed, avgBlue, resultType = 'COMPLETED' }, reason) {
    const { match, category } = await findBridgedMatch(tournamentId, matchId)
    if ((boutOutcome(match) || match.status === 'cancelled') && !reason) throw invalid('correction_reason_required')
    if (!RESULT_TYPES.includes(resultType)) throw invalid('invalid_resultType')
    // Section 27: a cancelled bout has no winner and counts for nobody; a
    // walkover or disqualification is a finished bout with a winner.
    const patch = resultType === 'CANCELLED'
      ? { winner: null, status: 'cancelled', result: { type: 'CANCELLED', method: 'cancelled' } }
      : { winner, status: 'completed', avgRed: avgRed ?? match.avgRed ?? 0, avgBlue: avgBlue ?? match.avgBlue ?? 0, result: { type: resultType, method: resultType === 'WALKOVER' ? 'kiken' : resultType === 'DISQUALIFIED' ? 'shikkaku' : 'manual' } }
    if (resultType !== 'CANCELLED' && !['red', 'blue', 'tie'].includes(winner)) throw invalid('invalid_winner')
    if (resultType !== 'CANCELLED' && resultType !== 'COMPLETED' && winner === 'tie') throw invalid('invalid_winner')
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.MATCH_RESULT_CHANGED, entity: 'match', entityId: matchId, before: { winner: match.winner, avgRed: match.avgRed, avgBlue: match.avgBlue, status: match.status }, after: patch, reason })
    if (match.stage === 'knockout') await syncBracket(tournamentId, category.divisionKey)
    return after
  }

  /** PRD point 15: put the players in the other corners, before the bout is fought. */
  async function swapCorners(actor, tournamentId, matchId, reason = null) {
    const { match } = await findBridgedMatch(tournamentId, matchId)
    if (boutOutcome(match) || match.status === 'cancelled') throw rule('match_finished')
    if (['live', 'open'].includes(match.status)) throw rule('match_in_progress')
    const patch = { redId: match.blueId, blueId: match.redId, akaPlayerId: match.aoPlayerId ?? null, aoPlayerId: match.akaPlayerId ?? null }
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.MATCH_SCHEDULED, entity: 'match', entityId: matchId, before: { redId: match.redId, blueId: match.blueId }, after: { redId: patch.redId, blueId: patch.blueId }, reason: reason || 'Corners swapped' })
    return after
  }

  // --- kata panel (PRD point 19, sections 32-33) -----------------------------

  const kataRoundsOf = async (tournamentId, key = null) =>
    (await stores.kataRounds.list(key ? { tournamentId, divisionKey: key } : { tournamentId }))
      .sort((a, b) => String(a.divisionKey).localeCompare(String(b.divisionKey)) || a.round - b.round)

  /** Kata categories judged by a panel, with their rounds so far. */
  async function kataDivisions(tournamentId) {
    const cfg = await config(tournamentId)
    const rounds = await kataRoundsOf(tournamentId)
    return (await divisions(tournamentId)).filter((d) => isPanelKata(d, cfg.settings)).map((d) => {
      const ds = divisionSettingsFor(cfg, d)
      return {
        ...d, judges: ds.kataJudges, method: ds.kataMethod, qualifiers: ds.kataQualifiers, plannedRounds: ds.kataRounds,
        rounds: rounds.filter((r) => r.divisionKey === d.key).map(({ id, round, name, status, performerIds }) => ({ id, round, name, status, performers: performerIds.length })),
      }
    })
  }

  /** The scores sheet of a round: every performer, every judge, final and rank. */
  async function kataRoundView(tournamentId, roundId) {
    const round = await inTournament('kataRounds', tournamentId, roundId)
    const scores = await stores.kataScores.list({ roundId })
    const players = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    const teams = new Map((await stores.teams.list({ tournamentId })).map((t) => [t.id, t]))
    const rows = round.performerIds.map((playerId, order) => {
      const bySeat = {}
      for (const s of scores.filter((x) => x.playerId === playerId)) bySeat[s.seat] = s.score
      const list = Object.values(bySeat)
      const p = players.get(playerId)
      return {
        playerId, order: order + 1, name: p?.name || '?', club: p?.club || teams.get(p?.teamId)?.name || null,
        team: teams.get(p?.teamId)?.name || null, state: p?.state || null, bySeat, scores: list,
        final: kataFinal(list, round.judges, round.method),
      }
    })
    return { ...round, rows: rankKata(rows) }
  }

  /**
   * Opens the next round of a kata category. Round one is everyone, in a
   * drawn order; later rounds take the top qualifiers of the round before.
   */
  async function createKataRound(actor, tournamentId, key, { seed = null } = {}) {
    const cfg = await config(tournamentId)
    if (!cfg.tournament.entriesLocked) throw rule('entries_not_locked')
    const division = (await divisions(tournamentId)).find((d) => d.key === key && isPanelKata(d, cfg.settings))
    if (!division) throw missing('division_not_found')
    const ds = divisionSettingsFor(cfg, division)
    const existing = await kataRoundsOf(tournamentId, key)
    const last = existing[existing.length - 1]
    if (last && last.status !== 'completed') throw rule('round_open')
    if (last?.name === 'Final') throw rule('final_done')
    let performerIds
    if (!last) {
      performerIds = shuffleWith(division.playerIds, seededRandom(seed ?? Math.floor(now().getTime() % 2147483647)))
    } else {
      const view = await kataRoundView(tournamentId, last.id)
      const ranked = view.rows.filter((r) => r.rank != null)
      // Qualifiers perform in reverse order of their previous score.
      performerIds = ranked.slice(0, ds.kataQualifiers).reverse().map((r) => r.playerId)
    }
    const number = existing.length + 1
    const isFinal = number >= ds.kataRounds || performerIds.length <= Math.max(2, Math.min(ds.kataQualifiers, 4))
    const row = await stores.kataRounds.insert({
      tournamentId, divisionKey: key, label: division.label, round: number, name: isFinal ? 'Final' : `Round ${number}`,
      performerIds, judges: ds.kataJudges, method: ds.kataMethod, status: 'open', openedAt: iso(),
    })
    await record(actor, { tournamentId, action: A.KATA_ROUND, entity: 'kata_round', entityId: row.id, after: { divisionKey: key, round: row.name, performers: performerIds.length } })
    return row
  }

  /**
   * A judge's score for one performer. A judge scores from their own seat;
   * an admin may enter any seat (a paper sheet typed in). Changing a score
   * already given is recorded.
   */
  async function submitKataScore(actor, tournamentId, roundId, { playerId, score, seat = null }) {
    const round = await inTournament('kataRounds', tournamentId, roundId)
    if (round.status !== 'open') throw rule('round_closed')
    if (!round.performerIds.includes(playerId)) throw invalid('invalid_playerId')
    const value = normalizeKataScore(score)
    if (value == null) throw invalid('invalid_score')
    const judgeSeat = actor?.role === 'judge' ? Number(actor.seat) : Number(seat)
    if (!Number.isInteger(judgeSeat) || judgeSeat < 1 || judgeSeat > round.judges) throw invalid('invalid_seat')
    const existing = (await stores.kataScores.list({ roundId, playerId, seat: judgeSeat }))[0]
    if (existing) {
      if (existing.score === value) return existing
      const after = await stores.kataScores.update(existing.id, { score: value, judgeUid: actor?.uid || null, at: iso() })
      await record(actor, { tournamentId, action: A.KATA_SCORE_CHANGED, entity: 'kata_round', entityId: roundId, before: { player: playerId, seat: judgeSeat, score: existing.score }, after: { player: playerId, seat: judgeSeat, score: value } })
      return after
    }
    return stores.kataScores.insert({ tournamentId, roundId, playerId, seat: judgeSeat, score: value, judgeUid: actor?.uid || null, at: iso() })
  }

  async function completeKataRound(actor, tournamentId, roundId) {
    const view = await kataRoundView(tournamentId, roundId)
    if (view.status !== 'open') throw rule('round_closed')
    if (view.rows.some((r) => r.final == null)) throw rule('scores_missing')
    await stores.kataRounds.update(roundId, { status: 'completed', completedAt: iso() })
    await record(actor, { tournamentId, action: A.KATA_ROUND, entity: 'kata_round', entityId: roundId, after: { completed: view.name } })
    return kataRoundView(tournamentId, roundId)
  }

  /** Medals of a kata category, from its completed final. */
  async function kataMedals(tournamentId, key, settings) {
    const rounds = await kataRoundsOf(tournamentId, key)
    const final = rounds.find((r) => r.name === 'Final' && r.status === 'completed')
    if (!final) return { rounds, medals: [] }
    const view = await kataRoundView(tournamentId, final.id)
    const bronzes = Math.max(0, settings.bronzeCount ?? 2)
    const medalFor = (rank, index) => (rank === 1 ? 'gold' : rank === 2 ? 'silver' : index < 2 + bronzes ? 'bronze' : null)
    const medals = view.rows.filter((r) => r.rank != null).map((r, i) => ({ id: r.playerId, rank: Math.min(r.rank, 3), medal: medalFor(r.rank, i) })).filter((m) => m.medal)
    return { rounds, medals }
  }

  // --- results and knockout --------------------------------------------------

  async function divisionPoolsWithStandings(tournamentId, key, settings) {
    const pools = await listPools(tournamentId, key)
    const category = (await stores.categories.list({ tournamentId })).find((c) => c.divisionKey === key)
    const bouts = category ? await stores.matches.list({ categoryId: category.id }) : []
    const competitors = category ? await stores.competitors.list({ categoryId: category.id }) : []
    const playerOf = new Map(competitors.map((c) => [c.id, c.playerId]))
    return {
      category,
      bouts,
      competitors,
      pools: pools.map((pool) => {
        const poolBouts = bouts.filter((b) => b.poolId === pool.id && b.stage !== 'knockout')
          .map((b) => ({ ...b, aka: playerOf.get(b.redId), ao: playerOf.get(b.blueId) }))
        return {
          pool: pool.name,
          poolId: pool.id,
          complete: poolComplete(poolBouts),
          bouts: poolBouts.length,
          standings: poolStandings(pool.playerIds, poolBouts, settings),
        }
      }),
    }
  }

  async function generateBracket(actor, tournamentId, key) {
    const cfg = await config(tournamentId)
    const data = await divisionPoolsWithStandings(tournamentId, key, cfg.settings)
    if (!data.category) throw rule('matches_not_generated')
    if (data.pools.length < 2) throw rule('single_pool_no_bracket')
    if (!data.pools.every((p) => p.complete)) throw rule('pools_incomplete')
    if (data.bouts.some((b) => b.stage === 'knockout')) throw rule('bracket_exists')
    const division = (await divisions(tournamentId)).find((d) => d.key === key)
    const seeds = qualifierSeeds(data.pools, division ? divisionSettingsFor(cfg, division).qualifiersPerPool : cfg.settings.qualifiersPerPool)
    const competitorOfPlayer = new Map(data.competitors.map((c) => [c.playerId, c.id]))
    await stores.brackets.removeWhere({ tournamentId, divisionKey: key })
    await stores.brackets.insert({
      tournamentId, divisionKey: key, categoryId: data.category.id,
      entries: seeds.map((s) => ({ id: competitorOfPlayer.get(s.id), playerId: s.id, pool: s.pool, place: s.place })),
    })
    await record(actor, { tournamentId, action: A.BRACKET_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisionKey: key, qualifiers: seeds.length } })
    await syncBracket(tournamentId, key)
    return bracketView(tournamentId, key)
  }

  /**
   * Section 36: the bracket fills itself. Bouts are created as soon as both
   * corners are known, and a later round's corners follow earlier results.
   */
  async function syncBracket(tournamentId, key) {
    const bracket = (await stores.brackets.list({ tournamentId, divisionKey: key }))[0]
    if (!bracket) return null
    const skeleton = buildBracket(bracket.entries)
    const stored = new Map((await stores.matches.list({ categoryId: bracket.categoryId }))
      .filter((m) => m.stage === 'knockout').map((m) => [m.bracketKey, m]))
    const merged = new Map()
    let number = null
    const settings = settingsOf(await tournamentOf(tournamentId))
    const mat = 1 + ((await stores.categories.list({ tournamentId })).filter((c) => c.divisionKey).findIndex((c) => c.id === bracket.categoryId) % Math.max(1, settings.mats))

    for (const slot of skeleton.sort((a, b) => a.round - b.round || a.slot - b.slot)) {
      const feed = (k) => merged.get(k)
      let aka = slot.aka
      let ao = slot.ao
      if (slot.round > 1) {
        const winnerOf = (m) => {
          if (!m) return null
          if (m.round === 1 && (!m.aka || !m.ao)) return m.aka || m.ao || null
          const o = boutOutcome(m)
          if (!o || o.winner === 'draw') return null
          return o.winner === 'aka' ? m.aka : m.ao
        }
        aka = winnerOf(feed(slot.feedAka))
        ao = winnerOf(feed(slot.feedAo))
      }
      const existing = stored.get(slot.key)
      const isBye = slot.round === 1 && (!aka || !ao)
      if (existing) {
        if (!boutOutcome(existing) && (existing.redId !== aka || existing.blueId !== ao)) {
          await stores.matches.update(existing.id, { redId: aka, blueId: ao })
        }
        merged.set(slot.key, { ...existing, ...slot, aka: boutOutcome(existing) ? existing.redId : aka, ao: boutOutcome(existing) ? existing.blueId : ao, status: existing.status, winner: existing.winner })
      } else if (!isBye && aka && ao) {
        if (number == null) number = await nextMatchNumber(tournamentId)
        const row = await stores.matches.insert({
          categoryId: bracket.categoryId, tournamentId, stage: 'knockout', round: slot.round, roundName: slot.name,
          bracketKey: slot.key, redId: aka, blueId: ao, matchNumber: `M-${pad(number)}`, mat, status: 'scheduled', winner: null,
        })
        number += 1
        merged.set(slot.key, { ...row, ...slot, aka, ao })
      } else {
        merged.set(slot.key, { ...slot, aka, ao, status: isBye ? 'bye' : 'pending' })
      }
    }
    return [...merged.values()]
  }

  async function bracketView(tournamentId, key) {
    const bracket = (await stores.brackets.list({ tournamentId, divisionKey: key }))[0]
    if (!bracket) return null
    const slots = await syncBracket(tournamentId, key)
    const competitors = new Map((await stores.competitors.list({ categoryId: bracket.categoryId })).map((c) => [c.id, c]))
    return {
      knockoutOnly: !!bracket.knockoutOnly,
      divisionKey: key,
      rounds: [...new Set(slots.map((s) => s.round))].sort((a, b) => a - b).map((round) => ({
        round,
        name: slots.find((s) => s.round === round).name,
        matches: slots.filter((s) => s.round === round).sort((a, b) => a.slot - b.slot).map((s) => ({
          key: s.key, id: s.id || null, matchNumber: s.matchNumber || null, status: s.status, winner: s.winner || null,
          aka: s.aka ? { id: s.aka, name: competitors.get(s.aka)?.name, playerId: competitors.get(s.aka)?.playerId } : null,
          ao: s.ao ? { id: s.ao, name: competitors.get(s.ao)?.name, playerId: competitors.get(s.ao)?.playerId } : null,
          akaScore: s.avgRed ?? null, aoScore: s.avgBlue ?? null,
        })),
      })),
      slots,
    }
  }

  /** Standings for every division, plus the medals each has settled. */
  async function results(tournamentId) {
    const cfg = await config(tournamentId)
    const playersById = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    const teamsById = new Map((await stores.teams.list({ tournamentId })).map((t) => [t.id, t]))
    const out = []
    const overrides = new Map((await stores.medalOverrides.list({ tournamentId })).map((o) => [o.divisionKey, o]))
    for (const division of await divisions(tournamentId)) {
      const ds = divisionSettingsFor(cfg, division)
      const named = (row) => {
        const p = playersById.get(row.id)
        const team = teamsById.get(p?.teamId)
        return { ...row, name: p?.name || '?', team: team?.name || null, club: p?.club || team?.club || team?.name || null, district: p?.district || team?.district || null, state: p?.state || team?.state || null, country: p?.country || team?.country || null }
      }
      const override = overrides.get(division.key)
      const applyOverride = (computed) => (override
        ? override.medals.map((m) => named({ id: m.playerId, rank: m.rank, medal: m.medal }))
        : computed.map(named))

      if (isPanelKata(division, cfg.settings)) {
        const { rounds, medals } = await kataMedals(tournamentId, division.key, ds)
        const views = []
        for (const r of rounds) views.push(await kataRoundView(tournamentId, r.id))
        out.push({
          ...division, pools: [], bracket: null, hasBracket: false, canGenerateBracket: false,
          kata: { rounds: views.map(({ id, name, status, judges, method, rows }) => ({ id, name, status, judges, method, rows })) },
          medals: applyOverride(medals), medalsOverridden: !!override, overrideReason: override?.reason || null,
        })
        continue
      }

      const data = await divisionPoolsWithStandings(tournamentId, division.key, ds)
      const bracket = await bracketView(tournamentId, division.key)
      let medals = []
      if (bracket) {
        const playerOf = new Map(data.competitors.map((c) => [c.id, c.playerId]))
        medals = bracketMedals(bracket.slots, cfg.settings)
          .map((m) => ({ ...m, id: playerOf.get(m.id) }))
      } else if (data.pools.length === 1 && data.pools[0].complete) {
        medals = poolMedals(data.pools[0].standings)
      }
      out.push({
        ...division,
        // A knockout-only category has its draw in the bracket, not in pools.
        pools: bracket?.knockoutOnly ? [] : data.pools.map((p) => ({ ...p, standings: p.standings.map(named) })),
        bracket: bracket ? { rounds: bracket.rounds } : null,
        hasBracket: !!bracket,
        canGenerateBracket: !bracket && data.pools.length > 1 && data.pools.every((p) => p.complete),
        medals: applyOverride(medals),
        medalsOverridden: !!override,
        overrideReason: override?.reason || null,
      })
    }
    return out
  }

  /**
   * PRD point 21: the admin may set a category's medals by hand (a protest
   * upheld, a withdrawal after the final). Always with a reason, always in
   * the audit log; clearing it returns to the medals the results produce.
   */
  async function overrideMedals(actor, tournamentId, key, medals, reason) {
    if (!reason) throw invalid('reason_required')
    const division = (await divisions(tournamentId)).find((d) => d.key === key)
    if (!division) throw missing('division_not_found')
    const before = (await results(tournamentId)).find((d) => d.key === key)?.medals || []
    const existing = (await stores.medalOverrides.list({ tournamentId, divisionKey: key }))[0]
    if (medals === null) {
      if (existing) await stores.medalOverrides.remove(existing.id)
      await record(actor, { tournamentId, action: A.MEDALS_OVERRIDDEN, entity: 'division', entityId: key, before: { medals: before.map((m) => `${m.medal}:${m.name}`) }, after: { medals: 'as calculated' }, reason })
      return { cleared: true }
    }
    if (!Array.isArray(medals) || medals.length > 8) throw invalid('invalid_medals')
    const clean = medals.map((m) => {
      if (!division.playerIds.includes(m.playerId)) throw invalid('invalid_playerId')
      if (!['gold', 'silver', 'bronze'].includes(m.medal)) throw invalid('invalid_medal')
      return { playerId: m.playerId, medal: m.medal, rank: m.medal === 'gold' ? 1 : m.medal === 'silver' ? 2 : 3 }
    })
    if (new Set(clean.map((m) => m.playerId)).size !== clean.length) throw invalid('duplicate_player')
    const doc = { tournamentId, divisionKey: key, medals: clean, reason, by: actor?.uid || null, at: iso() }
    if (existing) await stores.medalOverrides.update(existing.id, doc)
    else await stores.medalOverrides.insert(doc)
    const names = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p.name]))
    await record(actor, { tournamentId, action: A.MEDALS_OVERRIDDEN, entity: 'division', entityId: key, before: { medals: before.map((m) => `${m.medal}:${m.name}`) }, after: { medals: clean.map((m) => `${m.medal}:${names.get(m.playerId)}`) }, reason })
    return { overridden: true }
  }

  /** Section 42: freezes the medals and makes results public. */
  async function publishResults(actor, tournamentId, publish = true) {
    const tournament = await tournamentOf(tournamentId)
    if (!publish) {
      await stores.tournaments.update(tournamentId, { resultsPublished: false })
      await record(actor, { tournamentId, action: A.RESULTS_UNPUBLISHED, entity: 'tournament', entityId: tournamentId })
      return { published: false }
    }
    const divisionsWithResults = await results(tournamentId)
    await stores.medals.removeWhere({ tournamentId })
    let count = 0
    for (const division of divisionsWithResults) {
      for (const medal of division.medals) {
        await stores.medals.insert({
          tournamentId, playerId: medal.id, name: medal.name, team: medal.team, club: medal.club, district: medal.district,
          state: medal.state, country: medal.country, divisionKey: division.key, category: division.label, event: division.event,
          rank: medal.rank, medal: medal.medal,
        })
        count += 1
      }
    }
    await stores.tournaments.update(tournamentId, { resultsPublished: true, resultsPublishedAt: iso() })
    await record(actor, { tournamentId, action: A.RESULTS_PUBLISHED, entity: 'tournament', entityId: tournamentId, after: { medals: count }, before: { resultsPublished: !!tournament.resultsPublished } })
    await notify(tournamentId, 'team', 'result_published', 'Results have been published.')
    return { published: true, medals: count }
  }

  const listMedals = async (tournamentId) =>
    (await stores.medals.list({ tournamentId })).sort((a, b) => a.category.localeCompare(b.category) || a.rank - b.rank)

  async function tally(tournamentId, by = 'club') {
    return medalTally(await listMedals(tournamentId), by)
  }

  // --- certificates -------------------------------------------------------------

  async function generateCertificates(actor, tournamentId) {
    const tournament = await tournamentOf(tournamentId)
    if (!tournament.resultsPublished) throw rule('results_not_published')
    const medals = await listMedals(tournamentId)
    const existing = await stores.certificates.list({ tournamentId })
    const have = new Set(existing.map((c) => `${c.playerId}|${c.divisionKey}`))
    const year = String(tournament.startDate || tournament.date || iso()).slice(0, 4)
    let created = 0
    for (const medal of medals) {
      if (have.has(`${medal.playerId}|${medal.divisionKey}`)) continue
      await stores.certificates.insert({
        tournamentId, certificateId: `CERT-${year}-${randomToken(8).toUpperCase()}`, playerId: medal.playerId,
        name: medal.name, club: medal.club, category: medal.category, event: medal.event, divisionKey: medal.divisionKey,
        rank: medal.rank, medal: medal.medal, issuedAt: iso(),
      })
      created += 1
    }
    await record(actor, { tournamentId, action: A.CERTIFICATES_GENERATED, entity: 'tournament', entityId: tournamentId, after: { created } })
    return { created, certificates: await stores.certificates.list({ tournamentId }) }
  }

  const listCertificates = async (tournamentId) =>
    (await stores.certificates.list({ tournamentId })).sort((a, b) => a.category.localeCompare(b.category) || a.rank - b.rank)

  // --- registration link (section 14) ---------------------------------------

  const publicLink = (link) => link && ({
    id: link.id, token: link.token, active: link.active, hasPassword: !!link.passwordHash, expiresAt: link.expiresAt || null,
  })

  async function getLink(tournamentId) {
    return publicLink((await stores.registrationLinks.list({ tournamentId }))[0] || null)
  }

  async function saveLink(actor, tournamentId, { regenerate = false, password, active, expiresAt } = {}) {
    await tournamentOf(tournamentId)
    const current = (await stores.registrationLinks.list({ tournamentId }))[0]
    const patch = {}
    if (!current || regenerate) patch.token = randomToken(20)
    if (password !== undefined) patch.passwordHash = password ? await hashSecret(password) : null
    if (active !== undefined) patch.active = !!active
    if (expiresAt !== undefined) patch.expiresAt = expiresAt || null
    const row = current
      ? await stores.registrationLinks.update(current.id, patch)
      : await stores.registrationLinks.insert({ tournamentId, active: true, passwordHash: null, expiresAt: null, ...patch })
    await record(actor, { tournamentId, action: A.LINK_CHANGED, entity: 'registration_link', entityId: row.id, after: { regenerated: !!patch.token, passwordChanged: password !== undefined, active: row.active, expiresAt: row.expiresAt } })
    return publicLink(row)
  }

  async function resolveLink(token) {
    const link = (await stores.registrationLinks.list({ token }))[0]
    if (!link || !token) throw missing('link_not_found')
    if (!link.active) throw rule('link_disabled')
    if (link.expiresAt && new Date(link.expiresAt) < now()) throw rule('link_expired')
    const tournament = await tournamentOf(link.tournamentId)
    return { link, tournament }
  }

  async function linkInfo(token) {
    const { link, tournament } = await resolveLink(token)
    return {
      tournament: publicTournament(tournament),
      requiresPassword: !!link.passwordHash,
      registrationOpen: lifecycleOf(tournament) === T.REGISTRATION_OPEN && !tournament.entriesLocked,
      form: formFields(tournament).filter((f) => f.visible !== false),
    }
  }

  async function openLink(token, password = '') {
    const { link, tournament } = await resolveLink(token)
    if (link.passwordHash && !(await verifySecret(password, link.passwordHash))) throw denied('invalid_password')
    return { tournamentId: tournament.id, linkId: link.id }
  }

  // --- coach view -------------------------------------------------------------

  async function coachOverview(actor) {
    const tournament = await tournamentOf(actor.tournamentId)
    const team = actor.teamId ? await stores.teams.get(actor.teamId) : null
    const players = team ? await stores.players.list({ tournamentId: tournament.id, teamId: team.id }) : []
    const notes = team ? (await stores.notifications.list({ tournamentId: tournament.id, audience: 'team' }))
      .filter((n) => !n.teamId || n.teamId === team.id) : []
    return {
      tournament: { ...publicTournament(tournament), entriesLocked: !!tournament.entriesLocked },
      registrationOpen: lifecycleOf(tournament) === T.REGISTRATION_OPEN && !tournament.entriesLocked,
      form: formFields(tournament).filter((f) => f.visible !== false),
      team,
      players: players.sort(byName),
      notifications: notes.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50),
    }
  }

  // --- public (Rule 8) ----------------------------------------------------------

  function publicTournament(t) {
    const keep = ['id', 'name', 'slug', 'description', 'logoUrl', 'type', 'template', 'organizer', 'association', 'venue', 'location', 'city', 'district', 'state', 'country', 'startDate', 'endDate', 'date', 'lifecycleStatus', 'resultsPublished']
    const out = {}
    for (const k of keep) if (t[k] !== undefined) out[k] = t[k]
    out.lifecycleStatus = lifecycleOf(t)
    return out
  }

  async function findPublicTournament(idOrSlug) {
    const byId = await stores.tournaments.get(idOrSlug)
    const t = byId || (await stores.tournaments.list({ slug: idOrSlug }))[0]
    if (!t || lifecycleOf(t) === T.DRAFT) throw missing('tournament_not_found')
    return t
  }

  async function publicList() {
    return (await stores.tournaments.list()).filter((t) => lifecycleOf(t) !== T.DRAFT).map(publicTournament)
  }

  async function publicView(idOrSlug) {
    const t = await findPublicTournament(idOrSlug)
    const tournamentId = t.id
    const [divisionRows, teamRows, playerRows, poolRows, matchRows] = await Promise.all([
      divisions(tournamentId), stores.teams.list({ tournamentId }), stores.players.list({ tournamentId }),
      t.drawLocked ? listPools(tournamentId) : [], listMatches(tournamentId),
    ])
    const labelOf = new Map(divisionRows.map((d) => [d.key, d.label]))
    const visible = playerRows.filter((p) => DRAW_ELIGIBLE.has(p.registrationStatus))
    const names = new Map(visible.map((p) => [p.id, p.name]))
    const res = t.resultsPublished ? await results(tournamentId) : []
    const medals = t.resultsPublished ? await listMedals(tournamentId) : []
    const stripPrivate = ({ id, name, team, club, state, country, rank, medal, category, event, played, wins, losses, draws, points, scoreFor, scoreAgainst, qualified }) =>
      ({ id, name, team, club, state, country, rank, medal, category, event, played, wins, losses, draws, points, scoreFor, scoreAgainst, qualified })
    return {
      tournament: publicTournament(t),
      categories: divisionRows.map(({ key, label, event, count, gender }) => ({ key, label, event, count, gender })),
      teams: teamRows.map(publicTeam).sort(byName),
      players: visible.map((p) => ({
        ...publicPlayer(p),
        categories: Object.values(p.entries || {}).map((e) => labelOf.get(e.divisionKey)).filter(Boolean),
      })).sort(byName),
      pools: poolRows.map((p) => ({ id: p.id, divisionKey: p.divisionKey, label: p.label, name: p.name, players: p.playerIds.map((id) => ({ id, name: names.get(id) || '?' })) })),
      matches: matchRows.map((m) => ({
        id: m.id, matchNumber: m.matchNumber, mat: m.mat, scheduledAt: m.scheduledAt || null, category: m.categoryName, divisionKey: m.divisionKey,
        pool: m.poolName, round: m.round, stage: m.stage, roundName: m.roundName || null, status: m.status, resultType: m.resultType,
        aka: m.akaName, ao: m.aoName, winner: m.winner || null, akaScore: m.avgRed ?? null, aoScore: m.avgBlue ?? null,
      })),
      results: res.map((d) => ({
        key: d.key, label: d.label, event: d.event,
        pools: d.pools.map((p) => ({ pool: p.pool, complete: p.complete, standings: p.standings.map(stripPrivate) })),
        bracket: d.bracket, medals: d.medals.map(stripPrivate),
        kata: d.kata ? { rounds: d.kata.rounds.map((r) => ({ name: r.name, status: r.status, judges: r.judges, rows: r.rows.map(({ playerId, name, club, team, state, bySeat, final, rank, order }) => ({ playerId, name, club, team, state, bySeat, final, rank, order })) })) } : null,
      })),
      medals: medals.map(stripPrivate),
      tally: t.resultsPublished ? { club: medalTally(medals, 'club'), state: medalTally(medals, 'state'), district: medalTally(medals, 'district'), country: medalTally(medals, 'country') } : null,
    }
  }

  // --- dashboard and notifications -----------------------------------------

  async function dashboard(tournamentId) {
    const players = await stores.players.list({ tournamentId })
    const teamRows = await stores.teams.list({ tournamentId })
    const pools = await stores.pools.list({ tournamentId })
    const matches = await listMatches(tournamentId)
    const medals = await stores.medals.list({ tournamentId })
    const count = (pred) => players.filter(pred).length
    return {
      teams: teamRows.length,
      players: players.length,
      kataPlayers: count((p) => p.events?.includes('kata')),
      kumitePlayers: count((p) => p.events?.includes('kumite')),
      pendingVerification: count((p) => [R.SUBMITTED, R.PENDING_VERIFICATION].includes(p.registrationStatus)),
      pendingPayment: count((p) => DRAW_ELIGIBLE.has(p.registrationStatus) && (p.payment?.status || 'PENDING') !== 'PAID'),
      pendingWeighIn: count((p) => p.events?.includes('kumite') && DRAW_ELIGIBLE.has(p.registrationStatus) && (p.weighIn?.status || 'PENDING') !== 'PASSED'),
      pools: pools.length,
      matches: matches.length,
      completedMatches: matches.filter((m) => boutOutcome(m)).length,
      liveMatches: matches.filter((m) => ['live', 'open'].includes(m.status)).length,
      pendingMatches: matches.filter((m) => !boutOutcome(m) && m.status !== 'cancelled').length,
      gold: medals.filter((m) => m.medal === 'gold').length,
      silver: medals.filter((m) => m.medal === 'silver').length,
      bronze: medals.filter((m) => m.medal === 'bronze').length,
      nextMatches: matches.filter((m) => !boutOutcome(m)).slice(0, 8),
      currentMatches: matches.filter((m) => ['live', 'open'].includes(m.status)),
    }
  }

  /** Section 47: reminds every team with kumite players still to weigh in. */
  async function sendWeighInReminder(actor, tournamentId) {
    const tournament = await tournamentOf(tournamentId)
    const players = await stores.players.list({ tournamentId })
    const byTeam = new Map()
    for (const p of players) {
      if (!p.events?.includes('kumite') || !DRAW_ELIGIBLE.has(p.registrationStatus)) continue
      if ((p.weighIn?.status || 'PENDING') === 'PASSED') continue
      byTeam.set(p.teamId, [...(byTeam.get(p.teamId) || []), p.name])
    }
    const when = tournament.weighInDate ? ` on ${tournament.weighInDate}` : ''
    for (const [teamId, names] of byTeam) {
      await notify(tournamentId, 'team', 'weighin_reminder', `Weigh-in reminder${when}: ${names.length} player(s) still to weigh in — ${names.join(', ')}.`, { teamId })
    }
    await record(actor, { tournamentId, action: A.TOURNAMENT_UPDATED, entity: 'tournament', entityId: tournamentId, reason: `Weigh-in reminder sent to ${byTeam.size} team(s)` })
    return { teams: byTeam.size }
  }

  const listNotifications = async (tournamentId, audience = 'admin') =>
    (await stores.notifications.list({ tournamentId, audience })).sort((a, b) => String(b.at).localeCompare(String(a.at)))

  async function markNotificationsRead(tournamentId, audience = 'admin') {
    for (const n of await stores.notifications.list({ tournamentId, audience, read: false })) {
      await stores.notifications.update(n.id, { read: true })
    }
  }

  // --- files (sections 5, 12, 17, 49) ------------------------------------------

  const fileMeta = ({ data, ...meta }) => meta

  /** Stores an upload. Logos are public; everything else is private (Rule 8). */
  async function uploadFile(actor, tournamentId, { name, type, data, purpose = 'player' }) {
    const tournament = await tournamentOf(tournamentId)
    if (!FILE_PURPOSES.includes(purpose)) throw invalid('invalid_purpose')
    if (purpose === 'logo' && isCoach(actor)) throw denied()
    if (isCoach(actor)) assertCoachMayWrite(actor, tournament)
    const problem = checkFile({ name, type, data })
    if (problem) throw invalid(problem)
    const row = await stores.files.insert({
      tournamentId, purpose, public: purpose === 'logo', name: safeFileName(name), type, size: base64Size(data), data,
      uploadedBy: actor?.uid || null, teamId: isCoach(actor) ? actor.teamId : null, at: iso(),
    })
    return fileMeta(row)
  }

  /**
   * Who may open a file: anyone for a public logo; staff who can see
   * registrations; a coach for their own team's uploads.
   */
  async function readFile(actor, fileId, { canViewRegistrations = false } = {}) {
    const file = await load('files', fileId)
    if (file.public) return file
    if (!actor) throw denied()
    if (isCoach(actor)) {
      if (actor.tournamentId === file.tournamentId && file.teamId && file.teamId === actor.teamId) return file
      throw denied()
    }
    if (canViewRegistrations) return file
    throw denied()
  }

  /** Cascade for a deleted tournament: nothing it owned may be left behind. */
  async function purgeTournament(tournamentId) {
    for (const name of ['ageGroups', 'weightCategories', 'teams', 'players', 'pools', 'brackets', 'medals', 'certificates', 'registrationLinks', 'notifications', 'files']) {
      await stores[name].removeWhere({ tournamentId })
    }
  }

  return {
    // tournament
    updateTournament, setLifecycle, setEntriesLock, setDrawLock, updateForm, purgeTournament,
    // configuration
    ageGroups, weightCategories,
    // registration
    teams, listPlayers, pagePlayers, pageAudit, createPlayer, updatePlayer, removePlayer, previewBulk, importBulk,
    setRegistrationStatus, recordPayment, recordWeighIn,
    // categorisation and draw
    categorize, overrideCategory, divisions, listPools, generatePools, movePlayer,
    // matches and results
    generateMatches, listMatches, correctResult, swapCorners, overrideMedals,
    kataDivisions, kataRoundView, createKataRound, submitKataScore, completeKataRound, kataRounds: kataRoundsOf, results, generateBracket, bracketView, syncBracket,
    publishResults, listMedals, tally, generateCertificates, listCertificates,
    // links and coaches
    getLink, saveLink, linkInfo, openLink, coachOverview,
    // public, dashboard, audit
    publicList, publicView, publicTournament, dashboard, listNotifications, markNotificationsRead, sendWeighInReminder,
    auditTrail: (tournamentId) => audit.forTournament(tournamentId),
    // files
    uploadFile, readFile,
  }
}

export const TMS_COLLECTIONS = [
  'ageGroups', 'weightCategories', 'teams', 'players', 'pools', 'brackets', 'medals',
  'certificates', 'registrationLinks', 'notifications', 'auditLog', 'files',
  'kataRounds', 'kataScores', 'medalOverrides', 'matchEvents', 'organizations',
]

export { DomainError, poolName }
