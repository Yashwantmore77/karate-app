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
import { paymentsEnabled } from './features.js'
import { CATEGORY_PRESETS, weightClasses } from './presets.js'
import { categorizePlayer, categoryLabel, EVENTS } from './categories.js'
import {
  TOURNAMENT_STATUS, REGISTRATION_STATUS, tournamentLifecycle, registrationLifecycle,
  assertTransition, InvalidTransition, isBackward, RESULT_TYPES as LIFECYCLE_RESULT_TYPES, EXCEPTIONAL_RESULTS, matchLifecycle,
} from './lifecycle.js'
import { can, PERMISSION as P } from './permissions.js'
import { DEFAULT_TIME_ZONE, isValidTimeZone, isLocalDateTime, zonedInstant } from './timezone.js'
import { BUILTIN_RULESETS, DEFAULT_RULESET_ID, rulesetSettings, rulesetProblems, cleanRuleset } from './rulesets.js'
import { AUDIT_ACTIONS as A, createAuditLog, diff } from './audit.js'
import { DomainError, rule, invalid, missing, denied } from './errors.js'
import { DEFAULT_POOL_SIZE, DRAW_METHODS, POOL_MODES, drawPools, roundRobin, seededRandom, poolName, shuffle as shuffleWith, isUneven } from './pools.js'
import {
  DEFAULT_RESULT_RULES, poolStandings, poolComplete, qualifierSeeds, buildBracket,
  bracketMedals, poolMedals, medalTally, boutOutcome, nextPow2,
} from './results.js'
import {
  formFields, normalizeForm, validatePlayer, validateBulkRows, parseCsv, playerIdentity, withoutReadOnly,
  withDefaults, withTeamDefaults, possibleDuplicates, normalizeName,
  publicPlayer, publicTeam,
} from './registration.js'
import { hashSecret, verifySecret, randomToken } from './secret.js'
import { checkFile, base64Size, safeFileName, FILE_PURPOSES } from './files.js'
import { paginate, pageOptions } from './paging.js'
import { normalizeKataScore, kataFinal, rankKata, componentScore } from './kata.js'

const R = REGISTRATION_STATUS
const T = TOURNAMENT_STATUS

export const DEFAULT_SETTINGS = {
  poolSize: DEFAULT_POOL_SIZE,
  ...DEFAULT_RESULT_RULES,
  mats: 2,
  matchDurationSec: 180,
  pointGap: 8,
  weighInAutoMove: true,
  // PRD point 20: referees and judges see only the bouts they are put on.
  officialsSeeAssignedOnly: false,
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
  // PRD v1 §14: score range, precision, components, tie-break.
  kataMinScore: 5,
  kataMaxScore: 10,
  kataPrecision: 1,
  kataComponents: false,
  kataTechnicalWeight: 0.7,
  kataTieBreak: 'total_then_best',
  fees: { kata: 0, kumite: 0, both: 0, team: 0 },
  // --- PRD v1 §6 tournament settings -------------------------------------
  allowUnevenPools: true,
  allowByes: true,
  allowSeeding: true,
  drawMethod: 'random',
  thirdPlaceMatch: false,
  // On a tie at time: senshu, extra time, golden score (first score wins) or a decision.
  overtime: 'senshu',
  extraTimeSec: 60,
  senshu: true,
  penaltyCategories: 2,
  penaltyLadder: ['C', 'K', 'HC', 'H'],
  // top_n | points | manual (PRD v1 §12 "top-N, points threshold or explicit").
  qualificationMode: 'top_n',
  qualificationPoints: 6,
  // What qualifiers feed: a knockout bracket or a round-robin master pool.
  finalStage: 'knockout',
  // manual: results go public when the admin publishes; auto: as each category is verified.
  resultPublishing: 'manual',
  // public | unlisted (by link only) | private.
  publicVisibility: 'public',
  publicCertificates: false,
  entryLockAt: null,
  certificate: { template: 'classic', title: 'Certificate of Achievement', signatory1: 'Tournament Director', signatory2: 'Chief Referee', footer: '' },
  // --- PRD v1 §7-12 entry rules ---------------------------------------------
  requireWeighInForDraw: true,
  weightPrecision: 1,
  weightUpperInclusive: true,
  singlePlayerPolicy: 'admin_decision',
  groupByDivision: true,
  allowDuplicatePlayers: false,
  attendanceEnabled: true,
  notificationChannels: { inApp: true, email: true, sms: false, whatsapp: false },
}

export const SETTING_CHOICES = {
  drawMethod: ['random', 'seeded'],
  qualificationMode: ['top_n', 'points', 'manual'],
  finalStage: ['knockout', 'master_pool'],
  resultPublishing: ['manual', 'auto'],
  publicVisibility: ['public', 'unlisted', 'private'],
  singlePlayerPolicy: ['no_competition', 'auto_award', 'admin_decision'],
  certificateTemplate: ['classic', 'modern', 'minimal'],
}

export const PAYMENT_STATUS = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
export const RESULT_TYPES = LIFECYCLE_RESULT_TYPES
export const WEIGH_IN_STATUS = ['PENDING', 'PASSED', 'FAILED', 'RECHECK_REQUIRED']

// A player takes part in the draw once approved, and not if rejected.
const DRAW_ELIGIBLE = new Set([
  R.APPROVED, R.PAYMENT_PENDING, R.PAYMENT_VERIFIED, R.WEIGH_IN_PENDING,
  R.WEIGH_IN_VERIFIED, R.CATEGORY_CONFIRMED, R.LOCKED, R.DRAW_ASSIGNED, R.COMPLETED,
])

// PRD v1 §16: Provisional → Verified → Published → Locked, per category.
export const RESULT_STATUS = { IN_PROGRESS: 'IN_PROGRESS', PROVISIONAL: 'PROVISIONAL', VERIFIED: 'VERIFIED', PUBLISHED: 'PUBLISHED', LOCKED: 'LOCKED' }

/** PRD v1 §12: the player's Division (e.g. Novice, Advanced) is part of the group. */
export const divisionSlug = (division) => String(division || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export const divisionKey = (event, ageGroupId, weightCategoryId, division = null) =>
  `${event}:${ageGroupId}:${event === EVENTS.KATA ? '-' : (weightCategoryId || '-')}${division && divisionSlug(division) ? `:${divisionSlug(division)}` : ''}`

export const parseDivisionKey = (key) => {
  const [event, ageGroupId, weightCategoryId, division = null] = String(key).split(':')
  return { event, ageGroupId, weightCategoryId: weightCategoryId === '-' ? null : weightCategoryId, division }
}

const pad = (n, width = 3) => String(n).padStart(width, '0')
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''))
const LOCKED_PLAYER_FIELDS = ['dob', 'gender', 'weight', 'events', 'teamId']

/**
 * The people a team brings besides its players. One person may hold several
 * roles: a team manager who also coaches, a coach who also judges.
 */
export const TEAM_MEMBER_ROLES = ['team_manager', 'coach', 'judge', 'referee']
export const TEAM_MEMBER_ROLE_LABEL = { team_manager: 'Team Manager', coach: 'Coach', judge: 'Judge', referee: 'Referee' }
export const memberRolesText = (roles = []) => TEAM_MEMBER_ROLES.filter((r) => roles.includes(r)).map((r) => TEAM_MEMBER_ROLE_LABEL[r]).join(' & ')
// What an approval was given for: changing any of these sends a player back to verification.
const REVERIFY_FIELDS = ['name', 'dob', 'gender', 'weight', 'events']
const APPROVED_STATES = ['APPROVED', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'WEIGH_IN_PENDING', 'WEIGH_IN_VERIFIED', 'CATEGORY_CONFIRMED']

/**
 * The payment record after the fee changes (events added or dropped). A
 * player who had paid less than the new fee owes the difference and shows as
 * pending again; one who paid more is owed a refund.
 */
export function feeChange(payment = {}, fee) {
  const current = payment || {}
  if (current.status !== 'PAID') return { ...current, amount: fee }
  const paid = current.paidAmount ?? current.amount ?? 0
  const { balanceDue, refundDue, ...rest } = current
  if (fee > paid) return { ...rest, amount: fee, paidAmount: paid, status: 'PENDING', balanceDue: fee - paid }
  return { ...rest, amount: fee, paidAmount: paid, ...(paid > fee ? { refundDue: paid - fee } : {}) }
}

export function settingsOf(tournament) {
  const s = { ...DEFAULT_SETTINGS, ...(tournament?.settings || {}) }
  s.fees = { ...DEFAULT_SETTINGS.fees, ...(tournament?.settings?.fees || {}) }
  s.points = { ...DEFAULT_SETTINGS.points, ...(tournament?.settings?.points || {}) }
  s.certificate = { ...DEFAULT_SETTINGS.certificate, ...(tournament?.settings?.certificate || {}) }
  s.notificationChannels = { ...DEFAULT_SETTINGS.notificationChannels, ...(tournament?.settings?.notificationChannels || {}) }
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

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,16}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const len = (v) => String(v ?? '').trim().length

/**
 * PRD v1 §6: field rules that hold whenever a tournament is saved. Returns
 * a list of { field, message }.
 */
export function tournamentProblems(t) {
  const out = []
  const tz = t.timezone || DEFAULT_TIME_ZONE
  if (t.name != null && (len(t.name) < 2 || len(t.name) > 150)) out.push({ field: 'name', message: 'Tournament name must be 2–150 characters' })
  if (t.organizer && (len(t.organizer) < 2 || len(t.organizer) > 150)) out.push({ field: 'organizer', message: 'Organizer must be 2–150 characters' })
  const venue = t.venue || t.location
  if (venue && (len(venue) < 2 || len(venue) > 200)) out.push({ field: 'venue', message: 'Venue must be 2–200 characters' })
  if (t.timezone && !isValidTimeZone(t.timezone)) out.push({ field: 'timezone', message: 'Unknown time zone' })
  for (const k of ['registrationStart', 'registrationClose']) {
    if (t[k] && !isLocalDateTime(t[k])) out.push({ field: k, message: 'Use a date, or a date and time' })
  }
  if (t.startDate && t.endDate && t.endDate < t.startDate) out.push({ field: 'endDate', message: 'End date cannot be before the start date' })
  const day = (v) => String(v).slice(0, 10)
  // On-site entries during the event are allowed; after its last day they are not.
  if (t.registrationClose && (t.endDate || t.startDate) && isLocalDateTime(t.registrationClose) && day(t.registrationClose) > (t.endDate || t.startDate)) {
    out.push({ field: 'registrationClose', message: 'Registration must close by the last day of the tournament' })
  }
  if (t.weighInDate && (t.endDate || t.startDate) && t.weighInDate > (t.endDate || t.startDate)) {
    out.push({ field: 'weighInDate', message: 'Weigh-in must be on or before the last day of the tournament' })
  }
  if (t.registrationStart && t.registrationClose && isLocalDateTime(t.registrationStart) && isLocalDateTime(t.registrationClose)
    && zonedInstant(t.registrationClose, tz, { endOfDay: true }) <= zonedInstant(t.registrationStart, tz)) {
    out.push({ field: 'registrationClose', message: 'Registration must close after it opens' })
  }
  if (t.contactMobile && !PHONE_RE.test(String(t.contactMobile))) out.push({ field: 'contactMobile', message: 'Contact mobile is not a valid phone number' })
  if (t.contactEmail && !EMAIL_RE.test(String(t.contactEmail))) out.push({ field: 'contactEmail', message: 'Contact email is not valid' })
  return out
}

/** PRD v1 §6: what must be filled in before registration can open. */
/**
 * The events a tournament holds, from its type. A tournament with no type
 * set (older records only carry the scoring template) is treated as holding
 * both, so nothing it already has is hidden.
 */
export function tournamentEvents(t) {
  if (t?.type === 'kata') return ['kata']
  if (t?.type === 'kumite') return ['kumite']
  return ['kata', 'kumite']
}

/**
 * What is wrong with a team's details, field by field ({} when nothing is),
 * so the forms can say it before the server has to. `partial` checks only the
 * fields given (an edit).
 */
export function teamProblems(team = {}, { partial = false } = {}) {
  const out = {}
  if (!partial || 'name' in team) {
    if (len(team.name) < 2) out.name = 'Team name is required (at least 2 characters)'
  }
  if (team.email && !EMAIL_RE.test(String(team.email).trim())) out.email = 'Enter a valid email address'
  if (team.mobile && !PHONE_RE.test(String(team.mobile).trim())) out.mobile = 'Enter a valid mobile number'
  return out
}

export function registrationReadiness(t) {
  const missing = []
  const need = (ok, field, message) => { if (!ok) missing.push({ field, message }) }
  need(len(t.name) >= 2, 'name', 'Tournament name')
  need(len(t.organizer) >= 2, 'organizer', 'Organizer')
  need(len(t.venue || t.location) >= 2, 'venue', 'Venue / place')
  need(!!t.startDate, 'startDate', 'Start date')
  need(!!t.endDate, 'endDate', 'End date')
  need(!!t.masterAgeDate, 'masterAgeDate', 'Master Age Calculation Date')
  need(!!t.registrationStart, 'registrationStart', 'Registration opens')
  need(!!t.registrationClose, 'registrationClose', 'Registration closes')
  need(!!(t.type || t.template), 'type', 'Tournament type (Kata and/or Kumite)')
  need(!!t.contactMobile, 'contactMobile', 'Contact mobile')
  need(!!t.contactEmail, 'contactEmail', 'Contact email')
  return [...missing, ...tournamentProblems(t)]
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

  /** PRD v1 §5: an archived tournament is read-only history. */
  const assertWritable = (tournament) => {
    if (lifecycleOf(tournament) === T.ARCHIVED) throw rule('tournament_archived')
    return tournament
  }
  const writableTournament = async (id) => assertWritable(await tournamentOf(id))

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
        const s = settingsOf(tournament)
        // PRD v1 §20: channels are configurable per tournament.
        const channels = { ...s.notificationChannels, email: s.emailNotifications !== false && s.notificationChannels.email !== false }
        if (channels.email || channels.sms || channels.whatsapp) await onNotify(row, tournament, channels)
      } catch {
        // the in-app notification stands
      }
    }
    return row
  }

  const config = async (tournamentId, { write = false } = {}) => {
    const tournament = await (write ? writableTournament : tournamentOf)(tournamentId)
    const [ageGroups, weightCategories] = await Promise.all([
      stores.ageGroups.list({ tournamentId }),
      stores.weightCategories.list({ tournamentId }),
    ])
    const settings = settingsOf(tournament)
    return { tournament, masterAgeDate: tournament.masterAgeDate, ageGroups, weightCategories, settings, weightUpperInclusive: settings.weightUpperInclusive !== false }
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

  /**
   * What the coach portal shows: open exactly when a coach may write
   * (assertCoachMayWrite), and if not, why — so the screen never says "open"
   * while every save is refused.
   */
  const coachWindow = (tournament) => {
    const w = registrationWindow(tournament)
    const status = lifecycleOf(tournament)
    const reason = tournament.entriesLocked ? 'entries_locked'
      // Still being set up: the organiser has not opened registration yet.
      : status === T.DRAFT ? 'tournament_not_open'
        : status !== T.REGISTRATION_OPEN ? 'registration_closed' : w.reason
    return { registrationOpen: !reason, closedReason: reason, opensAt: w.opensAt, closesAt: w.closesAt }
  }

  /** Rule 7, and a coach only ever reaches their own team. */
  const assertCoachMayWrite = (actor, tournament, teamId) => {
    if (!isCoach(actor)) return
    if (actor.tournamentId !== tournament.id) throw denied()
    if (teamId !== undefined && actor.teamId !== teamId) throw denied('not_your_team')
    if (tournament.entriesLocked) throw rule('entries_locked')
    if (lifecycleOf(tournament) === T.DRAFT) throw rule('tournament_not_open')
    if (lifecycleOf(tournament) !== T.REGISTRATION_OPEN) throw rule('registration_closed')
    const window = registrationWindow(tournament)
    if (!window.open) throw rule(window.reason)
  }

  /**
   * PRD v1 §6 and §11: coaches may write only between registration opening
   * and closing, before the entry-lock deadline and while no soft lock is on
   * (times in the tournament's own zone). Admins are not held by any of it.
   */
  function registrationWindow(tournament, at = now()) {
    const tz = tournament.timezone || DEFAULT_TIME_ZONE
    const s = settingsOf(tournament)
    const opensAt = zonedInstant(tournament.registrationStart, tz)
    const closesAt = zonedInstant(tournament.registrationClose, tz, { endOfDay: true })
    const lockAt = zonedInstant(s.entryLockAt, tz, { endOfDay: true })
    let reason = null
    if (tournament.entriesLocked) reason = 'entries_locked'
    else if (tournament.softLocked) reason = 'entries_soft_locked'
    else if (opensAt && at < opensAt) reason = 'registration_not_yet_open'
    else if (closesAt && at > closesAt) reason = 'registration_closed'
    else if (lockAt && at > lockAt) reason = 'entry_lock_deadline_passed'
    return { open: !reason, reason, opensAt, closesAt, lockAt }
  }

  /**
   * Rule 1 and Rule 2: recompute age and suggested categories. An entry an
   * admin overrode keeps the override; everything else follows the data.
   */
  const categorizeFields = (player, cfg) => {
    const age = calculateAge(player.dob, cfg.tournament.masterAgeDate)
    const entries = {}
    const issues = []
    const div = groupDivision(player, cfg)
    for (const event of player.events || []) {
      const previous = player.entries?.[event]
      if (previous?.override) {
        entries[event] = { ...previous, divisionKey: divisionKey(event, previous.ageGroupId, previous.weightCategoryId, div) }
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
          ? divisionKey(event, suggestion.ageGroup.id, suggestion.weightCategory?.id, div) : null,
      }
    }
    return { age, entries, categoryIssues: issues }
  }

  const groupDivision = (player, cfg) => (cfg.settings?.groupByDivision !== false && player.division ? player.division : null)

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

  async function updateTournament(actor, tournamentId, input) {
    const before = await writableTournament(tournamentId)
    const { confirmImpact = false, ...patch } = input
    // Rule 1 depends on the master date: changing it after entries are locked
    // would silently move every player.
    if ('masterAgeDate' in patch && patch.masterAgeDate !== before.masterAgeDate) {
      assertConfigOpen(before)
      // PRD v1 §9: with entries in, the change shows its impact first.
      const players = await stores.players.count({ tournamentId })
      if (players && !confirmImpact) throw rule('master_date_change_needs_confirmation', { players })
    }
    const next = { ...patch }
    if (patch.settings) next.settings = { ...(before.settings || {}), ...patch.settings }
    // Changing the type may not drop an event players have already entered.
    if ('type' in patch && patch.type !== before.type) {
      const keep = tournamentEvents({ ...before, ...next })
      const players = await stores.players.list({ tournamentId })
      const stranded = ['kata', 'kumite'].filter((e) => !keep.includes(e) && players.some((p) => (p.events || []).includes(e)))
      if (stranded.length) throw rule('type_has_entries', { events: stranded, players: players.filter((p) => (p.events || []).some((e) => stranded.includes(e))).length })
    }
    const problems = tournamentProblems({ ...before, ...next })
    if (problems.length) throw invalid('invalid_tournament', { errors: problems })
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
    if (isBackward(from, to) && !reason) throw invalid('reason_required')
    // PRD v1 §5: reopening a completed tournament is a privileged action.
    if (from === T.COMPLETED && to === T.LIVE && actor && !can(actor.role, P.TOURNAMENT_REOPEN)) throw denied('reopen_forbidden')
    if (to === T.REGISTRATION_OPEN) {
      if (!tournament.masterAgeDate) throw rule('master_age_date_required')
      const missingFields = registrationReadiness(tournament)
      if (missingFields.length) throw rule('tournament_incomplete', { errors: missingFields })
      await resolveRuleset(tournament.rulesetId || DEFAULT_RULESET_ID, { activeOnly: true })
    }
    const patch = { lifecycleStatus: to }
    // Entries freeze when the PRD says so: at Entries Locked, and once live.
    if ([T.ENTRIES_LOCKED, T.LIVE].includes(to) && !tournament.entriesLocked) patch.entriesLocked = true
    const after = await stores.tournaments.update(tournamentId, patch)
    await record(actor, { tournamentId, action: A.TOURNAMENT_STATUS_CHANGED, entity: 'tournament', entityId: tournamentId, before: { lifecycleStatus: from }, after: { lifecycleStatus: to }, reason })
    if (patch.entriesLocked) await lockEntryStatuses(tournamentId)
    // PRD v1 §16: completing the tournament locks every published result.
    if (to === T.COMPLETED) await lockDivisionResults(actor, tournamentId)
    if (from === T.COMPLETED && to === T.LIVE) await unlockDivisionResults(actor, tournamentId, reason)
    return after
  }

  async function setEntriesLock(actor, tournamentId, locked, reason = null) {
    const tournament = await writableTournament(tournamentId)
    if (!!tournament.entriesLocked === !!locked) return tournament
    if (!locked) {
      if (tournament.drawLocked) throw rule('draw_locked')
      if (!reason) throw invalid('reason_required')
    }
    const patch = { entriesLocked: !!locked }
    if (locked && [T.REGISTRATION_CLOSED, T.VERIFICATION, T.WEIGH_IN].includes(lifecycleOf(tournament))) patch.lifecycleStatus = T.ENTRIES_LOCKED
    const after = await stores.tournaments.update(tournamentId, patch)
    await record(actor, { tournamentId, action: locked ? A.ENTRIES_LOCKED : A.ENTRIES_UNLOCKED, entity: 'tournament', entityId: tournamentId, reason, ...(patch.lifecycleStatus ? { before: { lifecycleStatus: lifecycleOf(tournament) }, after: { lifecycleStatus: patch.lifecycleStatus } } : {}) })
    if (locked) await lockEntryStatuses(tournamentId)
    else await unlockEntryStatuses(tournamentId)
    return after
  }

  /**
   * PRD v1 §11 soft lock: coaches stop, admins carry on. The hard lock is
   * the entries lock above.
   */
  async function setSoftLock(actor, tournamentId, locked, reason = null) {
    const tournament = await writableTournament(tournamentId)
    if (!!tournament.softLocked === !!locked) return tournament
    if (!locked && !reason) throw invalid('reason_required')
    const after = await stores.tournaments.update(tournamentId, { softLocked: !!locked })
    await record(actor, { tournamentId, action: locked ? A.ENTRIES_SOFT_LOCKED : A.ENTRIES_SOFT_UNLOCKED, entity: 'tournament', entityId: tournamentId, reason })
    return after
  }

  /** PRD v1 §11: eligible entries show as Locked while entries are locked. */
  async function lockEntryStatuses(tournamentId) {
    for (const p of await stores.players.list({ tournamentId })) {
      if ([R.WEIGH_IN_VERIFIED, R.CATEGORY_CONFIRMED].includes(p.registrationStatus)
        || ([R.APPROVED, R.PAYMENT_PENDING, R.PAYMENT_VERIFIED, R.WEIGH_IN_PENDING].includes(p.registrationStatus))) {
        await stores.players.update(p.id, { registrationStatus: R.LOCKED, statusBeforeLock: p.registrationStatus })
      }
    }
  }

  async function unlockEntryStatuses(tournamentId) {
    for (const p of await stores.players.list({ tournamentId, registrationStatus: R.LOCKED })) {
      await stores.players.update(p.id, { registrationStatus: p.statusBeforeLock || R.APPROVED, statusBeforeLock: null })
    }
  }

  async function setDrawLock(actor, tournamentId, locked, reason = null) {
    const tournament = await writableTournament(tournamentId)
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
    const before = await writableTournament(tournamentId)
    if (!Array.isArray(fields)) throw invalid('invalid_fields')
    const registrationForm = normalizeForm(fields)
    const after = await stores.tournaments.update(tournamentId, { registrationForm })
    await record(actor, { tournamentId, action: A.FORM_UPDATED, entity: 'tournament', entityId: tournamentId, before: { registrationForm: before.registrationForm || null }, after: { registrationForm } })
    return after
  }

  // --- rulesets (PRD v1 §6, §14, §24) ----------------------------------------

  /** The stored edit that currently stands in for a standard ruleset, if any. */
  const editedStandard = (stored, builtinId) => stored.find((r) => r.family === builtinId && !r.superseded) || null

  async function listRulesets({ includeSuperseded = false } = {}) {
    const stored = stores.rulesets ? await stores.rulesets.list({}) : []
    // A standard ruleset that has been edited is replaced in the list by its
    // newest version; the original stays usable by tournaments that applied it.
    const builtins = BUILTIN_RULESETS.map((r) => {
      const edit = editedStandard(stored, r.id)
      return edit ? { ...r, superseded: true, supersededBy: edit.id } : r
    })
    const rows = [...builtins, ...stored].filter((r) => includeSuperseded || !r.superseded)
    const inUse = new Map()
    for (const t of await stores.tournaments.list({})) {
      const id = t.rulesetId || DEFAULT_RULESET_ID
      inUse.set(id, (inUse.get(id) || 0) + 1)
    }
    return rows.map((r) => ({ ...r, tournaments: inUse.get(r.id) || 0 }))
      .sort((a, b) => Number(!!(b.builtIn || b.standard)) - Number(!!(a.builtIn || a.standard)) || String(a.name).localeCompare(String(b.name)) || a.version - b.version)
  }

  async function resolveRuleset(id, { activeOnly = false } = {}) {
    const found = BUILTIN_RULESETS.find((r) => r.id === id) || (stores.rulesets ? await stores.rulesets.get(id) : null)
    if (!found) throw invalid('invalid_ruleset')
    if (activeOnly && found.active === false) throw rule('ruleset_inactive')
    return found
  }

  async function createRuleset(actor, input) {
    const doc = cleanRuleset(input)
    const problems = rulesetProblems(doc)
    if (problems.length) throw invalid('invalid_ruleset', { errors: problems.map((field) => ({ field, message: `Check ${field}` })) })
    const row = await stores.rulesets.insert({ ...doc, version: 1, active: true, superseded: false, createdBy: actor?.uid || null })
    const withFamily = await stores.rulesets.update(row.id, { family: row.id })
    await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: row.id, after: { name: doc.name, version: 1 } })
    return withFamily
  }

  /**
   * A ruleset nobody uses changes in place. One a tournament uses becomes a
   * new version, so that tournament keeps the rules it was run under.
   */
  async function updateRuleset(actor, id, input) {
    const builtin = BUILTIN_RULESETS.find((r) => r.id === id)
    if (builtin) return editStandard(actor, builtin, input)
    const current = await resolveRuleset(id)
    if (current.superseded) throw rule('ruleset_superseded')
    const doc = cleanRuleset({ ...current, ...input, kumite: { ...current.kumite, ...(input.kumite || {}) }, kata: { ...current.kata, ...(input.kata || {}) } })
    const problems = rulesetProblems(doc)
    if (problems.length) throw invalid('invalid_ruleset', { errors: problems.map((field) => ({ field, message: `Check ${field}` })) })
    const used = (await stores.tournaments.list({})).some((t) => t.rulesetId === id)
    if (!used) {
      const after = await stores.rulesets.update(id, doc)
      await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: id, before: { version: current.version }, after: { version: current.version, name: doc.name } })
      return after
    }
    const next = await stores.rulesets.insert({ ...doc, family: current.family || current.id, version: current.version + 1, active: current.active !== false, superseded: false, previousId: id, createdBy: actor?.uid || null })
    await stores.rulesets.update(id, { superseded: true, supersededBy: next.id })
    await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: next.id, before: { version: current.version }, after: { version: next.version, name: doc.name }, reason: 'In use: saved as a new version' })
    return next
  }

  /**
   * Editing a standard ruleset (owner's decision: the standard rules may need
   * to change later). The original is never altered: the edit is saved as the
   * next version of the same family and takes its place in the list, so a
   * tournament that applied the original keeps it.
   */
  async function editStandard(actor, builtin, input) {
    const stored = await stores.rulesets.list({})
    if (editedStandard(stored, builtin.id)) throw rule('ruleset_superseded')
    const doc = cleanRuleset({ ...builtin, ...input, kumite: { ...builtin.kumite, ...(input.kumite || {}) }, kata: { ...builtin.kata, ...(input.kata || {}) } })
    const problems = rulesetProblems(doc)
    if (problems.length) throw invalid('invalid_ruleset', { errors: problems.map((field) => ({ field, message: `Check ${field}` })) })
    const version = Math.max(builtin.version, ...stored.filter((r) => r.family === builtin.id).map((r) => r.version)) + 1
    const next = await stores.rulesets.insert({ ...doc, family: builtin.id, standard: true, version, active: true, superseded: false, previousId: builtin.id, createdBy: actor?.uid || null })
    await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: next.id, before: { ruleset: builtin.id, version: builtin.version }, after: { version, name: doc.name }, reason: 'Standard ruleset edited: saved as a new version' })
    return next
  }

  /** Puts a standard ruleset back as it shipped; the edits stay on record. */
  async function restoreStandard(actor, builtinId) {
    const builtin = BUILTIN_RULESETS.find((r) => r.id === builtinId)
    if (!builtin) throw invalid('invalid_ruleset')
    let restored = 0
    for (const r of await stores.rulesets.list({ family: builtinId })) {
      if (r.superseded) continue
      await stores.rulesets.update(r.id, { superseded: true, supersededBy: builtinId })
      restored += 1
    }
    if (restored) await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: builtinId, reason: 'Standard ruleset restored' })
    return builtin
  }

  async function setRulesetActive(actor, id, active) {
    if (BUILTIN_RULESETS.some((r) => r.id === id)) throw rule('builtin_ruleset')
    await resolveRuleset(id)
    const after = await stores.rulesets.update(id, { active: !!active })
    await record(actor, { tournamentId: null, action: A.RULESET_CHANGED, entity: 'ruleset', entityId: id, after: { active: !!active } })
    return after
  }

  /** A tournament takes a ruleset's rules into its settings and remembers which version. */
  async function applyRuleset(actor, tournamentId, rulesetId) {
    const tournament = await writableTournament(tournamentId)
    const ruleset = await resolveRuleset(rulesetId, { activeOnly: true })
    const settings = { ...(tournament.settings || {}), ...rulesetSettings(ruleset) }
    const after = await stores.tournaments.update(tournamentId, { rulesetId: ruleset.id, rulesetVersion: ruleset.version, rulesetName: ruleset.name, settings })
    await record(actor, { tournamentId, action: A.TOURNAMENT_UPDATED, entity: 'tournament', entityId: tournamentId, before: { rulesetId: tournament.rulesetId || null }, after: { rulesetId: ruleset.id, rulesetVersion: ruleset.version } })
    return after
  }

  // --- age groups and weight categories ------------------------------------

  const configCrud = (collection, entity, validateDoc) => ({
    list: async (tournamentId) => (await stores[collection].list({ tournamentId })).sort((a, b) =>
      (a.minAge ?? 0) - (b.minAge ?? 0) || (a.maxWeight ?? 999) - (b.maxWeight ?? 999) || byName(a, b)),
    async create(actor, tournamentId, input) {
      const tournament = await writableTournament(tournamentId)
      assertConfigOpen(tournament)
      await validateDoc(tournamentId, input)
      const { allowOverlap, ...doc } = input
      const row = await stores[collection].insert({ active: true, ...doc, ...(allowOverlap ? { overlapAllowed: true } : {}), settings: normalizeCategorySettings(doc.settings), tournamentId })
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: row.id, after: row })
      await recategorizeAll(actor, tournamentId, { silent: true })
      return row
    },
    async update(actor, tournamentId, id, input) {
      const tournament = await writableTournament(tournamentId)
      const { allowOverlap, ...patch } = input
      // Category settings (pool size, duration, ...) decide nobody's category,
      // so they may still be tuned after entries are locked; nothing else may.
      const settingsOnly = Object.keys(patch).every((k) => k === 'settings')
      if (!settingsOnly) assertConfigOpen(tournament)
      const before = await inTournament(collection, tournamentId, id)
      const next = { ...patch }
      if ('settings' in patch) next.settings = normalizeCategorySettings(patch.settings)
      if (!settingsOnly) await validateDoc(tournamentId, { ...before, ...next, allowOverlap: allowOverlap ?? before.overlapAllowed })
      if (allowOverlap !== undefined) next.overlapAllowed = !!allowOverlap
      const after = await stores[collection].update(id, next)
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: id, before, after })
      if (!settingsOnly) await recategorizeAll(actor, tournamentId, { silent: true })
      return after
    },
    async remove(actor, tournamentId, id) {
      const tournament = await writableTournament(tournamentId)
      assertConfigOpen(tournament)
      const before = await inTournament(collection, tournamentId, id)
      if (collection === 'ageGroups') await stores.weightCategories.removeWhere({ tournamentId, ageGroupId: id })
      await stores[collection].remove(id)
      await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity, entityId: id, before, reason: 'deleted' })
      await recategorizeAll(actor, tournamentId, { silent: true })
    },
  })

  // PRD v1 §9: overlapping categories are blocked unless the admin says
  // they are intended (allowOverlap).
  const genderClash = (a, b) => a === 'Mixed' || b === 'Mixed' || a === b
  const ageGroups = configCrud('ageGroups', 'age_group', async (tournamentId, doc) => {
    if (!doc.name) throw invalid('name_required')
    if (!['M', 'F', 'Mixed'].includes(doc.gender)) throw invalid('invalid_gender')
    if (!(doc.minAge >= 0) || !(doc.maxAge >= doc.minAge)) throw invalid('invalid_age_range')
    if (!doc.allowOverlap && doc.active !== false) {
      const clash = (await stores.ageGroups.list({ tournamentId })).find((g) => g.id !== doc.id && g.active !== false
        && genderClash(g.gender, doc.gender) && doc.minAge <= g.maxAge && g.minAge <= doc.maxAge)
      if (clash) throw rule('overlapping_age_group', { with: clash.name })
    }
  })

  const weightCategories = configCrud('weightCategories', 'weight_category', async (tournamentId, doc) => {
    if (!doc.name) throw invalid('name_required')
    await inTournament('ageGroups', tournamentId, doc.ageGroupId).catch(() => { throw invalid('invalid_ageGroupId') })
    if (doc.minWeight == null && doc.maxWeight == null) throw invalid('weight_bound_required')
    if (doc.minWeight != null && doc.maxWeight != null && doc.maxWeight <= doc.minWeight) throw invalid('invalid_weight_range')
    if (!doc.allowOverlap && doc.active !== false) {
      const lo = (w) => w.minWeight ?? -Infinity
      const hi = (w) => w.maxWeight ?? Infinity
      const clash = (await stores.weightCategories.list({ tournamentId, ageGroupId: doc.ageGroupId })).find((w) => w.id !== doc.id && w.active !== false
        && lo(doc) < hi(w) && lo(w) < hi(doc))
      if (clash) throw rule('overlapping_weight_category', { with: clash.label || clash.name })
    }
  })

  /**
   * Loads a standard category set (presets.js): every age group and weight
   * class at once, then one re-categorisation. Refused as a whole when one of
   * its age groups overlaps an existing one, so nothing is half-loaded.
   */
  async function applyCategoryPreset(actor, tournamentId, key) {
    const preset = CATEGORY_PRESETS[key]
    if (!preset) throw invalid('unknown_preset')
    const tournament = await writableTournament(tournamentId)
    assertConfigOpen(tournament)
    const existing = (await stores.ageGroups.list({ tournamentId })).filter((g) => g.active !== false)
    for (const g of preset.groups) {
      const clash = existing.find((e) => genderClash(e.gender, g.gender) && g.minAge <= e.maxAge && e.minAge <= g.maxAge)
      if (clash) throw rule('overlapping_age_group', { with: clash.name, preset: g.name })
    }
    let weights = 0
    for (const g of preset.groups) {
      const group = await stores.ageGroups.insert({ active: true, name: g.name, gender: g.gender, minAge: g.minAge, maxAge: g.maxAge, settings: {}, tournamentId })
      for (const w of weightClasses(g.weights)) {
        await stores.weightCategories.insert({ active: true, ageGroupId: group.id, ...w, settings: {}, tournamentId })
        weights += 1
      }
    }
    await record(actor, { tournamentId, action: A.CONFIG_CHANGED, entity: 'category_preset', entityId: key, after: { preset: preset.label, ageGroups: preset.groups.length, weightCategories: weights } })
    await recategorizeAll(actor, tournamentId, { silent: true })
    return { ageGroups: preset.groups.length, weightCategories: weights }
  }

  // --- teams ------------------------------------------------------------------

  /** Team contact details are what notices are sent to, so they must be usable. */
  const assertTeamContact = (doc) => {
    const problems = teamProblems(doc, { partial: true })
    if (problems.email) throw invalid('invalid_email', { field: 'email' })
    if (problems.mobile) throw invalid('invalid_mobile', { field: 'mobile' })
  }

  const teams = {
    list: async (tournamentId) => (await stores.teams.list({ tournamentId })).sort(byName),
    get: (tournamentId, id) => inTournament('teams', tournamentId, id),
    async create(actor, tournamentId, doc) {
      const tournament = await writableTournament(tournamentId)
      const { termsAccepted, ...fields } = doc
      if (isCoach(actor)) {
        assertCoachMayWrite(actor, tournament)
        if (actor.teamId) throw rule('team_already_registered')
        // PRD point 2: a coach accepts the tournament's terms to register.
        if (String(tournament.terms || '').trim() && termsAccepted !== true) throw invalid('terms_not_accepted')
      } else if (tournament.entriesLocked) throw rule('entries_locked')
      doc = termsAccepted === true ? { ...fields, termsAcceptedAt: iso() } : fields
      if (!doc.name) throw invalid('name_required')
      assertTeamContact(doc)
      const existing = await stores.teams.list({ tournamentId })
      // PRD v1 §7: team names normalised for duplicate detection.
      if (existing.some((t) => normalizeName(t.name) === normalizeName(doc.name))) throw rule('team_exists')
      // A unique team reference number (PRD v1 §7).
      const max = existing.reduce((m, t) => Math.max(m, Number(String(t.teamNumber || '').replace(/\D/g, '')) || 0), 0)
      const row = await stores.teams.insert({ active: true, ...doc, teamNumber: `T-${pad(max + 1)}`, tournamentId })
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: row.id, after: row })
      // The coach named when registering is the team's first member.
      if (String(doc.coachName || '').trim().length >= 2) {
        await stores.teamMembers.insert({ tournamentId, teamId: row.id, name: String(doc.coachName).trim(), roles: ['coach'], mobile: doc.mobile || null, email: doc.email || null })
      }
      if (isCoach(actor)) await notify(tournamentId, 'admin', 'new_registration', `New team registered: ${row.name}`)
      return row
    },
    async update(actor, tournamentId, id, patch) {
      const tournament = await writableTournament(tournamentId)
      assertCoachMayWrite(actor, tournament, id)
      const before = await inTournament('teams', tournamentId, id)
      if (isCoach(actor) && 'active' in patch) throw denied()
      assertTeamContact(patch)
      if (patch.name && normalizeName(patch.name) !== normalizeName(before.name)
        && (await stores.teams.list({ tournamentId })).some((t) => t.id !== id && normalizeName(t.name) === normalizeName(patch.name))) throw rule('team_exists')
      const after = await stores.teams.update(id, patch)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: id, before, after })
      return after
    },
    /**
     * Deleting a team deletes its players. A coach may only remove an empty
     * team; an organiser removing one with players gives a reason, and the
     * names are kept in the audit log.
     */
    async remove(actor, tournamentId, id, reason = null) {
      const tournament = await writableTournament(tournamentId)
      if (tournament.entriesLocked) throw rule('entries_locked')
      assertCoachMayWrite(actor, tournament, id)
      const before = await inTournament('teams', tournamentId, id)
      const players = await stores.players.list({ tournamentId, teamId: id })
      if (players.length && isCoach(actor)) throw rule('team_has_players', { players: players.length })
      if (players.length && !reason) throw invalid('reason_required', { players: players.length })
      for (const p of players) await stores.players.remove(p.id)
      await stores.teamMembers.removeWhere({ tournamentId, teamId: id })
      await stores.teams.remove(id)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team', entityId: id, before: { ...before, players: players.map((p) => p.name) }, reason: players.length ? `deleted with ${players.length} players: ${reason}` : 'deleted' })
    },
  }

  // --- team members (managers, coaches, judges, referees) -----------------------

  /** Checks one member and returns it cleaned up; `partial` for an edit. */
  const cleanMember = (doc, { partial = false } = {}) => {
    const out = {}
    if (!partial || 'name' in doc) {
      const name = String(doc.name || '').trim().replace(/\s+/g, ' ')
      if (name.length < 2 || name.length > 120) throw invalid('name_required', { field: 'name' })
      out.name = name
    }
    if (!partial || 'roles' in doc) {
      const roles = [...new Set(Array.isArray(doc.roles) ? doc.roles : [])]
      if (!roles.length || roles.some((r) => !TEAM_MEMBER_ROLES.includes(r))) throw invalid('invalid_roles', { field: 'roles' })
      out.roles = TEAM_MEMBER_ROLES.filter((r) => roles.includes(r))
    }
    for (const key of ['mobile', 'email', 'gender', 'qualification', 'notes']) if (key in doc) out[key] = doc[key] == null ? null : String(doc[key]).trim().slice(0, key === 'notes' ? 300 : 120) || null
    if (out.email && !EMAIL_RE.test(out.email)) throw invalid('invalid_email', { field: 'email' })
    if (out.mobile && !PHONE_RE.test(out.mobile)) throw invalid('invalid_mobile', { field: 'mobile' })
    if (out.gender && !['M', 'F'].includes(out.gender)) throw invalid('invalid_gender', { field: 'gender' })
    return out
  }

  const teamMembers = {
    async list(tournamentId, { teamId = null } = {}) {
      const rows = await stores.teamMembers.list(teamId ? { tournamentId, teamId } : { tournamentId })
      return rows.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)) || byName(a, b))
    },
    async create(actor, tournamentId, input) {
      const tournament = await writableTournament(tournamentId)
      const teamId = isCoach(actor) ? actor.teamId : input.teamId
      assertCoachMayWrite(actor, tournament, teamId)
      await inTournament('teams', tournamentId, teamId).catch(() => { throw invalid('invalid_teamId') })
      const doc = cleanMember(input)
      const existing = await stores.teamMembers.list({ tournamentId, teamId })
      if (existing.some((m) => normalizeName(m.name) === normalizeName(doc.name))) throw rule('member_exists', { name: doc.name })
      const row = await stores.teamMembers.insert({ ...doc, tournamentId, teamId })
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team_member', entityId: row.id, after: { team: teamId, name: row.name, roles: row.roles } })
      return row
    },
    async update(actor, tournamentId, id, input) {
      const tournament = await writableTournament(tournamentId)
      const before = await inTournament('teamMembers', tournamentId, id)
      assertCoachMayWrite(actor, tournament, before.teamId)
      const patch = cleanMember(input, { partial: true })
      if (patch.name && normalizeName(patch.name) !== normalizeName(before.name)
        && (await stores.teamMembers.list({ tournamentId, teamId: before.teamId })).some((m) => m.id !== id && normalizeName(m.name) === normalizeName(patch.name))) throw rule('member_exists', { name: patch.name })
      const after = await stores.teamMembers.update(id, patch)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team_member', entityId: id, before: { name: before.name, roles: before.roles }, after: { name: after.name, roles: after.roles } })
      return after
    },
    async remove(actor, tournamentId, id) {
      const tournament = await writableTournament(tournamentId)
      const before = await inTournament('teamMembers', tournamentId, id)
      assertCoachMayWrite(actor, tournament, before.teamId)
      await stores.teamMembers.remove(id)
      await record(actor, { tournamentId, action: A.TEAM_CHANGED, entity: 'team_member', entityId: id, before: { name: before.name, roles: before.roles }, reason: 'removed' })
    },
  }

  /**
   * Everyone a team brings besides players: its members, or, for a team
   * registered before members existed, the coach named on the team.
   */
  async function teamStaff(tournamentId) {
    const teamsById = new Map((await stores.teams.list({ tournamentId })).map((t) => [t.id, t]))
    const members = await stores.teamMembers.list({ tournamentId })
    const withMembers = new Set(members.map((m) => m.teamId))
    const staff = members.filter((m) => teamsById.has(m.teamId)).map((m) => ({ ...m, team: teamsById.get(m.teamId), key: `member:${m.id}` }))
    for (const t of teamsById.values()) {
      if (!withMembers.has(t.id) && t.coachName) staff.push({ id: null, name: t.coachName, roles: ['coach'], team: t, key: `coach:${t.id}` })
    }
    return staff
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

  /**
   * The player filters as a store query (shared/query.js), so a store with a
   * database filters, sorts and pages in the database (PRD section 62). A
   * text search also matches team names and codes, by the teams' ids.
   */
  async function playerQuery(tournamentId, f = {}) {
    const and = [{ tournamentId }]
    if (f.teamId) and.push({ teamId: f.teamId })
    if (f.gender) and.push({ gender: f.gender })
    if (f.event) and.push({ events: f.event })
    if (f.registrationStatus) and.push({ registrationStatus: f.registrationStatus })
    // Never set means still pending.
    if (f.paymentStatus) and.push(f.paymentStatus === 'PENDING' ? { $or: [{ 'payment.status': 'PENDING' }, { 'payment.status': { $missing: true } }] } : { 'payment.status': f.paymentStatus })
    if (f.weighInStatus) and.push(f.weighInStatus === 'PENDING' ? { $or: [{ 'weighIn.status': 'PENDING' }, { 'weighIn.status': { $missing: true } }] } : { 'weighIn.status': f.weighInStatus })
    if (f.ageGroupId) and.push({ $or: Object.values(EVENTS).map((e) => ({ [`entries.${e}.ageGroupId`]: f.ageGroupId })) })
    if (f.weightCategoryId) and.push({ 'entries.kumite.weightCategoryId': f.weightCategoryId })
    for (const key of ['club', 'district', 'state', 'country']) if (f[key]) and.push({ [key]: { $ieq: f[key] } })
    if (f.q) {
      const q = String(f.q)
      const teamIds = (await stores.teams.list({ tournamentId }))
        .filter((t) => [t.name, t.code].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))).map((t) => t.id)
      and.push({ $or: [
        { name: { $contains: q } }, { playerNumber: { $contains: q } }, { club: { $contains: q } }, { id: q },
        ...(teamIds.length ? [{ teamId: { $in: teamIds } }] : []),
      ] })
    }
    return { $and: and }
  }

  async function listPlayers(tournamentId, filter = {}) {
    if (stores.players.search) return (await stores.players.search(await playerQuery(tournamentId, filter), { sort: { name: 1 } })).rows
    // A store without search (an older adapter): filter what it returns.
    const [rows, teamRows] = await Promise.all([stores.players.list({ tournamentId }), stores.teams.list({ tournamentId })])
    const teamsById = new Map(teamRows.map((t) => [t.id, t]))
    return rows.filter((p) => matchesFilter(p, filter, { teamsById })).sort(byName)
  }

  /** A page of players (section 62), with the same filters as listPlayers, paged by the store. */
  async function pagePlayers(tournamentId, filter = {}, options = {}) {
    const { page, pageSize, sort, dir } = pageOptions({ sort: 'name', ...options })
    if (!stores.players.search) return paginate(await listPlayers(tournamentId, filter), { sort: 'name', ...options })
    const { rows, total } = await stores.players.search(await playerQuery(tournamentId, filter), {
      sort: { [sort || 'name']: dir === 'desc' ? -1 : 1 }, skip: page * pageSize, limit: pageSize,
    })
    return { rows, total, page, pageSize }
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

  async function createPlayer(actor, tournamentId, rawInput, { status, skipNotify = false } = {}) {
    const cfg = await config(tournamentId, { write: true })
    const { tournament } = cfg
    if (tournament.entriesLocked) throw rule('entries_locked')
    const { confirmDuplicate = false, ...input } = rawInput
    const teamId = isCoach(actor) ? actor.teamId : input.teamId
    assertCoachMayWrite(actor, tournament, teamId)
    const team = await inTournament('teams', tournamentId, teamId).catch(() => { throw invalid('invalid_teamId') })
    // PRD v1 §21: entries only for an active team.
    if (team.active === false) throw rule('team_inactive')

    const fields = formFields(tournament)
    const filled = withTeamDefaults(withDefaults(isCoach(actor) ? withoutReadOnly(input, fields) : input, fields), team, tournament.country)
    const { player, errors } = validatePlayer(filled, fields, { weightPrecision: cfg.settings.weightPrecision })
    if (errors.length) throw invalid('invalid_player', { errors })
    assertEventsOffered(player, tournament)
    const existing = await stores.players.list({ tournamentId })
    // PRD v1 §21/§28: a possible duplicate is a warning to review and
    // confirm, never a silent merge.
    const dupes = possibleDuplicates(player, existing)
    if (dupes.length && !cfg.settings.allowDuplicatePlayers && !confirmDuplicate) {
      throw rule('possible_duplicate', { matches: dupes.map((d) => ({ id: d.id, name: d.name, dob: d.dob, club: d.club, playerNumber: d.playerNumber, teamId: d.teamId })) })
    }
    assertAgeEligible(actor, player, cfg)

    const doc = {
      ...player,
      teamId,
      tournamentId,
      playerNumber: await nextPlayerNumber(tournamentId),
      seed: input.seed ?? null,
      registrationStatus: status || (isCoach(actor) ? R.SUBMITTED : R.PENDING_VERIFICATION),
      // The system is free while payments are off (features.js): no fee, no payment record.
      payment: paymentsEnabled() ? { amount: feeFor(player, cfg.settings), status: 'PENDING' } : null,
      weighIn: player.events?.includes('kumite') ? { registeredWeight: player.weight ?? null, status: 'PENDING' } : null,
    }
    if (dupes.length) doc.duplicateOf = dupes.map((d) => d.id)
    Object.assign(doc, categorizeFields(doc, cfg))
    const row = await stores.players.insert(doc)
    await record(actor, { tournamentId, action: A.PLAYER_CREATED, entity: 'player', entityId: row.id, after: { name: row.name, teamId } })
    if (dupes.length) {
      await record(actor, { tournamentId, action: A.DUPLICATE_CONFIRMED, entity: 'player', entityId: row.id, after: { duplicateOf: dupes.map((d) => d.playerNumber || d.id) }, reason: 'Possible duplicate confirmed at entry' })
      await notify(tournamentId, 'admin', 'possible_duplicate', `Possible duplicate registered: ${row.name} — review under Registrations → Duplicates`)
    }
    if (!skipNotify && isCoach(actor)) await notify(tournamentId, 'admin', 'new_registration', `New player registered: ${row.name}`)
    return { ...row, notices: ageNotices(row, cfg) }
  }

  /**
   * PRD v1 §21: a coach cannot enter a player no age group admits (an error),
   * once the tournament has age groups. Admins may, and see the issue.
   */
  const assertAgeEligible = (actor, player, cfg) => {
    if (!isCoach(actor) || !cfg.ageGroups.some((g) => g.active !== false) || !cfg.masterAgeDate) return
    const age = calculateAge(player.dob, cfg.masterAgeDate)
    if (age == null) return
    const fits = cfg.ageGroups.some((g) => g.active !== false && age >= g.minAge && age <= g.maxAge
      && (!g.gender || g.gender === 'Mixed' || g.gender === player.gender))
    if (!fits) throw invalid('not_age_eligible', { errors: [{ field: 'dob', message: `No age group in this tournament takes a ${age}-year-old ${player.gender === 'F' ? 'girl' : 'boy'}` }] })
  }

  /** A player enters only events the tournament holds (Kata, Kumite or both). */
  const assertEventsOffered = (player, tournament) => {
    const offered = tournamentEvents(tournament)
    const extra = (player.events || []).filter((e) => !offered.includes(e))
    if (extra.length) {
      throw invalid('invalid_player', { errors: [{ field: 'events', message: `This tournament is ${offered.map((e) => (e === 'kata' ? 'Kata' : 'Kumite')).join(' and ')} only; ${extra.map((e) => (e === 'kata' ? 'Kata' : 'Kumite')).join(' and ')} is not held` }] })
    }
  }

  /** PRD v1 §21 "Info: age boundary notice": at the top of their age group. */
  const ageNotices = (player, cfg) => {
    const out = []
    for (const [event, entry] of Object.entries(player.entries || {})) {
      const g = cfg.ageGroups.find((x) => x.id === entry.ageGroupId)
      if (g && player.age === g.maxAge) out.push({ severity: 'info', event, message: `${player.name} is ${player.age}, the oldest age ${g.name} takes` })
    }
    return out
  }

  async function updatePlayer(actor, tournamentId, id, input) {
    const cfg = await config(tournamentId, { write: true })
    const before = await inTournament('players', tournamentId, id)
    assertCoachMayWrite(actor, cfg.tournament, before.teamId)
    if (isCoach(actor) && 'teamId' in input && input.teamId !== before.teamId) throw denied('not_your_team')
    if (before.registrationStatus === R.WITHDRAWN) throw rule('player_withdrawn')

    const fields = formFields(cfg.tournament)
    const sent = isCoach(actor) ? withoutReadOnly(input, fields, before) : input
    const merged = { ...before, ...sent, extra: { ...(before.extra || {}), ...(sent.extra || {}) } }
    const { player, errors } = validatePlayer(merged, fields, { weightPrecision: cfg.settings.weightPrecision })
    if (errors.length) throw invalid('invalid_player', { errors })
    if ('events' in input) assertEventsOffered(player, cfg.tournament)
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
    if (paymentsEnabled() && patch.events && patch.events.join() !== (before.events || []).join()) {
      patch.payment = feeChange(before.payment, feeFor(patch, cfg.settings))
    }
    // A coach changing who the player is, or what they enter, after approval
    // sends them back to the officer (PRD v1 §8): approval was for the old details.
    const identityChanged = REVERIFY_FIELDS.filter((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k]))
    const reverify = isCoach(actor) && APPROVED_STATES.includes(before.registrationStatus) && identityChanged.length > 0
    if (reverify) patch.registrationStatus = R.PENDING_VERIFICATION
    const after = await stores.players.update(id, patch)
    if (reverify) {
      await record(actor, { tournamentId, action: A.PLAYER_REVERIFY, entity: 'player', entityId: id, before: { registrationStatus: before.registrationStatus }, after: { registrationStatus: R.PENDING_VERIFICATION }, reason: `Coach changed ${identityChanged.join(', ')} after approval` })
      await notify(tournamentId, 'admin', 'reverify', `${after.name}: changed by the coach after approval (${identityChanged.join(', ')}); check again`)
    }
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
    const tournament = await writableTournament(tournamentId)
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
    const preview = validateBulkRows(parseCsv(csv), {
      fields: formFields(tournament),
      teams: isCoach(actor) ? teamRows.filter((t) => t.id === actor.teamId) : teamRows,
      existing,
      defaultTeamId: isCoach(actor) ? actor.teamId : teamId,
      defaultCountry: tournament.country || null,
      weightPrecision: settingsOf(tournament).weightPrecision,
    })
    // A row entering an event this tournament does not hold is an error here,
    // before anything is imported.
    const offered = tournamentEvents(tournament)
    const notHeld = preview.valid.filter((p) => (p.events || []).some((e) => !offered.includes(e)))
    if (notHeld.length) {
      const errors = notHeld.map((p) => ({ row: (preview.rows || []).find((r) => r.player === p || r.name === p.name)?.row ?? null, field: 'events', message: `${p.name}: ${(p.events || []).filter((e) => !offered.includes(e)).map((e) => (e === 'kata' ? 'Kata' : 'Kumite')).join(', ')} is not held in this tournament` }))
      return { ...preview, valid: preview.valid.filter((p) => !notHeld.includes(p)), errors: [...preview.errors, ...errors] }
    }
    return preview
  }

  /**
   * Imports only a clean file: a half-imported team is worse than none.
   * Possible duplicates must be confirmed (confirmDuplicates) after review.
   */
  async function importBulk(actor, tournamentId, csv, options = {}) {
    const preview = await previewBulk(actor, tournamentId, csv, options)
    if (preview.errors.length) throw invalid('bulk_has_errors', { errors: preview.errors })
    if (preview.warnings?.length && !options.confirmDuplicates && !settingsOf(await tournamentOf(tournamentId)).allowDuplicatePlayers) {
      throw rule('possible_duplicate', { warnings: preview.warnings })
    }
    const created = []
    for (const { duplicateOf, ...player } of preview.valid) {
      created.push(await createPlayer(actor, tournamentId, { ...player, confirmDuplicate: !!duplicateOf }, { skipNotify: true }))
    }
    await record(actor, { tournamentId, action: A.BULK_IMPORTED, entity: 'tournament', entityId: tournamentId, after: { count: created.length } })
    await notify(tournamentId, 'admin', 'bulk_upload_completed', `Bulk upload completed: ${created.length} players`)
    return { created: created.length, players: created }
  }

  // --- registration and verification ----------------------------------------

  async function setRegistrationStatus(actor, tournamentId, id, action, reason = null) {
    await writableTournament(tournamentId)
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
    if (!paymentsEnabled()) throw rule('payments_disabled')
    await writableTournament(tournamentId)
    const before = await inTournament('players', tournamentId, id)
    if (payment.status && !PAYMENT_STATUS.includes(payment.status)) throw invalid('invalid_payment_status')
    const next = { ...(before.payment || {}), ...payment, recordedBy: actor?.uid || null, recordedAt: iso() }
    // What was actually paid, so a later fee change can tell what is still owed.
    if (next.status === 'PAID') {
      next.paidAmount = payment.amount ?? next.amount ?? 0
      delete next.balanceDue
    }
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
    const cfg = await config(tournamentId, { write: true })
    if (cfg.tournament.entriesLocked) throw rule('entries_locked')
    // PRD v1 §10: once weigh-in closes, only a privileged override, with a reason.
    if (cfg.tournament.weighInClosed) {
      if (!actor || !can(actor.role, P.WEIGHIN_OVERRIDE)) throw rule('weighin_closed')
      if (!notes) throw invalid('reason_required')
    }
    const before = await inTournament('players', tournamentId, id)
    if (!(before.events || []).includes('kumite')) throw rule('not_a_kumite_player')
    if (!(Number(actualWeight) > 0)) throw invalid('invalid_actualWeight')
    const weight = Number(actualWeight)
    const precision = cfg.settings.weightPrecision
    if (precision != null && Math.abs(weight * 10 ** precision - Math.round(weight * 10 ** precision)) > 1e-6) throw invalid('invalid_weight_precision', { precision })

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
      // PRD v1 §10: the category the weight fits, and whether it matched the entry.
      eligibleWeightCategoryId: suggestion.weightCategory?.id || null,
      categoryMismatch: !stillFits,
      ...(cfg.tournament.weighInClosed ? { override: true } : {}),
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

  /** PRD v1 §10 step 7: weigh-in closes; after that only an override records. */
  async function setWeighInClosed(actor, tournamentId, closed, reason = null) {
    const tournament = await writableTournament(tournamentId)
    if (!!tournament.weighInClosed === !!closed) return tournament
    if (!closed && !reason) throw invalid('reason_required')
    const after = await stores.tournaments.update(tournamentId, { weighInClosed: !!closed, weighInClosedAt: closed ? iso() : null })
    await record(actor, { tournamentId, action: closed ? A.WEIGH_IN_CLOSED : A.WEIGH_IN_REOPENED, entity: 'tournament', entityId: tournamentId, reason })
    return after
  }

  /**
   * PRD v1 §9: what a new Master Age Date would change, before it changes:
   * every player whose age or category would move.
   */
  async function previewMasterDateChange(tournamentId, masterAgeDate) {
    const cfg = await config(tournamentId)
    const next = { ...cfg, tournament: { ...cfg.tournament, masterAgeDate }, masterAgeDate }
    const groupName = (id) => cfg.ageGroups.find((g) => g.id === id)?.name || '—'
    const changes = []
    for (const p of await stores.players.list({ tournamentId })) {
      const now = categorizeFields(p, cfg)
      const then = categorizeFields(p, next)
      const moved = Object.keys(then.entries).filter((e) => then.entries[e].divisionKey !== now.entries[e]?.divisionKey)
      if (now.age !== then.age || moved.length) {
        changes.push({
          playerId: p.id, name: p.name, playerNumber: p.playerNumber, status: p.registrationStatus,
          ageBefore: now.age, ageAfter: then.age,
          moves: moved.map((e) => ({ event: e, from: groupName(now.entries[e]?.ageGroupId), to: groupName(then.entries[e].ageGroupId), override: !!then.entries[e].override })),
        })
      }
    }
    return {
      masterAgeDate, current: cfg.masterAgeDate || null, players: (await stores.players.count({ tournamentId })),
      changes, approvedAffected: changes.filter((c) => DRAW_ELIGIBLE.has(c.status)).length,
      blocked: !!cfg.tournament.entriesLocked,
    }
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
    const cfg = await config(tournamentId, { write: true })
    // PRD v1 §28: controlled reassignment before lock; privileged override after.
    if (cfg.tournament.entriesLocked && !(actor && can(actor.role, P.CATEGORY_OVERRIDE))) throw rule('entries_locked')
    if (cfg.tournament.drawLocked) throw rule('draw_locked')
    if (!reason) throw invalid('reason_required')
    const before = await inTournament('players', tournamentId, id)
    if (!(before.events || []).includes(event)) throw invalid('invalid_event')
    // A drawn player is moved through the draw, not around it.
    if ((await stores.pools.list({ tournamentId })).some((pl) => pl.playerIds.includes(id) && pl.event === event)) throw rule('player_in_pool')
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
      divisionKey: resolved ? divisionKey(event, ageGroupId, weightCategoryId, groupDivision(before, cfg)) : null,
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
          const div = parseDivisionKey(entry.divisionKey).division ? player.division : null
          groups.set(entry.divisionKey, {
            key: entry.divisionKey, event, ageGroupId: entry.ageGroupId, weightCategoryId: entry.weightCategoryId || null,
            label: [categoryLabel({ ageGroup, weightCategory: weightCategory && { name: weightCategory.label || weightCategory.name } }, event), div].filter(Boolean).join(' / '),
            gender: ageGroup?.gender || null,
            division: div,
            playerIds: [],
            unweighed: [],
          })
        }
        const group = groups.get(entry.divisionKey)
        group.playerIds.push(player.id)
        // PRD v1 §10: kumite without a passed weigh-in waits outside the draw.
        if (event === EVENTS.KUMITE && (player.weighIn?.status || 'PENDING') !== 'PASSED' && !player.weighInException) group.unweighed.push(player.id)
      }
    }
    return [...groups.values()].map((d) => ({
      ...d,
      count: d.playerIds.length,
      pools: pools.filter((p) => p.divisionKey === d.key && p.stage !== 'master').length,
      singleEntry: d.playerIds.length === 1,
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

  /**
   * PRD v1 §28 "Pool regeneration: show impact and block when finalized
   * results would be invalidated". What redrawing would throw away.
   */
  async function drawImpact(tournamentId, only = null) {
    const cfg = await config(tournamentId)
    const all = (await divisions(tournamentId)).filter((d) => !isPanelKata(d, cfg.settings))
    const targets = only ? all.filter((d) => d.key === only) : all
    const categories = await stores.categories.list({ tournamentId })
    const out = []
    for (const d of targets) {
      const pools = (await stores.pools.list({ tournamentId, divisionKey: d.key })).length
      const category = categories.find((c) => c.divisionKey === d.key)
      const bouts = category ? await stores.matches.list({ categoryId: category.id }) : []
      const played = bouts.filter((m) => boutOutcome(m)).length
      out.push({ key: d.key, label: d.label, pools, matches: bouts.length, played, blocked: played > 0 })
    }
    return {
      divisions: out,
      pools: out.reduce((n, d) => n + d.pools, 0),
      matches: out.reduce((n, d) => n + d.matches, 0),
      played: out.reduce((n, d) => n + d.played, 0),
      blocked: out.some((d) => d.blocked),
      regenerates: out.some((d) => d.pools > 0),
    }
  }

  /**
   * Sections 22-23, PRD v1 §12. Regenerating replaces the division's pools
   * wholesale, needs confirming and the draw-regeneration privilege, and is
   * refused once results exist.
   */
  async function generatePools(actor, tournamentId, { divisionKey: only = null, method = null, poolSize = null, seed = null, confirm = false } = {}) {
    const tournament = await writableTournament(tournamentId)
    if (!tournament.entriesLocked) throw rule('entries_not_locked')
    if (tournament.drawLocked) throw rule('draw_locked')
    const cfg = await config(tournamentId)
    const drawMethod = method || cfg.settings.drawMethod || DRAW_METHODS.RANDOM
    if (!Object.values(DRAW_METHODS).includes(drawMethod)) throw invalid('invalid_method')
    if (drawMethod === DRAW_METHODS.SEEDED && cfg.settings.allowSeeding === false) throw rule('seeding_disabled')
    const all = (await divisions(tournamentId)).filter((d) => !isPanelKata(d, cfg.settings))
    const targets = only ? all.filter((d) => d.key === only) : all
    if (only && !targets.length) throw missing('division_not_found')
    const impact = await drawImpact(tournamentId, only)
    if (impact.regenerates) {
      if (impact.blocked) throw rule('matches_already_played', { impact })
      if (actor && !can(actor.role, P.DRAW_REGENERATE)) throw denied('regenerate_forbidden')
      if (!confirm) throw rule('regeneration_requires_confirmation', { impact })
    }
    const players = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    const drawSeed = seed ?? Math.floor(now().getTime() % 2147483647)
    const random = seededRandom(drawSeed)
    const created = []
    const excluded = []
    const singles = []

    let size = null
    for (const division of targets) {
      await clearBridge(tournamentId, division.key)
      await stores.pools.removeWhere({ tournamentId, divisionKey: division.key })
      const ds = divisionSettingsFor(cfg, division)
      // PRD v1 §10: kumite without verified weight stays out unless excepted.
      const waiting = new Set(cfg.settings.requireWeighInForDraw === false ? [] : division.unweighed || [])
      const eligible = division.playerIds.filter((id) => !waiting.has(id))
      waiting.forEach((id) => excluded.push({ playerId: id, name: players.get(id)?.name, division: division.label }))
      // PRD v1 §12/§28: one player is not a pool; the single-entry policy decides.
      if (eligible.length < 2) {
        if (eligible.length === 1) singles.push({ key: division.key, label: division.label, playerId: eligible[0] })
        continue
      }
      size = poolSize || ds.poolSize
      // A knockout category is drawn as one list; the bracket is cut from it.
      const knockout = ds.poolSystem === 'knockout'
      const mode = knockout ? 'max' : (cfg.settings.allowUnevenPools === false ? 'equal' : ds.poolMode)
      const drawn = drawPools(eligible.map((id) => players.get(id)), {
        poolSize: knockout ? eligible.length || 1 : size, poolMode: mode,
        method: drawMethod, random, teamOf: (p) => p.teamId, seedOf: (p) => (cfg.settings.allowSeeding === false ? null : p.seed),
      })
      const uneven = isUneven(drawn.map((pl) => pl.players.length))
      for (const pool of drawn) {
        created.push(await stores.pools.insert({
          tournamentId, divisionKey: division.key, event: division.event, ageGroupId: division.ageGroupId,
          weightCategoryId: division.weightCategoryId, label: division.label, name: pool.name,
          playerIds: pool.players.map((p) => p.id), method: drawMethod, drawSeed, poolSize: size, poolSystem: knockout ? 'knockout' : 'round_robin', generatedAt: iso(),
          ...(uneven && cfg.settings.allowUnevenPools === false ? { unevenWarning: true } : {}),
        }))
      }
      for (const id of eligible) {
        const p = players.get(id)
        const next = walkRegistration(p.registrationStatus, [R.CATEGORY_CONFIRMED, R.DRAW_ASSIGNED])
        if (next !== p.registrationStatus) {
          await stores.players.update(id, { registrationStatus: next })
          p.registrationStatus = next
        }
      }
    }
    await record(actor, { tournamentId, action: A.POOLS_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisions: targets.map((d) => d.key), method: drawMethod, poolSize: size, drawSeed, excludedUnweighed: excluded.length, singleEntries: singles.length }, reason: impact.regenerates ? 'Regenerated after confirmation' : null })
    if ([T.VERIFICATION, T.WEIGH_IN, T.ENTRIES_LOCKED].includes(lifecycleOf(tournament))) {
      await stores.tournaments.update(tournamentId, { lifecycleStatus: T.DRAW_GENERATED })
      await record(actor, { tournamentId, action: A.TOURNAMENT_STATUS_CHANGED, entity: 'tournament', entityId: tournamentId, before: { lifecycleStatus: lifecycleOf(tournament) }, after: { lifecycleStatus: T.DRAW_GENERATED }, reason: 'Pools generated' })
    }
    // The drawn pools, with what stayed out of the draw and why.
    return Object.assign(created, { excluded, singles })
  }

  /** Section 23, manual assignment: always logged, never once the draw is locked. */
  async function movePlayer(actor, tournamentId, { playerId, fromPoolId, toPoolId, reason = null, force = false }) {
    const tournament = await writableTournament(tournamentId)
    if (tournament.drawLocked) throw rule('draw_locked')
    const from = await inTournament('pools', tournamentId, fromPoolId)
    const to = await inTournament('pools', tournamentId, toPoolId)
    if (from.divisionKey !== to.divisionKey) throw rule('different_division')
    if (!from.playerIds.includes(playerId)) throw invalid('player_not_in_pool')
    if (to.playerIds.includes(playerId)) throw invalid('already_in_pool')
    // PRD v1 §21 "Pool max respected": over the maximum only on purpose, with a reason.
    const max = to.poolSize || settingsOf(tournament).poolSize
    if (to.playerIds.length >= max && !(force && reason)) throw rule('pool_full', { max })
    await assertNoBoutsPlayed(tournamentId, from.divisionKey)
    await clearBridge(tournamentId, from.divisionKey)
    await stores.pools.update(from.id, { playerIds: from.playerIds.filter((id) => id !== playerId) })
    await stores.pools.update(to.id, { playerIds: [...to.playerIds, playerId] })
    await record(actor, { tournamentId, action: A.PLAYER_MOVED_POOL, entity: 'player', entityId: playerId, before: { pool: from.name }, after: { pool: to.name }, reason })
    return listPools(tournamentId, from.divisionKey)
  }

  /** PRD v1 §12 explicit qualification: the admin names a pool's qualifiers. */
  async function setQualifiers(actor, tournamentId, poolId, playerIds, reason = null) {
    await writableTournament(tournamentId)
    const pool = await inTournament('pools', tournamentId, poolId)
    if (!Array.isArray(playerIds) || playerIds.some((id) => !pool.playerIds.includes(id))) throw invalid('invalid_playerIds')
    const after = await stores.pools.update(poolId, { qualifiers: [...new Set(playerIds)] })
    await record(actor, { tournamentId, action: A.QUALIFIERS_SET, entity: 'pool', entityId: poolId, before: { qualifiers: pool.qualifiers || [] }, after: { qualifiers: after.qualifiers }, reason })
    return after
  }

  /**
   * PRD v1 §28 "One player in a category": award the medal, or record that
   * there is no competition. (Moving the player is a category override.)
   */
  async function decideSingleEntry(actor, tournamentId, key, decision, reason = null) {
    const division = (await divisions(tournamentId)).find((d) => d.key === key)
    if (!division) throw missing('division_not_found')
    if (division.playerIds.length !== 1) throw rule('not_single_entry')
    if (!['award', 'no_competition'].includes(decision)) throw invalid('invalid_decision')
    const why = reason || (decision === 'award' ? 'Single entry: medal awarded' : 'Single entry: no competition')
    await overrideMedals(actor, tournamentId, key, decision === 'award' ? [{ playerId: division.playerIds[0], medal: 'gold' }] : [], why)
    await record(actor, { tournamentId, action: A.SINGLE_ENTRY_DECIDED, entity: 'division', entityId: key, after: { decision }, reason: why })
    return { decision }
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
      rules: (({ matchDurationSec, pointGap, points, ruleset, poolSystem, senshu, overtime, extraTimeSec, penaltyCategories, penaltyLadder }) => ({ matchDurationSec, pointGap, points, ruleset, poolSystem, senshu, overtime, extraTimeSec, penaltyCategories, penaltyLadder }))(divisionSettingsOf(tournament, ageGroup, weightCategory)),
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
    const cfg = await config(tournamentId, { write: true })
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
          const order = settings.allowSeeding === false ? [...pool.playerIds] : [...pool.playerIds].sort((a, b) => (Number(players.get(a).seed) || 999) - (Number(players.get(b).seed) || 999))
          assertByesAllowed(order.length, settings)
          await stores.brackets.removeWhere({ tournamentId, divisionKey: division.key })
          await stores.brackets.insert({
            tournamentId, divisionKey: division.key, categoryId: category.id, knockoutOnly: true, thirdPlace: !!settings.thirdPlaceMatch,
            entries: order.map((playerId) => ({ id: competitorOf.get(playerId), playerId, pool: pool.name, place: null })),
          })
          await stores.pools.update(pool.id, { categoryId: category.id })
          const before = (await stores.matches.list({ categoryId: category.id })).length
          await syncBracket(tournamentId, division.key)
          created += (await stores.matches.list({ categoryId: category.id })).length - before
          number = await nextMatchNumber(tournamentId)
          continue
        }
        // PRD v1 §12: two players are a direct final.
        const directFinal = pool.playerIds.length === 2 && pools.filter((p) => p.divisionKey === division.key).length === 1
        for (const bout of roundRobin(pool.playerIds)) {
          await stores.matches.insert({
            categoryId: category.id, tournamentId, poolId: pool.id, stage: 'pool', round: bout.round, ...(directFinal ? { roundName: 'Final' } : {}),
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
      // PRD point 20: an official sees the bouts they are on.
      .filter((m) => !filter.officialId || m.refereeId === filter.officialId || (m.judgeIds || []).includes(filter.officialId))
      .sort((a, b) => num(a) - num(b))
  }

  const findBridgedMatch = async (tournamentId, matchId) => {
    const match = await load('matches', matchId)
    const category = await load('categories', match.categoryId)
    if (category.tournamentId !== tournamentId) throw missing()
    return { match, category }
  }

  const RESULT_METHOD = { WALKOVER: 'walkover', DISQUALIFIED: 'shikkaku', NO_SHOW: 'no_show', KIKEN: 'kiken', MANUAL_OVERRIDE: 'manual_override', COMPLETED: 'manual' }

  /**
   * Rule 6 / PRD v1 §13, §16: a finished result changes only with a reason
   * and the score-correction privilege, leaves a record and a correction
   * event, and recalculates what depends on it. Exceptional endings
   * (walkover, disqualification, no-show, withdrawal, manual override) need
   * a finish reason; a manual override needs the result-override privilege.
   */
  async function correctResult(actor, tournamentId, matchId, { winner, avgRed, avgBlue, resultType = 'COMPLETED', finishReason = null }, reason) {
    await writableTournament(tournamentId)
    const { match, category } = await findBridgedMatch(tournamentId, matchId)
    const finished = boutOutcome(match) || match.status === 'cancelled'
    if (finished && !reason) throw invalid('correction_reason_required')
    if (finished && actor && !can(actor.role, P.SCORE_CORRECT)) throw denied('score_correction_forbidden')
    if (!RESULT_TYPES.includes(resultType)) throw invalid('invalid_resultType')
    if (EXCEPTIONAL_RESULTS.includes(resultType) && resultType !== 'CANCELLED' && !(finishReason || reason)) throw invalid('finish_reason_required')
    if (resultType === 'MANUAL_OVERRIDE' && actor && !can(actor.role, P.RESULT_OVERRIDE)) throw denied('result_override_forbidden')
    await assertResultEditable(actor, tournamentId, category.divisionKey, reason)
    // Section 27: a cancelled bout has no winner and counts for nobody; a
    // walkover or disqualification is a finished bout with a winner.
    const why = finishReason || (resultType !== 'COMPLETED' ? reason : null)
    const patch = resultType === 'CANCELLED'
      ? { winner: null, status: 'cancelled', result: { type: 'CANCELLED', method: 'cancelled', finishReason: why } }
      : { winner, status: 'completed', avgRed: avgRed ?? match.avgRed ?? 0, avgBlue: avgBlue ?? match.avgBlue ?? 0, result: { type: resultType, method: RESULT_METHOD[resultType] || 'manual', finishReason: why } }
    if (resultType !== 'CANCELLED' && !['red', 'blue', 'tie'].includes(winner)) throw invalid('invalid_winner')
    if (resultType !== 'CANCELLED' && resultType !== 'COMPLETED' && winner === 'tie') throw invalid('invalid_winner')
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.MATCH_RESULT_CHANGED, entity: 'match', entityId: matchId, before: { winner: match.winner, avgRed: match.avgRed, avgBlue: match.avgBlue, status: match.status, resultType: match.result?.type || null }, after: { ...patch, resultType }, reason })
    // PRD v1 §13 score events: an official correction is part of the bout's history.
    await stores.matchEvents.insert({
      tournamentId, matchId, seq: Date.now(), cmd: finished ? 'OFFICIAL_CORRECTION' : 'RESULT_ENTERED', payload: { resultType, winner: patch.winner, reason: reason || why || null },
      by: actor?.uid || null, byEmail: actor?.email || null, role: actor?.role || null,
      scoreBefore: { aka: match.avgRed ?? 0, ao: match.avgBlue ?? 0 }, scoreAfter: { aka: patch.avgRed ?? 0, ao: patch.avgBlue ?? 0 }, at: iso(),
    })
    if (match.stage === 'knockout' || match.stage === 'pool') await syncBracket(tournamentId, category.divisionKey)
    return after
  }

  /**
   * PRD v1 §13: Scheduled → Called → Ready → Live → Paused → Live → Completed.
   * Officials move a bout along; finishing goes through the result.
   */
  async function setMatchStatus(actor, tournamentId, matchId, to, reason = null) {
    await writableTournament(tournamentId)
    const { match } = await findBridgedMatch(tournamentId, matchId)
    const from = match.status || 'scheduled'
    if (from === to) return match
    if (['completed', 'cancelled'].includes(to)) throw rule('use_result_entry')
    if (!matchLifecycle.can(from, to)) throw rule('invalid_transition', { from, to })
    if (from === 'completed' && !reason) throw invalid('reason_required')
    const after = await stores.matches.update(matchId, { status: to, [`${to}At`]: iso() })
    await record(actor, { tournamentId, action: A.MATCH_STATUS_CHANGED, entity: 'match', entityId: matchId, before: { status: from }, after: { status: to }, reason })
    return after
  }

  /**
   * PRD v1 §4 announcer: "mark attendance if enabled". Both present makes
   * the bout Ready; an absent player is a no-show for the referee to record.
   */
  async function markAttendance(actor, tournamentId, matchId, side, present) {
    const tournament = await writableTournament(tournamentId)
    if (settingsOf(tournament).attendanceEnabled === false) throw rule('attendance_disabled')
    if (!['aka', 'ao'].includes(side)) throw invalid('invalid_side')
    const { match } = await findBridgedMatch(tournamentId, matchId)
    if (boutOutcome(match) || match.status === 'cancelled') throw rule('match_finished')
    const attendance = { ...(match.attendance || {}), [side]: present === null ? null : present ? 'present' : 'absent', [`${side}At`]: iso() }
    const patch = { attendance }
    if (attendance.aka === 'present' && attendance.ao === 'present' && ['scheduled', 'called'].includes(match.status || 'scheduled')) patch.status = 'ready'
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.ATTENDANCE_MARKED, entity: 'match', entityId: matchId, after: { [side]: attendance[side], ...(patch.status ? { status: patch.status } : {}) } })
    return after
  }

  /**
   * PRD v1 §28 "Withdrawal after draw: preserve history". The player is
   * marked withdrawn; every bout they still had is completed as a withdrawal
   * (kiken) for their opponent; bouts already fought stand.
   */
  async function withdrawPlayer(actor, tournamentId, playerId, reason) {
    await writableTournament(tournamentId)
    if (!reason) throw invalid('reason_required')
    const player = await inTournament('players', tournamentId, playerId)
    if (player.registrationStatus === R.WITHDRAWN) return player
    const affected = []
    for (const m of await listMatches(tournamentId)) {
      if (boutOutcome(m) || m.status === 'cancelled') continue
      const side = m.akaPlayerId === playerId ? 'aka' : m.aoPlayerId === playerId ? 'ao' : null
      if (!side) continue
      if (!m.redId || !m.blueId) continue
      await stores.matches.update(m.id, { status: 'completed', winner: side === 'aka' ? 'blue' : 'red', avgRed: m.avgRed ?? 0, avgBlue: m.avgBlue ?? 0, result: { type: 'KIKEN', method: 'kiken', finishReason: `${player.name} withdrew: ${reason}` } })
      affected.push(m.matchNumber)
    }
    // A kata performer not yet scored leaves the open round.
    for (const round of await stores.kataRounds.list({ tournamentId })) {
      if (round.status === 'completed' || !round.performerIds.includes(playerId)) continue
      if ((await stores.kataScores.list({ roundId: round.id, playerId })).length) continue
      await stores.kataRounds.update(round.id, { performerIds: round.performerIds.filter((id) => id !== playerId) })
    }
    const after = await stores.players.update(playerId, { registrationStatus: R.WITHDRAWN, withdrawnAt: iso(), withdrawalReason: reason, statusBeforeWithdrawal: player.registrationStatus })
    await record(actor, { tournamentId, action: A.PLAYER_WITHDRAWN, entity: 'player', entityId: playerId, before: { registrationStatus: player.registrationStatus }, after: { registrationStatus: R.WITHDRAWN, boutsWalkedOver: affected }, reason })
    for (const key of new Set(Object.values(player.entries || {}).map((e) => e.divisionKey).filter(Boolean))) await syncBracket(tournamentId, key)
    await notify(tournamentId, 'admin', 'player_withdrawn', `${player.name} withdrew (${affected.length} bout(s) walked over): ${reason}`)
    return after
  }

  // --- live state (PRD v1 §28 "Interrupted match: preserve state and resume")

  const saveLiveState = (matchId, snapshot) => {
    // Who held the mat is kept too, so offline scoring knows after a restart
    // whether someone else took over meanwhile.
    const doc = {
      seq: snapshot.seq, state: snapshot.state, history: snapshot.history || [], savedAt: iso(),
      handoffs: snapshot.handoffs || 0, controllerUid: snapshot.controllerUid || null, lastAt: snapshot.lastAt || 0,
    }
    return stores.liveStates.get(matchId).then((row) => (row ? stores.liveStates.update(matchId, doc) : stores.liveStates.insert({ id: matchId, ...doc })))
  }
  const loadLiveState = (matchId) => stores.liveStates.get(matchId)

  /**
   * PRD v1 §21 "Critical: score sent to completed match → block and audit".
   * Null when the bout may take live commands, otherwise the reason it may not.
   */
  async function liveCommandBlock(matchId) {
    const match = await stores.matches.get(matchId)
    if (!match) return null
    if (boutOutcome(match) || match.status === 'cancelled') return 'match_completed'
    // A completed or archived tournament takes no more scoring.
    const category = match.categoryId ? await stores.categories.get(match.categoryId) : null
    const tournament = category?.tournamentId ? await stores.tournaments.get(category.tournamentId) : null
    if ([T.COMPLETED, T.ARCHIVED].includes(lifecycleOf(tournament))) return 'tournament_closed'
    return null
  }

  async function recordBlockedCommand(actor, matchId, cmd, why) {
    const match = await stores.matches.get(matchId)
    const category = match?.categoryId ? await stores.categories.get(match.categoryId) : null
    const tournamentId = category?.tournamentId || null
    if (!tournamentId) return
    await record(actor, { tournamentId, action: A.SCORE_BLOCKED, entity: 'match', entityId: matchId, after: { cmd, blocked: why }, reason: `${cmd} refused: ${why === 'tournament_closed' ? 'the tournament is closed' : `bout ${match.matchNumber || ''} is already decided`}` })
  }

  /**
   * The announcer calls a bout to its mat (PRD point 20): the hall screen
   * and the mat's referee see it called, and the call is recorded.
   */
  async function callMatch(actor, tournamentId, matchId, { mat = null } = {}) {
    await writableTournament(tournamentId)
    const { match, category } = await findBridgedMatch(tournamentId, matchId)
    if (boutOutcome(match) || match.status === 'cancelled') throw rule('match_finished')
    const patch = { calledAt: iso(), calledBy: actor?.uid || null, calls: (match.calls || 0) + 1 }
    if (mat != null) patch.mat = mat
    if ((match.status || 'scheduled') === 'scheduled') patch.status = 'called'
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.MATCH_CALLED, entity: 'match', entityId: matchId, after: { mat: after.mat ?? null, call: patch.calls } })
    // PRD v1 §20 "Match call" notification, to both players' teams.
    const competitors = new Map((await stores.competitors.list({ categoryId: category.id })).map((c) => [c.id, c]))
    for (const id of [after.redId, after.blueId]) {
      const c = competitors.get(id)
      if (c?.teamId) await notify(tournamentId, 'team', 'match_call', `${after.matchNumber}: ${c.name} to mat ${after.mat || 1} now (${category.name})`, { teamId: c.teamId })
    }
    return after
  }

  /** PRD point 15: put the players in the other corners, before the bout is fought. */
  async function swapCorners(actor, tournamentId, matchId, reason = null) {
    const { match } = await findBridgedMatch(tournamentId, matchId)
    if (boutOutcome(match) || match.status === 'cancelled') throw rule('match_finished')
    if (['live', 'open', 'paused'].includes(match.status)) throw rule('match_in_progress')
    const patch = { redId: match.blueId, blueId: match.redId, akaPlayerId: match.aoPlayerId ?? null, aoPlayerId: match.akaPlayerId ?? null }
    const after = await stores.matches.update(matchId, patch)
    await record(actor, { tournamentId, action: A.MATCH_SCHEDULED, entity: 'match', entityId: matchId, before: { redId: match.redId, blueId: match.blueId }, after: { redId: patch.redId, blueId: patch.blueId }, reason: reason || 'Corners swapped' })
    return after
  }

  // --- live scoring log (PRD point 33) ----------------------------------------

  const QUIET_COMMANDS = new Set(['FIELD_NUMBER', 'SCOREBOARD', 'CLOCK_ADJUST', 'RULES'])
  const scoreText = (st) => `AKA ${st?.match?.scores?.aka ?? 0} – AO ${st?.match?.scores?.ao ?? 0}`
  const penaltyTotal = (st, side) => Object.values(st?.match?.penalties?.[side] || {}).reduce((a, b) => a + b, 0)

  /**
   * Every command a referee sends to a live bout, kept as the bout's event
   * log. A score that goes down (an undo, a deduction) or a penalty taken
   * back is a correction, and also goes in the tournament's audit log:
   * "Referee changed score AKA 2 → 3".
   */
  async function recordLiveEvent(actor, matchId, { seq, cmd, payload = null, before, after, at = null }) {
    if (QUIET_COMMANDS.has(cmd)) return null
    const match = await stores.matches.get(matchId)
    if (!match) return null
    const category = match.categoryId ? await stores.categories.get(match.categoryId) : null
    const tournamentId = category?.tournamentId || match.tournamentId || null
    const row = await stores.matchEvents.insert({
      tournamentId, matchId, seq, cmd, payload: payload && typeof payload === 'object' ? payload : null,
      by: actor?.uid || null, byEmail: actor?.email || null, role: actor?.role || null,
      scoreBefore: before?.match?.scores || null, scoreAfter: after?.match?.scores || null,
      at: at ? new Date(at).toISOString() : iso(),
    })
    // PRD v1 §13: the clock moves the bout between Live and Paused.
    if (!boutOutcome(match) && match.status !== 'cancelled') {
      if (cmd === 'CLOCK_START' && match.status !== 'live') await stores.matches.update(matchId, { status: 'live', liveAt: match.liveAt || iso() })
      if (['CLOCK_STOP', 'TIMEOUT'].includes(cmd) && match.status === 'live') await stores.matches.update(matchId, { status: 'paused' })
    }
    const lowered = ['ao', 'aka'].some((side) => (after?.match?.scores?.[side] ?? 0) < (before?.match?.scores?.[side] ?? 0)
      || penaltyTotal(after, side) < penaltyTotal(before, side))
    if (tournamentId && (lowered || cmd === 'UNDO' || cmd === 'CLEAR_DECISION')) {
      await record(actor, {
        tournamentId, action: A.LIVE_SCORE_CORRECTED, entity: 'match', entityId: matchId,
        before: { score: scoreText(before) }, after: { score: scoreText(after) },
        reason: `${cmd === 'UNDO' ? 'Undo' : cmd === 'CLEAR_DECISION' ? 'Decision cleared' : cmd} during bout ${match.matchNumber || ''}`.trim(),
      })
    }
    return row
  }

  async function liveEvents(tournamentId, matchId) {
    return (await stores.matchEvents.list({ tournamentId, matchId })).sort((a, b) => a.seq - b.seq)
  }

  // --- kata panel (PRD point 19, sections 32-33) -----------------------------

  const KATA_MIN_DEFAULT = 5
  const KATA_MAX_DEFAULT = 10

  const kataRoundsOf = async (tournamentId, key = null) =>
    (await stores.kataRounds.list(key ? { tournamentId, divisionKey: key } : { tournamentId }))
      .sort((a, b) => String(a.divisionKey).localeCompare(String(b.divisionKey)) || a.round - b.round)

  /** Kata categories judged by a panel, with their rounds so far. */
  async function kataDivisions(tournamentId, { judgeUid = null } = {}) {
    const cfg = await config(tournamentId)
    const rounds = await kataRoundsOf(tournamentId)
    const mine = (r) => !judgeUid || !Object.keys(r.judgeAssignments || {}).length || Object.values(r.judgeAssignments).includes(judgeUid)
    return (await divisions(tournamentId)).filter((d) => isPanelKata(d, cfg.settings)).map((d) => {
      const ds = divisionSettingsFor(cfg, d)
      return {
        ...d, judges: ds.kataJudges, method: ds.kataMethod, qualifiers: ds.kataQualifiers, plannedRounds: ds.kataRounds,
        components: !!ds.kataComponents, minScore: ds.kataMinScore, maxScore: ds.kataMaxScore, precision: ds.kataPrecision,
        rounds: rounds.filter((r) => r.divisionKey === d.key && mine(r)).map(({ id, round, name, status, performerIds, judgeAssignments }) => ({
          id, round, name, status, performers: performerIds.length, judgeAssignments: judgeAssignments || {},
          mySeat: judgeUid ? Number(Object.entries(judgeAssignments || {}).find(([, uid]) => uid === judgeUid)?.[0]) || null : null,
        })),
      }
    }).filter((d) => !judgeUid || d.rounds.length)
  }

  /** The scores sheet of a round: every performer, every judge, final and rank. */
  async function kataRoundView(tournamentId, roundId) {
    const round = await inTournament('kataRounds', tournamentId, roundId)
    const scores = await stores.kataScores.list({ roundId })
    const players = new Map((await stores.players.list({ tournamentId })).map((p) => [p.id, p]))
    const teams = new Map((await stores.teams.list({ tournamentId })).map((t) => [t.id, t]))
    const penalties = round.penalties || {}
    const rows = round.performerIds.map((playerId, order) => {
      const bySeat = {}
      const components = {}
      let technicalTotal = 0
      for (const s of scores.filter((x) => x.playerId === playerId)) {
        bySeat[s.seat] = s.score
        if (s.technical != null) {
          components[s.seat] = { technical: s.technical, athletic: s.athletic }
          technicalTotal += s.technical
        }
      }
      const list = Object.values(bySeat)
      const p = players.get(playerId)
      const penalty = Number(penalties[playerId]?.deduction || 0)
      return {
        playerId, order: order + 1, name: p?.name || '?', club: p?.club || teams.get(p?.teamId)?.name || null,
        team: teams.get(p?.teamId)?.name || null, state: p?.state || null, bySeat, scores: list,
        ...(Object.keys(components).length ? { components, technicalTotal: Math.round(technicalTotal * 100) / 100 } : {}),
        penalty: penalty || 0, penaltyReason: penalties[playerId]?.reason || null,
        final: kataFinal(list, round.judges, round.method, penalty),
      }
    })
    return { ...round, rows: rankKata(rows, round.tieBreak || 'total_then_best') }
  }

  /**
   * Opens the next round of a kata category (PRD v1 §14 steps 1-3). Round
   * one is everyone, in a drawn order; later rounds take the top qualifiers
   * of the round before. Judges are assigned to seats; the round is then
   * started (step 4) before anyone can score.
   */
  async function createKataRound(actor, tournamentId, key, { seed = null, judges: assignments = null, start = false } = {}) {
    const cfg = await config(tournamentId, { write: true })
    if (!cfg.tournament.entriesLocked) throw rule('entries_not_locked')
    const division = (await divisions(tournamentId)).find((d) => d.key === key && isPanelKata(d, cfg.settings))
    if (!division) throw missing('division_not_found')
    const ds = divisionSettingsFor(cfg, division)
    const existing = await kataRoundsOf(tournamentId, key)
    const last = existing[existing.length - 1]
    if (last && last.status !== 'completed') throw rule('round_open')
    if (last?.name === 'Final') throw rule('final_done')
    const withdrawn = new Set((await stores.players.list({ tournamentId, registrationStatus: R.WITHDRAWN })).map((p) => p.id))
    let performerIds
    if (!last) {
      performerIds = shuffleWith(division.playerIds.filter((id) => !withdrawn.has(id)), seededRandom(seed ?? Math.floor(now().getTime() % 2147483647)))
    } else {
      const view = await kataRoundView(tournamentId, last.id)
      const ranked = view.rows.filter((r) => r.rank != null && !withdrawn.has(r.playerId))
      // Qualifiers perform in reverse order of their previous score.
      performerIds = ranked.slice(0, ds.kataQualifiers).reverse().map((r) => r.playerId)
    }
    const number = existing.length + 1
    const isFinal = number >= ds.kataRounds || performerIds.length <= Math.max(2, Math.min(ds.kataQualifiers, 4))
    const judgeAssignments = cleanAssignments(assignments, ds.kataJudges)
    const row = await stores.kataRounds.insert({
      tournamentId, divisionKey: key, label: division.label, round: number, name: isFinal ? 'Final' : `Round ${number}`,
      performerIds, judges: ds.kataJudges, method: ds.kataMethod, status: start ? 'open' : 'pending', createdAt: iso(), ...(start ? { openedAt: iso() } : {}),
      // The rules the round is scored under, kept with it (PRD v1 §14 "versioned ruleset").
      minScore: ds.kataMinScore, maxScore: ds.kataMaxScore, precision: ds.kataPrecision, components: !!ds.kataComponents,
      technicalWeight: ds.kataTechnicalWeight, tieBreak: ds.kataTieBreak, rulesetId: cfg.tournament.rulesetId || DEFAULT_RULESET_ID, rulesetVersion: cfg.tournament.rulesetVersion || 1,
      judgeAssignments,
    })
    await record(actor, { tournamentId, action: A.KATA_ROUND, entity: 'kata_round', entityId: row.id, after: { divisionKey: key, round: row.name, performers: performerIds.length, judges: Object.keys(judgeAssignments).length } })
    return row
  }

  const cleanAssignments = (assignments, seats) => {
    const out = {}
    for (const a of Array.isArray(assignments) ? assignments : []) {
      const seat = Number(a.seat)
      if (Number.isInteger(seat) && seat >= 1 && seat <= seats && a.uid) out[seat] = String(a.uid).slice(0, 80)
    }
    if (new Set(Object.values(out)).size !== Object.values(out).length) throw invalid('judge_on_two_seats')
    return out
  }

  /** PRD v1 §14 step 3: judges to seats. A seat that has scored keeps its judge. */
  async function assignKataJudges(actor, tournamentId, roundId, assignments) {
    await writableTournament(tournamentId)
    const round = await inTournament('kataRounds', tournamentId, roundId)
    if (round.status === 'completed') throw rule('round_closed')
    const next = cleanAssignments(assignments, round.judges)
    const scored = new Set((await stores.kataScores.list({ roundId })).map((x) => String(x.seat)))
    for (const seat of scored) {
      if ((round.judgeAssignments || {})[seat] && next[seat] !== round.judgeAssignments[seat]) throw rule('seat_already_scored', { seat: Number(seat) })
    }
    const after = await stores.kataRounds.update(roundId, { judgeAssignments: next })
    await record(actor, { tournamentId, action: A.KATA_JUDGES_ASSIGNED, entity: 'kata_round', entityId: roundId, before: { judges: round.judgeAssignments || {} }, after: { judges: next } })
    return after
  }

  /** PRD v1 §14 step 4: the round starts; judges can score from now. */
  async function startKataRound(actor, tournamentId, roundId) {
    await writableTournament(tournamentId)
    const round = await inTournament('kataRounds', tournamentId, roundId)
    if (round.status !== 'pending') throw rule('round_not_pending')
    const after = await stores.kataRounds.update(roundId, { status: 'open', openedAt: iso() })
    await record(actor, { tournamentId, action: A.KATA_ROUND_STARTED, entity: 'kata_round', entityId: roundId, after: { round: round.name } })
    return after
  }

  const kataScoreValue = (round, { score, technical, athletic }) => {
    const range = { min: round.minScore ?? KATA_MIN_DEFAULT, max: round.maxScore ?? KATA_MAX_DEFAULT, precision: round.precision ?? 1 }
    if (round.components) {
      const t = normalizeKataScore(technical, range)
      const a = normalizeKataScore(athletic, range)
      if (t == null || a == null) throw invalid('invalid_score', range)
      return { score: componentScore(t, a, round.technicalWeight ?? 0.7), technical: t, athletic: a }
    }
    const value = normalizeKataScore(score, range)
    if (value == null) throw invalid('invalid_score', range)
    return { score: value }
  }

  /**
   * A judge's score for one performer (PRD v1 §15 judge panel). A judge
   * scores only rounds they are assigned to, from their own seat, and only
   * while the round is open; an admin may type any seat from a paper sheet.
   * A repeated submission (same submissionId) changes nothing.
   */
  async function submitKataScore(actor, tournamentId, roundId, { playerId, score, technical = null, athletic = null, seat = null, submissionId = null }) {
    await writableTournament(tournamentId)
    const round = await inTournament('kataRounds', tournamentId, roundId)
    if (round.status === 'pending') throw rule('round_not_started')
    if (round.status !== 'open') throw rule('round_closed')
    if (!round.performerIds.includes(playerId)) throw invalid('invalid_playerId')
    const value = kataScoreValue(round, { score, technical, athletic })
    let judgeSeat
    if (actor?.role === 'judge') {
      const assigned = Object.entries(round.judgeAssignments || {})
      if (assigned.length) {
        const mine = assigned.find(([, uid]) => uid === actor.uid)
        if (!mine) throw denied('not_assigned_to_round')
        judgeSeat = Number(mine[0])
      } else judgeSeat = Number(actor.seat)
    } else judgeSeat = Number(seat)
    if (!Number.isInteger(judgeSeat) || judgeSeat < 1 || judgeSeat > round.judges) throw invalid('invalid_seat')
    if (submissionId) {
      const repeat = (await stores.kataScores.list({ roundId, submissionId: String(submissionId) }))[0]
      if (repeat) return repeat
    }
    const existing = (await stores.kataScores.list({ roundId, playerId, seat: judgeSeat }))[0]
    if (existing) {
      if (existing.score === value.score && existing.technical === (value.technical ?? existing.technical)) return existing
      const after = await stores.kataScores.update(existing.id, { ...value, judgeUid: actor?.uid || null, at: iso(), submissionId: submissionId ? String(submissionId) : null })
      await record(actor, { tournamentId, action: A.KATA_SCORE_CHANGED, entity: 'kata_round', entityId: roundId, before: { player: playerId, seat: judgeSeat, score: existing.score }, after: { player: playerId, seat: judgeSeat, score: value.score } })
      return after
    }
    return stores.kataScores.insert({ tournamentId, roundId, playerId, seat: judgeSeat, ...value, judgeUid: actor?.uid || null, at: iso(), submissionId: submissionId ? String(submissionId) : null })
  }

  /**
   * PRD v1 §4/§15: "finalized rounds require authorized override". A score
   * on a completed round changes only with the result-override privilege and
   * a reason; the ranking is recalculated.
   */
  async function overrideKataScore(actor, tournamentId, roundId, { playerId, seat, score, technical = null, athletic = null }, reason) {
    await writableTournament(tournamentId)
    if (!actor || !can(actor.role, P.RESULT_OVERRIDE)) throw denied('result_override_forbidden')
    if (!reason) throw invalid('reason_required')
    const round = await inTournament('kataRounds', tournamentId, roundId)
    if (round.status !== 'completed') throw rule('round_still_open')
    await assertNotLocked(tournamentId, round.divisionKey)
    if (!round.performerIds.includes(playerId)) throw invalid('invalid_playerId')
    const judgeSeat = Number(seat)
    if (!Number.isInteger(judgeSeat) || judgeSeat < 1 || judgeSeat > round.judges) throw invalid('invalid_seat')
    const value = kataScoreValue(round, { score, technical, athletic })
    const existing = (await stores.kataScores.list({ roundId, playerId, seat: judgeSeat }))[0]
    if (existing) await stores.kataScores.update(existing.id, { ...value, overriddenBy: actor.uid, overriddenAt: iso() })
    else await stores.kataScores.insert({ tournamentId, roundId, playerId, seat: judgeSeat, ...value, judgeUid: null, overriddenBy: actor.uid, at: iso() })
    await record(actor, { tournamentId, action: A.KATA_SCORE_OVERRIDDEN, entity: 'kata_round', entityId: roundId, before: { player: playerId, seat: judgeSeat, score: existing?.score ?? null }, after: { player: playerId, seat: judgeSeat, score: value.score }, reason })
    return kataRoundView(tournamentId, roundId)
  }

  /** PRD v1 §14 kata penalties: a deduction from a performer's final score. */
  async function setKataPenalty(actor, tournamentId, roundId, playerId, deduction, reason) {
    await writableTournament(tournamentId)
    const round = await inTournament('kataRounds', tournamentId, roundId)
    await assertNotLocked(tournamentId, round.divisionKey)
    if (!round.performerIds.includes(playerId)) throw invalid('invalid_playerId')
    const value = Number(deduction)
    if (!(value >= 0 && value <= 10)) throw invalid('invalid_deduction')
    if (round.status === 'completed' && (!actor || !can(actor.role, P.RESULT_OVERRIDE))) throw denied('result_override_forbidden')
    if (value > 0 && !reason) throw invalid('reason_required')
    const penalties = { ...(round.penalties || {}) }
    if (value > 0) penalties[playerId] = { deduction: value, reason }
    else delete penalties[playerId]
    await stores.kataRounds.update(roundId, { penalties })
    await record(actor, { tournamentId, action: A.KATA_PENALTY, entity: 'kata_round', entityId: roundId, after: { player: playerId, deduction: value }, reason })
    return kataRoundView(tournamentId, roundId)
  }

  async function completeKataRound(actor, tournamentId, roundId) {
    await writableTournament(tournamentId)
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
    const medals = view.rows.filter((r) => r.rank != null).map((r, i) => ({ id: r.playerId, rank: Math.min(r.rank, 3), medal: medalFor(r.rank, i), sourceMatchId: final.id, reason: `Place ${r.rank} in the kata final (${r.final?.toFixed(2)})${r.tieReason ? ` — ${r.tieReason}` : ''}` })).filter((m) => m.medal)
    return { rounds, medals }
  }

  // --- results and knockout --------------------------------------------------

  async function divisionPoolsWithStandings(tournamentId, key, settings) {
    const all = await listPools(tournamentId, key)
    const category = (await stores.categories.list({ tournamentId })).find((c) => c.divisionKey === key)
    const bouts = category ? await stores.matches.list({ categoryId: category.id }) : []
    const competitors = category ? await stores.competitors.list({ categoryId: category.id }) : []
    const playerOf = new Map(competitors.map((c) => [c.id, c.playerId]))
    const view = (pool, rules) => {
      const poolBouts = bouts.filter((b) => b.poolId === pool.id && b.stage !== 'knockout')
        .map((b) => ({ ...b, aka: playerOf.get(b.redId), ao: playerOf.get(b.blueId) }))
      return {
        pool: pool.name,
        poolId: pool.id,
        complete: poolComplete(poolBouts),
        bouts: poolBouts.length,
        qualifiersSet: Array.isArray(pool.qualifiers),
        standings: poolStandings(pool.playerIds, poolBouts, rules),
        ...(pool.sources ? { sources: pool.sources } : {}),
      }
    }
    const master = all.find((p) => p.stage === 'master')
    return {
      category,
      bouts,
      competitors,
      pools: all.filter((p) => p.stage !== 'master').map((pool) => view(pool, { ...settings, manualQualifiers: pool.qualifiers || [] })),
      masterPool: master ? view(master, { ...settings, qualificationMode: 'top_n', qualifiersPerPool: 0 }) : null,
    }
  }

  /** PRD v1 §6 "allow byes": a bracket that needs byes is refused when they are off. */
  const assertByesAllowed = (entries, settings) => {
    const pow2 = entries > 0 && (entries & (entries - 1)) === 0
    if (!pow2 && settings.allowByes === false) throw rule('byes_not_allowed', { entries })
  }

  /**
   * PRD v1 §12: pool qualifiers feed a knockout bracket or a round-robin
   * master pool, chosen by top-N, a points threshold or the admin.
   */
  async function generateBracket(actor, tournamentId, key) {
    const cfg = await config(tournamentId, { write: true })
    const division = (await divisions(tournamentId)).find((d) => d.key === key)
    const ds = division ? divisionSettingsFor(cfg, division) : cfg.settings
    const data = await divisionPoolsWithStandings(tournamentId, key, ds)
    if (!data.category) throw rule('matches_not_generated')
    if (data.pools.length < 2) throw rule('single_pool_no_bracket')
    if (!data.pools.every((p) => p.complete)) throw rule('pools_incomplete')
    if (data.bouts.some((b) => b.stage === 'knockout' || b.stage === 'master')) throw rule('bracket_exists')
    const mode = cfg.settings.qualificationMode || 'top_n'
    if (mode === 'manual' && data.pools.some((p) => !p.qualifiersSet)) throw rule('qualifiers_not_set')
    const seeds = qualifierSeeds(data.pools, ds.qualifiersPerPool, { byFlag: mode !== 'top_n' })
    if (seeds.length < 2) throw rule('not_enough_qualifiers')
    const competitorOfPlayer = new Map(data.competitors.map((c) => [c.playerId, c.id]))

    if (cfg.settings.finalStage === 'master_pool') {
      const pool = await stores.pools.insert({
        tournamentId, divisionKey: key, event: division?.event, ageGroupId: division?.ageGroupId, weightCategoryId: division?.weightCategoryId,
        label: division?.label, name: 'Final pool', stage: 'master', playerIds: seeds.map((x) => x.id), categoryId: data.category.id,
        sources: seeds.map((x) => ({ playerId: x.id, pool: x.pool, place: x.place })), generatedAt: iso(),
      })
      let number = await nextMatchNumber(tournamentId)
      const mat = data.bouts[0]?.mat || 1
      for (const bout of roundRobin(pool.playerIds)) {
        await stores.matches.insert({
          categoryId: data.category.id, tournamentId, poolId: pool.id, stage: 'master', round: bout.round, roundName: 'Final pool',
          redId: competitorOfPlayer.get(bout.aka), blueId: competitorOfPlayer.get(bout.ao), akaPlayerId: bout.aka, aoPlayerId: bout.ao,
          matchNumber: `M-${pad(number)}`, mat, status: 'scheduled', winner: null,
        })
        number += 1
      }
      await record(actor, { tournamentId, action: A.BRACKET_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisionKey: key, qualifiers: seeds.length, finalStage: 'master_pool', qualification: mode } })
      return { masterPool: pool, rounds: [] }
    }

    assertByesAllowed(seeds.length, cfg.settings)
    await stores.brackets.removeWhere({ tournamentId, divisionKey: key })
    await stores.brackets.insert({
      tournamentId, divisionKey: key, categoryId: data.category.id, thirdPlace: !!cfg.settings.thirdPlaceMatch,
      entries: seeds.map((x) => ({ id: competitorOfPlayer.get(x.id), playerId: x.id, pool: x.pool, place: x.place })),
    })
    await record(actor, { tournamentId, action: A.BRACKET_GENERATED, entity: 'tournament', entityId: tournamentId, after: { divisionKey: key, qualifiers: seeds.length, qualification: mode, thirdPlace: !!cfg.settings.thirdPlaceMatch } })
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
    const skeleton = buildBracket(bracket.entries, bracket.layout || null)
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

    // PRD v1 §6 third-place match: the two semi-final losers meet for bronze.
    if (bracket.thirdPlace && skeleton.length) {
      const top = Math.max(...skeleton.map((x) => x.round))
      const semis = [...merged.values()].filter((m) => m.round === top - 1).sort((a, b) => a.slot - b.slot)
      if (top >= 2 && semis.length === 2) {
        const loserOf = (m) => {
          const o = boutOutcome(m)
          if (!o || o.winner === 'draw' || !m.aka || !m.ao) return null
          return o.winner === 'aka' ? m.ao : m.aka
        }
        const key3 = `R${top}-3P`
        const aka = loserOf(semis[0])
        const ao = loserOf(semis[1])
        const slot = { key: key3, round: top, slot: 2, name: 'Third Place', thirdPlace: true }
        const existing = stored.get(key3)
        if (existing) {
          if (!boutOutcome(existing) && (existing.redId !== aka || existing.blueId !== ao)) await stores.matches.update(existing.id, { redId: aka, blueId: ao })
          merged.set(key3, { ...existing, ...slot, aka: boutOutcome(existing) ? existing.redId : aka, ao: boutOutcome(existing) ? existing.blueId : ao, status: existing.status, winner: existing.winner })
        } else if (aka && ao) {
          if (number == null) number = await nextMatchNumber(tournamentId)
          const row = await stores.matches.insert({
            categoryId: bracket.categoryId, tournamentId, stage: 'knockout', round: top, roundName: 'Third Place', thirdPlace: true,
            bracketKey: key3, redId: aka, blueId: ao, matchNumber: `M-${pad(number)}`, mat, status: 'scheduled', winner: null,
          })
          number += 1
          merged.set(key3, { ...row, ...slot, aka, ao })
        } else {
          merged.set(key3, { ...slot, aka, ao, status: 'pending' })
        }
      }
    }
    return [...merged.values()]
  }

  /**
   * The organiser arranges the first round by hand (drag and drop on the
   * bracket): `layout` lists the places AKA, AO, AKA, AO … with null for a
   * bye. Allowed until the first bout of the bracket starts; the bouts are
   * then rebuilt from the new arrangement (times and panels set on the old
   * ones go with them).
   */
  async function arrangeBracket(actor, tournamentId, key, layout) {
    const tournament = await writableTournament(tournamentId)
    const bracket = (await stores.brackets.list({ tournamentId, divisionKey: key }))[0]
    if (!bracket) throw missing('bracket_not_found')
    const bouts = (await stores.matches.list({ categoryId: bracket.categoryId })).filter((m) => m.stage === 'knockout')
    // Once a bout is called to the mat (or later), the draw stays as it is.
    if (bouts.some((m) => boutOutcome(m) || ['called', 'ready', 'live', 'open', 'paused'].includes(m.status))) throw rule('bracket_started')
    const ids = bracket.entries.map((e) => e.id)
    const size = nextPow2(ids.length)
    if (!Array.isArray(layout) || layout.length !== size) throw invalid('invalid_layout', { size })
    const placed = layout.filter(Boolean)
    if (placed.length !== ids.length || new Set(placed).size !== placed.length || placed.some((id) => !ids.includes(id))) throw invalid('invalid_layout', { size })
    // Every first-round bout needs at least one player, or the next round waits for nobody.
    for (let i = 0; i < size; i += 2) if (!layout[i] && !layout[i + 1]) throw invalid('empty_bout', { bout: i / 2 + 1 })
    if (layout.some((id) => !id)) assertByesAllowed(ids.length, settingsOf(tournament))
    for (const m of bouts) await stores.matches.remove(m.id)
    await stores.brackets.update(bracket.id, { layout: layout.map((id) => id || null) })
    const names = new Map((await stores.competitors.list({ categoryId: bracket.categoryId })).map((c) => [c.id, c.name]))
    await record(actor, { tournamentId, action: A.BRACKET_ARRANGED, entity: 'division', entityId: key, after: { firstRound: Array.from({ length: size / 2 }, (_, i) => `${names.get(layout[i * 2]) || 'bye'} v ${names.get(layout[i * 2 + 1]) || 'bye'}`) } })
    return bracketView(tournamentId, key)
  }

  /** Every bracket in the tournament, for choosing one on the bracket screen. */
  async function listBrackets(tournamentId) {
    const labels = new Map((await divisions(tournamentId)).map((d) => [d.key, d.label]))
    return (await stores.brackets.list({ tournamentId })).map((b) => ({
      divisionKey: b.divisionKey, label: labels.get(b.divisionKey) || b.divisionKey, entries: b.entries.length,
      knockoutOnly: !!b.knockoutOnly, thirdPlace: !!b.thirdPlace, arranged: !!b.layout,
    })).sort((a, b) => a.label.localeCompare(b.label))
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
          key: s.key, id: s.id || null, matchNumber: s.matchNumber || null, status: s.status, winner: s.winner || null, thirdPlace: !!s.thirdPlace, label: s.thirdPlace ? 'Third Place' : null,
          aka: s.aka ? { id: s.aka, name: competitors.get(s.aka)?.name, playerId: competitors.get(s.aka)?.playerId } : null,
          ao: s.ao ? { id: s.ao, name: competitors.get(s.ao)?.name, playerId: competitors.get(s.ao)?.playerId } : null,
          akaScore: s.avgRed ?? null, aoScore: s.avgBlue ?? null,
          won: (() => { const o = boutOutcome(s); return o && o.winner !== 'draw' ? o.winner : null })(),
          live: ['live', 'open', 'paused'].includes(s.status),
        })),
      })),
      slots,
      // For the drag-and-drop board: the first round place by place, and who is in it.
      size: (bracket.layout || []).length || nextPow2(bracket.entries.length),
      layout: bracket.layout || buildBracket(bracket.entries).filter((m) => m.round === 1).sort((a, b) => a.slot - b.slot).flatMap((m) => [m.aka || null, m.ao || null]),
      entries: bracket.entries.map((e) => ({ id: e.id, playerId: e.playerId, pool: e.pool || null, place: e.place || null, name: competitors.get(e.id)?.name || '', team: competitors.get(e.id)?.teamId || null })),
      thirdPlace: !!bracket.thirdPlace,
      started: slots.some((m) => boutOutcome(m) || ['called', 'ready', 'live', 'open', 'paused'].includes(m.status)),
      categoryId: bracket.categoryId,
    }
  }

  /** Standings for every division, plus the medals each has settled. */
  async function results(tournamentId) {
    const out = await computeResults(tournamentId)
    const records = await resultRecords(tournamentId)
    const lockedMedals = new Map()
    for (const [key, row] of records) {
      if (row.status === RESULT_STATUS.LOCKED) lockedMedals.set(key, await stores.medals.list({ tournamentId, divisionKey: key }))
    }
    return out.map((d) => {
      const frozen = lockedMedals.get(d.key)
      const medals = frozen ? frozen.map((m) => ({ id: m.playerId, name: m.name, team: m.team, club: m.club, district: m.district, state: m.state, country: m.country, rank: m.rank, medal: m.medal, sourceMatchId: m.sourceMatchId || null, reason: m.reason || null })) : d.medals
      const row = records.get(d.key)
      return { ...d, medals, resultStatus: statusOf({ medals }, row), verifiedAt: row?.verifiedAt || null, publishedAt: row?.publishedAt || null, lockedAt: row?.lockedAt || null }
    })
  }

  async function computeResults(tournamentId) {
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

      // PRD v1 §12/§28: a lone entrant is decided by the single-entry policy.
      if (division.playerIds.length === 1) {
        const policy = cfg.settings.singlePlayerPolicy || 'admin_decision'
        const auto = policy === 'auto_award' ? [{ id: division.playerIds[0], rank: 1, medal: 'gold', reason: 'Single entry: awarded automatically' }] : []
        out.push({
          ...division, pools: [], bracket: null, hasBracket: false, canGenerateBracket: false, singleEntry: true,
          singleEntryPolicy: policy, needsDecision: policy === 'admin_decision' && !override,
          medals: applyOverride(auto), medalsOverridden: !!override, overrideReason: override?.reason || null,
        })
        continue
      }

      const data = await divisionPoolsWithStandings(tournamentId, division.key, ds)
      const bracket = await bracketView(tournamentId, division.key)
      let medals = []
      if (bracket) {
        const playerOf = new Map(data.competitors.map((c) => [c.id, c.playerId]))
        medals = bracketMedals(bracket.slots, ds)
          .map((m) => ({ ...m, id: playerOf.get(m.id) }))
      } else if (data.masterPool) {
        if (data.masterPool.complete) medals = poolMedals(data.masterPool.standings, { label: 'final pool' })
      } else if (data.pools.length === 1 && data.pools[0].complete) {
        medals = poolMedals(data.pools[0].standings)
      }
      out.push({
        ...division,
        // A knockout-only category has its draw in the bracket, not in pools.
        pools: bracket?.knockoutOnly ? [] : data.pools.map((p) => ({ ...p, standings: p.standings.map(named) })),
        masterPool: data.masterPool ? { ...data.masterPool, standings: data.masterPool.standings.map(named) } : null,
        bracket: bracket ? { rounds: bracket.rounds } : null,
        hasBracket: !!bracket,
        canGenerateBracket: !bracket && !data.masterPool && data.pools.length > 1 && data.pools.every((p) => p.complete),
        finalStage: data.masterPool ? 'master_pool' : bracket ? 'knockout' : null,
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
    await assertNotLocked(tournamentId, key)
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

  // --- result lifecycle (PRD v1 §16) ------------------------------------------

  const resultRecords = async (tournamentId) => new Map((await stores.divisionResults.list({ tournamentId })).map((r) => [r.divisionKey, r]))

  const statusOf = (division, recordRow) => recordRow?.status
    || (division.medals?.length ? RESULT_STATUS.PROVISIONAL : RESULT_STATUS.IN_PROGRESS)

  /**
   * "Published results cannot be changed by ordinary users": once a
   * category is published (or locked) a change needs the result-override
   * privilege, and a reason.
   */
  async function assertResultEditable(actor, tournamentId, divisionKeyValue, reason = null) {
    if (!divisionKeyValue) return
    const row = (await stores.divisionResults.list({ tournamentId, divisionKey: divisionKeyValue }))[0]
    if (!row || ![RESULT_STATUS.PUBLISHED, RESULT_STATUS.LOCKED].includes(row.status)) return
    // A locked category is frozen for everyone: unlock it (with a reason) first.
    if (row.status === RESULT_STATUS.LOCKED) throw rule('results_locked')
    if (!actor || !can(actor.role, P.RESULT_OVERRIDE)) throw denied('results_published')
    if (!reason) throw invalid('reason_required')
  }

  async function assertNotLocked(tournamentId, divisionKeyValue) {
    const row = (await stores.divisionResults.list({ tournamentId, divisionKey: divisionKeyValue }))[0]
    if (row?.status === RESULT_STATUS.LOCKED) throw rule('results_locked')
  }

  /**
   * One category's result, frozen or unfrozen on its own (PRD v1 §16), so a
   * finished category is safe while the rest of the event goes on. Locking
   * needs a published result; unlocking needs the result-override privilege
   * and a reason, and goes back to Published.
   */
  async function setDivisionLock(actor, tournamentId, key, locked, reason = null) {
    await writableTournament(tournamentId)
    const division = (await results(tournamentId)).find((d) => d.key === key)
    if (!division) throw missing('division_not_found')
    if (locked) {
      if (division.resultStatus === RESULT_STATUS.LOCKED) return { status: RESULT_STATUS.LOCKED }
      if (division.resultStatus !== RESULT_STATUS.PUBLISHED) throw rule('invalid_transition', { from: division.resultStatus, to: RESULT_STATUS.LOCKED })
      await setResultStatus(actor, tournamentId, key, RESULT_STATUS.LOCKED)
      await record(actor, { tournamentId, action: A.RESULT_LOCKED, entity: 'division', entityId: key, after: { medals: division.medals.map((m) => `${m.medal}:${m.name}`) }, reason })
      return { status: RESULT_STATUS.LOCKED }
    }
    if (division.resultStatus !== RESULT_STATUS.LOCKED) return { status: division.resultStatus }
    if (!actor || !can(actor.role, P.RESULT_OVERRIDE)) throw denied('result_override_forbidden')
    if (!reason) throw invalid('reason_required')
    await setResultStatus(actor, tournamentId, key, RESULT_STATUS.PUBLISHED)
    await record(actor, { tournamentId, action: A.RESULT_UNLOCKED, entity: 'division', entityId: key, reason })
    return { status: RESULT_STATUS.PUBLISHED }
  }

  async function setResultStatus(actor, tournamentId, key, status, extra = {}) {
    const existing = (await stores.divisionResults.list({ tournamentId, divisionKey: key }))[0]
    const doc = { status, [`${status.toLowerCase()}By`]: actor?.uid || null, [`${status.toLowerCase()}At`]: iso(), ...extra }
    return existing ? stores.divisionResults.update(existing.id, doc) : stores.divisionResults.insert({ tournamentId, divisionKey: key, ...doc })
  }

  /** Writes one category's medals into the published list. */
  async function writeMedals(tournamentId, division) {
    await stores.medals.removeWhere({ tournamentId, divisionKey: division.key })
    for (const medal of division.medals) {
      await stores.medals.insert({
        tournamentId, playerId: medal.id, name: medal.name, team: medal.team, club: medal.club, district: medal.district,
        state: medal.state, country: medal.country, divisionKey: division.key, category: division.label, event: division.event,
        rank: medal.rank, medal: medal.medal, sourceMatchId: medal.sourceMatchId || null, reason: medal.reason || null,
      })
    }
    return division.medals.length
  }

  /** An official checks a decided category's result (Provisional → Verified). */
  async function verifyResult(actor, tournamentId, key, verified = true) {
    const tournament = await writableTournament(tournamentId)
    const division = (await results(tournamentId)).find((d) => d.key === key)
    if (!division) throw missing('division_not_found')
    if (!verified) {
      if ([RESULT_STATUS.PUBLISHED, RESULT_STATUS.LOCKED].includes(division.resultStatus)) throw rule('results_published')
      const row = (await stores.divisionResults.list({ tournamentId, divisionKey: key }))[0]
      if (row) await stores.divisionResults.remove(row.id)
      await record(actor, { tournamentId, action: A.RESULT_VERIFIED, entity: 'division', entityId: key, after: { verified: false } })
      return { status: RESULT_STATUS.PROVISIONAL }
    }
    if (!division.medals.length) throw rule('results_not_decided')
    if (division.resultStatus !== RESULT_STATUS.PROVISIONAL) throw rule('invalid_transition', { from: division.resultStatus, to: RESULT_STATUS.VERIFIED })
    await setResultStatus(actor, tournamentId, key, RESULT_STATUS.VERIFIED)
    await record(actor, { tournamentId, action: A.RESULT_VERIFIED, entity: 'division', entityId: key, after: { medals: division.medals.map((m) => `${m.medal}:${m.name}`) } })
    // Automatic publishing: a verified category goes public at once.
    if (settingsOf(tournament).resultPublishing === 'auto') {
      await writeMedals(tournamentId, division)
      await setResultStatus(actor, tournamentId, key, RESULT_STATUS.PUBLISHED)
      if (!tournament.resultsPublished) await stores.tournaments.update(tournamentId, { resultsPublished: true, resultsPublishedAt: iso() })
      await record(actor, { tournamentId, action: A.RESULT_PUBLISHED_CATEGORY, entity: 'division', entityId: key })
      await notify(tournamentId, 'team', 'result_published', `Results published: ${division.label}`)
      return { status: RESULT_STATUS.PUBLISHED }
    }
    return { status: RESULT_STATUS.VERIFIED }
  }

  /**
   * Section 42: publishes every decided category. One not yet verified is
   * verified by the publisher on the way (and recorded so); a locked one
   * keeps the medals it was locked with.
   */
  async function publishResults(actor, tournamentId, publish = true) {
    const tournament = await writableTournament(tournamentId)
    const records = await resultRecords(tournamentId)
    if (!publish) {
      for (const row of records.values()) {
        if (row.status === RESULT_STATUS.LOCKED) throw rule('results_locked')
      }
      for (const row of records.values()) {
        if (row.status === RESULT_STATUS.PUBLISHED) await stores.divisionResults.update(row.id, { status: RESULT_STATUS.VERIFIED })
      }
      await stores.tournaments.update(tournamentId, { resultsPublished: false })
      await record(actor, { tournamentId, action: A.RESULTS_UNPUBLISHED, entity: 'tournament', entityId: tournamentId })
      return { published: false }
    }
    let count = 0
    for (const division of await results(tournamentId)) {
      const status = division.resultStatus
      if (status === RESULT_STATUS.LOCKED) { count += (await stores.medals.list({ tournamentId, divisionKey: division.key })).length; continue }
      if (!division.medals.length) { await stores.medals.removeWhere({ tournamentId, divisionKey: division.key }); continue }
      if (status === RESULT_STATUS.PROVISIONAL) {
        await setResultStatus(actor, tournamentId, division.key, RESULT_STATUS.VERIFIED)
        await record(actor, { tournamentId, action: A.RESULT_VERIFIED, entity: 'division', entityId: division.key, reason: 'Verified on publishing' })
      }
      count += await writeMedals(tournamentId, division)
      await setResultStatus(actor, tournamentId, division.key, RESULT_STATUS.PUBLISHED)
    }
    await stores.tournaments.update(tournamentId, { resultsPublished: true, resultsPublishedAt: iso() })
    await record(actor, { tournamentId, action: A.RESULTS_PUBLISHED, entity: 'tournament', entityId: tournamentId, after: { medals: count }, before: { resultsPublished: !!tournament.resultsPublished } })
    await notify(tournamentId, 'team', 'result_published', 'Results have been published.')
    return { published: true, medals: count }
  }

  /** Completing the tournament locks every published category. */
  async function lockDivisionResults(actor, tournamentId) {
    let locked = 0
    for (const row of (await resultRecords(tournamentId)).values()) {
      if (row.status !== RESULT_STATUS.PUBLISHED) continue
      await stores.divisionResults.update(row.id, { status: RESULT_STATUS.LOCKED, lockedAt: iso(), lockedBy: actor?.uid || null })
      locked += 1
    }
    if (locked) await record(actor, { tournamentId, action: A.RESULT_LOCKED, entity: 'tournament', entityId: tournamentId, after: { categories: locked } })
    return locked
  }

  async function unlockDivisionResults(actor, tournamentId, reason) {
    for (const row of (await resultRecords(tournamentId)).values()) {
      if (row.status === RESULT_STATUS.LOCKED) await stores.divisionResults.update(row.id, { status: RESULT_STATUS.PUBLISHED })
    }
    await record(actor, { tournamentId, action: A.RESULT_UNLOCKED, entity: 'tournament', entityId: tournamentId, reason })
  }

  const listMedals = async (tournamentId) =>
    (await stores.medals.list({ tournamentId })).sort((a, b) => a.category.localeCompare(b.category) || a.rank - b.rank)

  async function tally(tournamentId, by = 'club') {
    return medalTally(await listMedals(tournamentId), by)
  }

  // --- certificates -------------------------------------------------------------

  // PRD v1 §18: participation, gold, silver, bronze, coach/official and custom awards.
  const CERT_TITLE = {
    gold: 'Certificate of Achievement — Gold', silver: 'Certificate of Achievement — Silver', bronze: 'Certificate of Achievement — Bronze',
    participation: 'Certificate of Participation', coach: 'Certificate of Appreciation — Coach', official: 'Certificate of Appreciation — Technical Official',
  }
  const CERT_TYPES = ['medal', 'participation', 'coach', 'official']

  const newCertificateId = (tournament) => `CERT-${String(tournament.startDate || tournament.date || iso()).slice(0, 4)}-${randomToken(8).toUpperCase()}`

  /**
   * Bulk generation from finalized results and records. Generating again
   * only issues certificates that do not exist yet: an existing certificate
   * keeps its number for every reprint.
   */
  async function generateCertificates(actor, tournamentId, { types = ['medal'], officials = [] } = {}) {
    const tournament = await writableTournament(tournamentId)
    const wanted = types.filter((t) => CERT_TYPES.includes(t))
    if (!wanted.length) throw invalid('invalid_types')
    if (wanted.includes('medal') && !tournament.resultsPublished) throw rule('results_not_published')
    const existing = await stores.certificates.list({ tournamentId })
    const have = new Set(existing.map((c) => `${c.type || c.medal}|${c.playerId || c.personKey}|${c.divisionKey || ''}`))
    const issue = async (doc) => {
      const key = `${doc.type}|${doc.playerId || doc.personKey}|${doc.divisionKey || ''}`
      if (have.has(key)) return 0
      have.add(key)
      await stores.certificates.insert({ tournamentId, certificateId: newCertificateId(tournament), title: CERT_TITLE[doc.type] || doc.title, issuedAt: iso(), ...doc })
      return 1
    }
    let created = 0
    if (wanted.includes('medal')) {
      for (const medal of await listMedals(tournamentId)) {
        created += await issue({ type: medal.medal, playerId: medal.playerId, name: medal.name, club: medal.club, category: medal.category, event: medal.event, divisionKey: medal.divisionKey, rank: medal.rank, medal: medal.medal })
      }
    }
    if (wanted.includes('participation')) {
      const labels = new Map((await divisions(tournamentId)).map((d) => [d.key, d.label]))
      const drawn = new Set((await stores.pools.list({ tournamentId })).flatMap((p) => p.playerIds))
      for (const r of await stores.kataRounds.list({ tournamentId })) r.performerIds.forEach((id) => drawn.add(id))
      for (const p of await stores.players.list({ tournamentId })) {
        if (!drawn.has(p.id)) continue
        const cats = Object.values(p.entries || {}).map((e) => labels.get(e.divisionKey)).filter(Boolean)
        created += await issue({ type: 'participation', playerId: p.id, name: p.name, club: p.club || null, category: cats.join(', ') || null, event: (p.events || []).join(' & ') })
      }
    }
    // Team members: coaches and managers get the coach certificate, judges and
    // referees the officials' one; someone with both gets both.
    if (wanted.includes('coach') || wanted.includes('official')) {
      for (const m of await teamStaff(tournamentId)) {
        const staffRoles = m.roles.filter((r) => ['team_manager', 'coach'].includes(r))
        const officialRoles = m.roles.filter((r) => ['judge', 'referee'].includes(r))
        if (wanted.includes('coach') && staffRoles.length) created += await issue({ type: 'coach', personKey: m.key, name: m.name, club: m.team.club || m.team.name, category: `${memberRolesText(staffRoles)}, ${m.team.name}` })
        if (wanted.includes('official') && officialRoles.length) created += await issue({ type: 'official', personKey: `${m.key}:official`, name: m.name, club: m.team.club || m.team.name, category: memberRolesText(officialRoles) })
      }
    }
    if (wanted.includes('official')) {
      for (const o of officials) {
        if (!o?.uid || !o?.name) continue
        created += await issue({ type: 'official', personKey: `official:${o.uid}`, name: String(o.name).slice(0, 120), category: o.role === 'judge' ? 'Judge' : o.role === 'referee' ? 'Referee' : 'Technical Official' })
      }
    }
    await record(actor, { tournamentId, action: A.CERTIFICATES_GENERATED, entity: 'tournament', entityId: tournamentId, after: { created, types: wanted } })
    if (created) await notify(tournamentId, 'team', 'certificate_available', `${created} certificate(s) are now available.`)
    return { created, certificates: await listCertificates(tournamentId) }
  }

  /** A custom award ("Best Fighter"), issued by hand with its own number. */
  async function issueCustomCertificate(actor, tournamentId, { name, title, award, club = null, category = null, playerId = null }) {
    const tournament = await writableTournament(tournamentId)
    if (!name || String(name).trim().length < 2) throw invalid('name_required')
    if (!award && !title) throw invalid('award_required')
    if (playerId) await inTournament('players', tournamentId, playerId)
    const row = await stores.certificates.insert({
      tournamentId, certificateId: newCertificateId(tournament), type: 'custom', title: String(title || 'Special Award').slice(0, 120),
      award: award ? String(award).slice(0, 120) : null, playerId, name: String(name).trim().slice(0, 120), club: club ? String(club).slice(0, 120) : null,
      category: category ? String(category).slice(0, 120) : null, issuedAt: iso(),
    })
    await record(actor, { tournamentId, action: A.CERTIFICATE_ISSUED, entity: 'certificate', entityId: row.certificateId, after: { name: row.name, award: row.award || row.title } })
    return row
  }

  // --- accreditation passes and QR check-in ------------------------------------

  const PASS_ROLE = { player: 'Athlete', coach: 'Coach', official: 'Technical Official' }
  const PASS_KINDS = Object.keys(PASS_ROLE)
  const NOT_ACCREDITED = new Set([R.DRAFT, R.REJECTED, R.WITHDRAWN])

  /**
   * Accreditation passes: one per athlete, coach and official, each with a
   * code its QR carries. Generating again only adds passes for people who
   * have none, so a printed pass keeps working.
   */
  async function generatePasses(actor, tournamentId, { kinds = ['player', 'coach'], officials = [] } = {}) {
    await writableTournament(tournamentId)
    const wanted = kinds.filter((k) => PASS_KINDS.includes(k))
    const existing = new Set((await stores.passes.list({ tournamentId })).map((p) => p.refKey))
    const teams = new Map((await stores.teams.list({ tournamentId })).map((t) => [t.id, t]))
    const labels = new Map((await divisions(tournamentId)).map((d) => [d.key, d.label]))
    const fresh = []
    const add = (doc) => {
      if (existing.has(doc.refKey)) return
      existing.add(doc.refKey)
      const { roleText, ...rest } = doc
      fresh.push({ tournamentId, code: randomToken(10).toUpperCase(), role: roleText || PASS_ROLE[doc.kind], issuedAt: iso(), ...rest })
    }
    if (wanted.includes('player')) {
      for (const p of await stores.players.list({ tournamentId })) {
        if (NOT_ACCREDITED.has(p.registrationStatus)) continue
        const team = teams.get(p.teamId)
        const category = Object.values(p.entries || {}).map((e) => labels.get(e.divisionKey)).filter(Boolean).join(' · ') || (p.events || []).join(', ')
        add({ kind: 'player', refId: p.id, refKey: `player:${p.id}`, name: p.name, number: p.playerNumber || null, club: p.club || team?.club || team?.name || null, team: team?.name || null, category, photoFileId: p.photo || null })
      }
    }
    // Team members: managers and coaches as team staff, judges and referees
    // as technical officials (with their team noted). Several roles, one pass.
    if (wanted.includes('coach') || wanted.includes('official')) {
      for (const m of await teamStaff(tournamentId)) {
        const officialOnly = m.roles.every((r) => ['judge', 'referee'].includes(r))
        const kind = officialOnly ? 'official' : 'coach'
        if (!wanted.includes(kind)) continue
        add({ kind, refId: m.id || m.team.id, refKey: m.key, name: m.name, number: m.team.teamNumber || null, club: m.team.club || m.team.name, team: m.team.name, category: `${memberRolesText(m.roles)}, ${m.team.name}`, roleText: memberRolesText(m.roles) })
      }
    }
    if (wanted.includes('official')) {
      for (const o of officials) {
        if (!o?.uid || !o?.name) continue
        add({ kind: 'official', refId: o.uid, refKey: `official:${o.uid}`, name: String(o.name).slice(0, 120), number: null, club: null, team: null, category: o.role === 'judge' ? 'Kata Judge' : o.role === 'referee' ? 'Referee' : 'Technical Official' })
      }
    }
    if (fresh.length) await stores.passes.insertMany(fresh)
    await record(actor, { tournamentId, action: A.PASSES_GENERATED, entity: 'tournament', entityId: tournamentId, after: { created: fresh.length, kinds: wanted } })
    return { created: fresh.length, passes: await listPasses(tournamentId) }
  }

  const listPasses = async (tournamentId, { kind = null } = {}) =>
    (await stores.passes.list(kind ? { tournamentId, kind } : { tournamentId }))
      .sort((a, b) => PASS_KINDS.indexOf(a.kind) - PASS_KINDS.indexOf(b.kind) || byName(a, b))

  /**
   * Scanning a pass (Phase 2 "QR check-in"). At the door it records arrival;
   * at a mat it marks the athlete present for their next bout, which the
   * announcer's attendance shows. Unknown or foreign codes are refused.
   */
  async function checkIn(actor, tournamentId, rawCode, { point = 'arrival' } = {}) {
    await writableTournament(tournamentId)
    const code = String(rawCode || '').trim().toUpperCase().replace(/^.*\//, '')
    const pass = (await stores.passes.list({ tournamentId, code }))[0]
    if (!pass) throw missing('pass_not_found')
    const result = { pass: { kind: pass.kind, name: pass.name, role: pass.role, club: pass.club, number: pass.number, category: pass.category } }
    if (point === 'mat') {
      if (pass.kind !== 'player') throw rule('not_an_athlete')
      const player = await inTournament('players', tournamentId, pass.refId)
      if (player.registrationStatus === R.WITHDRAWN) throw rule('player_withdrawn')
      const next = (await listMatches(tournamentId))
        .filter((m) => !boutOutcome(m) && m.status !== 'cancelled' && (m.akaPlayerId === player.id || m.aoPlayerId === player.id))
        .sort((a, b) => String(a.scheduledAt || '9').localeCompare(String(b.scheduledAt || '9')) || String(a.matchNumber).localeCompare(String(b.matchNumber), undefined, { numeric: true }))[0]
      if (!next) throw rule('no_pending_bout')
      const side = next.akaPlayerId === player.id ? 'aka' : 'ao'
      await markAttendance(actor, tournamentId, next.id, side, true)
      result.bout = { matchId: next.id, matchNumber: next.matchNumber, mat: next.mat || null, side, category: next.categoryName || null }
    } else {
      const at = iso()
      await stores.passes.update(pass.id, { checkedInAt: pass.checkedInAt || at, lastScanAt: at, scans: (pass.scans || 0) + 1 })
      if (pass.kind === 'player') await stores.players.update(pass.refId, { checkedInAt: pass.checkedInAt || at })
      result.alreadyCheckedIn = !!pass.checkedInAt
      result.checkedInAt = pass.checkedInAt || at
    }
    await record(actor, { tournamentId, action: A.CHECKED_IN, entity: pass.kind, entityId: pass.refId, after: { point, code, ...(result.bout ? { match: result.bout.matchNumber } : {}) } })
    return result
  }

  /**
   * A coach's own certificates: their team's players' (medal, participation,
   * special awards) and their own coach certificate. The tournament comes
   * back too, for the route that prints them; it is never sent to the coach.
   */
  async function coachCertificates(actor) {
    if (!isCoach(actor) || !actor.teamId) return { tournament: null, certificates: [] }
    const tournament = await tournamentOf(actor.tournamentId)
    const mine = new Set((await stores.players.list({ tournamentId: tournament.id, teamId: actor.teamId })).map((p) => p.id))
    const certificates = (await listCertificates(tournament.id))
      .filter((c) => (c.playerId && mine.has(c.playerId)) || c.personKey === `coach:${actor.teamId}`)
    return { tournament, certificates }
  }

  const listCertificates = async (tournamentId, { type = null } = {}) =>
    (await stores.certificates.list({ tournamentId }))
      .map((c) => ({ ...c, type: c.type || c.medal }))
      .filter((c) => !type || c.type === type)
      .sort((a, b) => String(a.type).localeCompare(String(b.type)) || String(a.category || '').localeCompare(String(b.category || '')) || (a.rank ?? 9) - (b.rank ?? 9) || String(a.name).localeCompare(String(b.name)))

  /** PRD v1 §18 QR verification: what a scanned certificate number proves. */
  async function verifyCertificate(certificateId) {
    const cert = (await stores.certificates.list({ certificateId: String(certificateId || '') }))[0]
    if (!cert) throw missing('certificate_not_found')
    const t = await stores.tournaments.get(cert.tournamentId)
    return {
      valid: true, certificateId: cert.certificateId, type: cert.type || cert.medal, title: cert.title || null, name: cert.name, club: cert.club || null,
      category: cert.category || null, medal: cert.medal || null, award: cert.award || null, issuedAt: cert.issuedAt,
      tournament: t ? { name: t.name, slug: t.slug || null, date: t.startDate || t.date || null, venue: t.venue || t.location || null } : null,
    }
  }

  /** PRD v1 §17 "Certificates if enabled": a player finds theirs on the public page. */
  async function publicCertificates(idOrSlug, q = '') {
    const t = await findPublicTournament(idOrSlug)
    if (!settingsOf(t).publicCertificates) throw missing('certificates_not_public')
    const needle = normalizeName(q)
    if (needle.length < 2) return []
    return (await listCertificates(t.id))
      .filter((c) => !['coach', 'official'].includes(c.type) && normalizeName(c.name).includes(needle))
      .slice(0, 50)
      .map(({ certificateId, type, title, name, club, category, medal, award }) => ({ certificateId, type, title, name, club, category, medal, award }))
  }

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
      ...coachWindow(tournament),
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
    const members = team ? await teamMembers.list(tournament.id, { teamId: team.id }) : []
    const notes = team ? (await stores.notifications.list({ tournamentId: tournament.id, audience: 'team' }))
      .filter((n) => !n.teamId || n.teamId === team.id) : []
    return {
      tournament: { ...publicTournament(tournament), entriesLocked: !!tournament.entriesLocked },
      ...coachWindow(tournament),
      form: formFields(tournament).filter((f) => f.visible !== false),
      team,
      players: players.sort(byName),
      members,
      notifications: notes.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50),
    }
  }

  // --- public (Rule 8) ----------------------------------------------------------

  function publicTournament(t) {
    const keep = ['id', 'name', 'slug', 'description', 'rules', 'terms', 'logoUrl', 'type', 'template', 'organizer', 'association', 'venue', 'location', 'city', 'district', 'state', 'country', 'startDate', 'endDate', 'date', 'lifecycleStatus', 'resultsPublished',
      // PRD v1 §17 "Registration information": the organiser's own contact, the window and the fees.
      'registrationStart', 'registrationClose', 'weighInDate', 'timezone', 'contactPerson', 'contactEmail', 'contactMobile', 'rulesetName']
    const out = {}
    for (const k of keep) if (t[k] !== undefined) out[k] = t[k]
    out.lifecycleStatus = lifecycleOf(t)
    const s = settingsOf(t)
    // Fees are shown only while payments are on (features.js).
    if (paymentsEnabled()) out.fees = s.fees
    out.publicCertificates = !!s.publicCertificates
    out.registrationOpen = lifecycleOf(t) === T.REGISTRATION_OPEN && registrationWindow(t).open
    return out
  }

  /** PRD v1 §6 public visibility: private never shows; unlisted only by its link. */
  async function findPublicTournament(idOrSlug) {
    const byId = await stores.tournaments.get(idOrSlug)
    const t = byId || (await stores.tournaments.list({ slug: idOrSlug }))[0]
    if (!t || lifecycleOf(t) === T.DRAFT || settingsOf(t).publicVisibility === 'private') throw missing('tournament_not_found')
    return t
  }

  /** Published tournaments; `org` (a slug) narrows to one organisation's. */
  async function publicList({ org = null } = {}) {
    const organizations = stores.organizations ? await stores.organizations.list({}) : []
    const byId = new Map(organizations.map((o) => [o.id, o]))
    const only = org ? organizations.find((o) => o.slug === org) : null
    if (org && !only) return []
    return (await stores.tournaments.list())
      .filter((t) => lifecycleOf(t) !== T.DRAFT && settingsOf(t).publicVisibility === 'public' && (!only || t.organizationId === only.id))
      .map((t) => ({ ...publicTournament(t), organization: byId.get(t.organizationId) ? { name: byId.get(t.organizationId).name, slug: byId.get(t.organizationId).slug } : null }))
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
    // Only categories released to the public (published or locked), PRD v1 §16.
    const res = t.resultsPublished ? (await results(tournamentId)).filter((d) => [RESULT_STATUS.PUBLISHED, RESULT_STATUS.LOCKED].includes(d.resultStatus)) : []
    const released = new Set(res.map((d) => d.key))
    const medals = t.resultsPublished ? (await listMedals(tournamentId)).filter((m) => released.has(m.divisionKey)) : []
    const stripPrivate = ({ id, name, team, club, state, country, rank, medal, category, event, played, wins, losses, draws, points, scoreFor, scoreAgainst, qualified, tieBreak, reason }) =>
      ({ id, name, team, club, state, country, rank, medal, category, event, played, wins, losses, draws, points, scoreFor, scoreAgainst, qualified, tieBreak, reason })
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
        aka: m.akaName, ao: m.aoName, winner: m.winner || null, akaScore: m.avgRed ?? null, aoScore: m.avgBlue ?? null, calledAt: m.calledAt || null,
      })),
      results: res.map((d) => ({
        key: d.key, label: d.label, event: d.event, resultStatus: d.resultStatus,
        masterPool: d.masterPool ? { pool: d.masterPool.pool, complete: d.masterPool.complete, standings: d.masterPool.standings.map(stripPrivate) } : null,
        pools: d.pools.map((p) => ({ pool: p.pool, complete: p.complete, standings: p.standings.map(stripPrivate) })),
        bracket: d.bracket, medals: d.medals.map(stripPrivate),
        kata: d.kata ? { rounds: d.kata.rounds.map((r) => ({ name: r.name, status: r.status, judges: r.judges, rows: r.rows.map(({ playerId, name, club, team, state, bySeat, final, rank, order }) => ({ playerId, name, club, team, state, bySeat, final, rank, order })) })) } : null,
      })),
      medals: medals.map(stripPrivate),
      tally: t.resultsPublished ? { club: medalTally(medals, 'club'), state: medalTally(medals, 'state'), district: medalTally(medals, 'district'), country: medalTally(medals, 'country') } : null,
    }
  }

  /** PRD v1 §22: exports are audit events. */
  async function logExport(actor, tournamentId, { report, format, rows = null, filters = null }) {
    await tournamentOf(tournamentId)
    await record(actor, { tournamentId, action: A.EXPORTED, entity: 'report', entityId: String(report || 'list').slice(0, 60), after: { format: String(format || '').slice(0, 10), rows, ...(filters ? { filters } : {}) } })
  }

  // --- dashboard and notifications -----------------------------------------

  async function dashboard(tournamentId) {
    const players = await stores.players.list({ tournamentId })
    const teamRows = await stores.teams.list({ tournamentId })
    const pools = await stores.pools.list({ tournamentId })
    const matches = await listMatches(tournamentId)
    const medals = await stores.medals.list({ tournamentId })
    // For the step-by-step guide: how far each stage of the event has got.
    const [ageGroups, weightCategories, certificates, passes, kataRounds] = await Promise.all([
      stores.ageGroups.list({ tournamentId }), stores.weightCategories.list({ tournamentId }),
      stores.certificates.list({ tournamentId }), stores.passes.list({ tournamentId }), stores.kataRounds.list({ tournamentId }),
    ])
    const count = (pred) => players.filter(pred).length
    return {
      ageGroups: ageGroups.length,
      weightCategories: weightCategories.length,
      certificates: certificates.length,
      passes: passes.length,
      checkedIn: passes.filter((p) => p.checkedInAt).length,
      kataRounds: kataRounds.length,
      scheduledMatches: matches.filter((m) => m.mat || m.scheduledAt).length,
      matchesWithReferee: matches.filter((m) => m.refereeId).length,
      teams: teamRows.length,
      teamMembers: (await stores.teamMembers.list({ tournamentId })).length,
      players: players.length,
      kataPlayers: count((p) => p.events?.includes('kata')),
      kumitePlayers: count((p) => p.events?.includes('kumite')),
      pendingVerification: count((p) => [R.SUBMITTED, R.PENDING_VERIFICATION].includes(p.registrationStatus)),
      pendingPayment: paymentsEnabled() ? count((p) => DRAW_ELIGIBLE.has(p.registrationStatus) && (p.payment?.status || 'PENDING') !== 'PAID') : 0,
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
  /**
   * Removes everything a tournament owns. `matchIds` are its bouts, whose
   * saved live state is kept by bout rather than by tournament.
   */
  async function purgeTournament(tournamentId, { matchIds = [] } = {}) {
    for (const name of ['ageGroups', 'weightCategories', 'teams', 'players', 'pools', 'brackets', 'medals', 'certificates', 'registrationLinks', 'notifications', 'files',
      'kataRounds', 'kataScores', 'medalOverrides', 'matchEvents', 'divisionResults', 'passes', 'apiKeys', 'teamMembers']) {
      if (stores[name]) await stores[name].removeWhere({ tournamentId })
    }
    if (stores.liveStates) for (const id of matchIds) await stores.liveStates.remove(id)
  }

  return {
    // tournament
    updateTournament, setLifecycle, setEntriesLock, setDrawLock, updateForm, purgeTournament,
    // configuration
    ageGroups, weightCategories, applyCategoryPreset,
    // registration
    teams, teamMembers, listPlayers, pagePlayers, pageAudit, createPlayer, updatePlayer, removePlayer, previewBulk, importBulk,
    setRegistrationStatus, recordPayment, recordWeighIn,
    // categorisation and draw
    categorize, overrideCategory, divisions, listPools, generatePools, movePlayer, drawImpact, setQualifiers, decideSingleEntry,
    // matches and results
    generateMatches, listMatches, correctResult, swapCorners, callMatch, overrideMedals, recordLiveEvent, liveEvents,
    setMatchStatus, markAttendance, withdrawPlayer, saveLiveState, loadLiveState, liveCommandBlock, recordBlockedCommand,
    kataDivisions, kataRoundView, createKataRound, submitKataScore, completeKataRound, kataRounds: kataRoundsOf,
    assignKataJudges, startKataRound, overrideKataScore, setKataPenalty, results, generateBracket, bracketView, syncBracket, arrangeBracket, listBrackets,
    publishResults, verifyResult, assertResultEditable, setDivisionLock, coachCertificates, generatePasses, listPasses, checkIn, issueCustomCertificate, verifyCertificate, publicCertificates, setWeighInClosed, previewMasterDateChange, listMedals, tally, generateCertificates, listCertificates,
    // rulesets and locks
    listRulesets, resolveRuleset, createRuleset, updateRuleset, restoreStandard, setRulesetActive, applyRuleset, setSoftLock, registrationWindow,
    // links and coaches
    getLink, saveLink, linkInfo, openLink, coachOverview,
    // public, dashboard, audit
    publicList, publicView, publicTournament, dashboard, listNotifications, markNotificationsRead, sendWeighInReminder,
    auditTrail: (tournamentId) => audit.forTournament(tournamentId),
    logExport, record,
    // files
    uploadFile, readFile,
  }
}

export const TMS_COLLECTIONS = [
  'ageGroups', 'weightCategories', 'teams', 'players', 'pools', 'brackets', 'medals',
  'certificates', 'registrationLinks', 'notifications', 'auditLog', 'files',
  'kataRounds', 'kataScores', 'medalOverrides', 'matchEvents', 'organizations',
  'rulesets', 'divisionResults', 'liveStates', 'passes', 'teamMembers',
]

export { DomainError, poolName }
