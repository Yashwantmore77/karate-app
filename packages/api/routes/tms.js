import { Router } from 'express'
import { requireAuth, requirePermission, tournamentAccess } from '../auth/middleware.js'
import { findUserRecord, listAssignableOfficials } from '../auth/users.js'
import { mayAccessTournament } from '../auth/middleware.js'
import { validate } from '../lib/validate.js'
import { notFound } from '../lib/errors.js'
import { readPageQuery, pageMeta } from '../lib/pagination.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'
import { PERMISSION as P, can } from '@kumite/shared/permissions.js'
import { FILE_SCHEMA } from './files.js'
import { partnerKeyHash, newPartnerKey } from './partner.js'
import { certificatesPdf, tablePdf, passesPdf } from '../lib/pdf.js'
import { REPORT_KEYS, REPORT_TITLE, REPORT_FILTERS, loadReportData, buildReport } from '@kumite/shared/reports.js'
import { TOURNAMENT_STATUS, REGISTRATION_STATUS, MATCH_STATUS } from '@kumite/shared/lifecycle.js'
import { PAYMENT_STATUS, WEIGH_IN_STATUS, RESULT_TYPES, POOL_SYSTEMS, KATA_METHODS, SETTING_CHOICES, TEAM_MEMBER_ROLES } from '@kumite/shared/tms.js'
import { OVERTIME_MODES, KATA_TIE_BREAKS } from '@kumite/shared/rulesets.js'
import { POOL_MODES } from '@kumite/shared/pools.js'

// PRD section 56: everything a tournament owns, under /tournaments/:tid/...
// Each route checks a permission from the shared table, validates its body,
// and hands over to the shared service, which enforces locks and writes the
// audit trail. Nothing here re-implements a business rule.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = { type: 'string', max: 80 }
const REASON = { type: 'string', max: 300, nullable: true }

const AGE_GROUP = {
  name: { type: 'string', required: true, max: 60 },
  gender: { type: 'enum', values: ['M', 'F', 'Mixed'], required: true },
  minAge: { type: 'integer', required: true, min: 0, max: 99 },
  maxAge: { type: 'integer', required: true, min: 0, max: 99 },
  active: { type: 'boolean', default: true },
  // PRD v1 §9: overlapping categories only on purpose.
  allowOverlap: { type: 'boolean' },
  // PRD point 3: this category's own pool size, rules and rounds. The
  // service checks each key; anything left out inherits.
  settings: { type: 'object', nullable: true },
}

const WEIGHT_CATEGORY = {
  ageGroupId: { ...ID, required: true },
  name: { type: 'string', required: true, max: 40 },
  label: { type: 'string', max: 60, nullable: true },
  minWeight: { type: 'number', min: 0, max: 300, nullable: true },
  maxWeight: { type: 'number', min: 0, max: 300, nullable: true },
  active: { type: 'boolean', default: true },
  allowOverlap: { type: 'boolean' },
  settings: { type: 'object', nullable: true },
}

// One person a team brings besides players; several roles allowed.
export const TEAM_MEMBER = {
  name: { type: 'string', required: true, max: 120 },
  roles: { type: 'array', items: { type: 'enum', values: TEAM_MEMBER_ROLES }, maxItems: 4, unique: true, required: true },
  mobile: { type: 'string', max: 30, nullable: true },
  email: { type: 'string', max: 200, nullable: true },
  gender: { type: 'enum', values: ['M', 'F'], nullable: true },
  qualification: { type: 'string', max: 120, nullable: true },
  notes: { type: 'string', max: 300, nullable: true },
}

const TEAM = {
  name: { type: 'string', required: true, max: 120 },
  club: { type: 'string', max: 120, nullable: true },
  code: { type: 'string', max: 30, nullable: true },
  coachName: { type: 'string', max: 120, nullable: true },
  contactPerson: { type: 'string', max: 120, nullable: true },
  mobile: { type: 'string', max: 30, nullable: true },
  email: { type: 'string', max: 200, nullable: true },
  address: { type: 'string', max: 300, nullable: true },
  district: { type: 'string', max: 80, nullable: true },
  state: { type: 'string', max: 80, nullable: true },
  country: { type: 'string', max: 80, nullable: true },
  // PRD v1 §21: only an active team takes entries (organisers only).
  active: { type: 'boolean' },
}

/**
 * Player bodies are checked against the tournament's own registration form by
 * the service; here only the envelope is bounded: plain values, nothing nested
 * beyond `extra`, and a sane number of fields.
 */
export function playerBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return validate(body, {})
  const keys = Object.keys(body)
  if (keys.length > 60) return validate({ tooMany: true }, {})
  const out = {}
  for (const key of keys) {
    const value = body[key]
    if (['id', 'tournamentId', 'createdAt', 'updatedAt', 'registrationStatus', 'entries', 'payment', 'weighIn', 'age', 'playerNumber'].includes(key)) {
      return validate({ [key]: value }, {})
    }
    if (key === 'extra') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 40) return validate({ extra: 1 }, { extra: { type: 'boolean' } })
      out.extra = Object.fromEntries(Object.entries(value).map(([k, v]) => [String(k).slice(0, 60), typeof v === 'string' ? v.slice(0, 500) : v]))
      continue
    }
    if (key === 'events' && Array.isArray(value)) { out.events = value.slice(0, 4).map(String); continue }
    if (key === 'confirmDuplicate') { out.confirmDuplicate = value === true; continue }
    if (value !== null && typeof value === 'object') return validate({ [key]: value }, { [key]: { type: 'string' } })
    out[key] = typeof value === 'string' ? value.slice(0, 500) : value
  }
  return out
}

const TOURNAMENT_SETTINGS = {
  poolSize: { type: 'integer', min: 2, max: 64 },
  qualifiersPerPool: { type: 'integer', min: 1, max: 8 },
  pointsForWin: { type: 'integer', min: 0, max: 10 },
  pointsForDraw: { type: 'integer', min: 0, max: 10 },
  bronzeCount: { type: 'integer', min: 0, max: 2 },
  mats: { type: 'integer', min: 1, max: 20 },
  matchDurationSec: { type: 'integer', min: 30, max: 600 },
  pointGap: { type: 'integer', min: 1, max: 20 },
  weighInAutoMove: { type: 'boolean' },
  emailNotifications: { type: 'boolean' },
  fees: { type: 'object' },
  points: { type: 'object' },
  poolMode: { type: 'enum', values: POOL_MODES },
  poolSystem: { type: 'enum', values: POOL_SYSTEMS },
  ruleset: { type: 'string', max: 60 },
  kataMode: { type: 'enum', values: ['panel', 'bouts'] },
  kataJudges: { type: 'integer', min: 3, max: 7 },
  kataMethod: { type: 'enum', values: KATA_METHODS },
  kataQualifiers: { type: 'integer', min: 1, max: 64 },
  kataRounds: { type: 'integer', min: 1, max: 5 },
  officialsSeeAssignedOnly: { type: 'boolean' },
  // PRD v1 §6 tournament settings
  allowUnevenPools: { type: 'boolean' },
  allowByes: { type: 'boolean' },
  allowSeeding: { type: 'boolean' },
  drawMethod: { type: 'enum', values: SETTING_CHOICES.drawMethod },
  thirdPlaceMatch: { type: 'boolean' },
  overtime: { type: 'enum', values: OVERTIME_MODES },
  extraTimeSec: { type: 'integer', min: 10, max: 300 },
  senshu: { type: 'boolean' },
  penaltyCategories: { type: 'integer', min: 1, max: 2 },
  penaltyLadder: { type: 'array', items: { type: 'string', max: 6 }, maxItems: 6 },
  qualificationMode: { type: 'enum', values: SETTING_CHOICES.qualificationMode },
  qualificationPoints: { type: 'integer', min: 0, max: 100 },
  finalStage: { type: 'enum', values: SETTING_CHOICES.finalStage },
  resultPublishing: { type: 'enum', values: SETTING_CHOICES.resultPublishing },
  publicVisibility: { type: 'enum', values: SETTING_CHOICES.publicVisibility },
  publicCertificates: { type: 'boolean' },
  entryLockAt: { type: 'string', max: 16, nullable: true, pattern: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/ },
  certificate: { type: 'object' },
  requireWeighInForDraw: { type: 'boolean' },
  weightPrecision: { type: 'integer', min: 0, max: 3 },
  weightUpperInclusive: { type: 'boolean' },
  singlePlayerPolicy: { type: 'enum', values: SETTING_CHOICES.singlePlayerPolicy },
  groupByDivision: { type: 'boolean' },
  allowDuplicatePlayers: { type: 'boolean' },
  attendanceEnabled: { type: 'boolean' },
  notificationChannels: { type: 'object' },
  kataMinScore: { type: 'number', min: 0, max: 100 },
  kataMaxScore: { type: 'number', min: 1, max: 100 },
  kataPrecision: { type: 'integer', min: 0, max: 2 },
  kataComponents: { type: 'boolean' },
  kataTechnicalWeight: { type: 'number', min: 0.05, max: 0.95 },
  kataTieBreak: { type: 'enum', values: KATA_TIE_BREAKS },
}

const CERTIFICATE_SETTINGS = {
  template: { type: 'enum', values: SETTING_CHOICES.certificateTemplate },
  title: { type: 'string', max: 80 },
  signatory1: { type: 'string', max: 60 },
  signatory2: { type: 'string', max: 60 },
  footer: { type: 'string', max: 160, nullable: true },
}
const CHANNEL_SETTINGS = { inApp: { type: 'boolean' }, email: { type: 'boolean' }, sms: { type: 'boolean' }, whatsapp: { type: 'boolean' } }

/** PRD point 16: what each score is worth, 1 to 10 points apiece. */
function pointValues(points) {
  if (points === undefined) return undefined
  const out = validate(points, {
    yuko: { type: 'integer', min: 1, max: 10, required: true },
    wazaAri: { type: 'integer', min: 1, max: 10, required: true },
    ippon: { type: 'integer', min: 1, max: 10, required: true },
  })
  return out
}

// The actor is always the authenticated caller; the request adds where from.
export const withMeta = (req) => ({ ...req.user, role: req.tournamentRole || req.user.role, meta: { ip: clientIp(req), userAgent: userAgent(req) } })

export function tmsRoutes(tms, stores) {
  const loadTournament = async (id) => {
    const t = await stores.tournaments.get(id)
    if (!t) throw notFound('tournament_not_found')
    return t
  }
  const router = Router()
  router.use(requireAuth)
  router.param('tid', tournamentAccess(findUserRecord))

  const tid = (req) => req.params.tid
  const reply = (key) => (value) => ({ [key]: value })

  // --- tournament status, locks, form, settings ----------------------------

  router.patch('/:tid/settings', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const settings = validate(req.body, TOURNAMENT_SETTINGS, { partial: true })
    if (settings.points !== undefined) settings.points = pointValues(settings.points)
    if (settings.certificate !== undefined) settings.certificate = validate(settings.certificate, CERTIFICATE_SETTINGS, { partial: true })
    if (settings.notificationChannels !== undefined) settings.notificationChannels = validate(settings.notificationChannels, CHANNEL_SETTINGS, { partial: true })
    if (settings.kataMinScore != null && settings.kataMaxScore != null && settings.kataMaxScore <= settings.kataMinScore) return res.status(400).json({ error: 'invalid_kataMaxScore' })
    res.json(reply('tournament')(await tms.updateTournament(withMeta(req), tid(req), { settings })))
  })

  router.post('/:tid/lifecycle', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const { to, reason } = validate(req.body, { to: { type: 'enum', values: Object.values(TOURNAMENT_STATUS), required: true }, reason: REASON })
    res.json(reply('tournament')(await tms.setLifecycle(withMeta(req), tid(req), to, reason)))
  })

  // entries (hard lock), soft (coaches only), draw, weighin (PRD v1 §10-11).
  router.post('/:tid/locks/:which', async (req, res, next) => {
    const perm = req.params.which === 'weighin' ? P.WEIGHIN_RECORD : req.params.which === 'soft' ? P.REGISTRATION_MANAGE : P.POOL_MANAGE
    return requirePermission(perm)(req, res, next)
  }, async (req, res) => {
    const { locked, reason } = validate(req.body, { locked: { type: 'boolean', required: true }, reason: REASON })
    const set = { draw: tms.setDrawLock, entries: tms.setEntriesLock, soft: tms.setSoftLock, weighin: tms.setWeighInClosed }[req.params.which]
    if (!set) return res.status(404).json({ error: 'route_not_found' })
    res.json(reply('tournament')(await set(withMeta(req), tid(req), locked, reason)))
  })

  // PRD v1 §7 partner API: issue (or rotate) and revoke the tournament's key.
  // The key is returned once; only a hash is kept, outside the tournament.
  router.get('/:tid/partner-key', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const [row] = await stores.apiKeys.list({ tournamentId: tid(req) })
    res.json({ partnerKey: row ? { hint: row.hint, createdAt: row.createdAt } : null })
  })
  router.post('/:tid/partner-key', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    await loadTournament(tid(req))
    const key = newPartnerKey()
    await stores.apiKeys.removeWhere({ tournamentId: tid(req) })
    const row = await stores.apiKeys.insert({ tournamentId: tid(req), keyHash: partnerKeyHash(key), hint: key.slice(-4) })
    await tms.record(withMeta(req), { tournamentId: tid(req), action: 'tournament.updated', entity: 'tournament', entityId: tid(req), reason: 'partner API key issued' })
    res.status(201).json({ key, partnerKey: { hint: row.hint, createdAt: row.createdAt } })
  })
  router.delete('/:tid/partner-key', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    await stores.apiKeys.removeWhere({ tournamentId: tid(req) })
    await tms.record(withMeta(req), { tournamentId: tid(req), action: 'tournament.updated', entity: 'tournament', entityId: tid(req), reason: 'partner API key revoked' })
    res.status(204).end()
  })

  // PRD v1 §6/§11: is registration open for coaches right now, and why not.
  router.get('/:tid/registration-window', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    res.json({ window: tms.registrationWindow(await loadTournament(tid(req))) })
  })

  // PRD v1 §9: what changing the Master Age Date would do.
  router.post('/:tid/master-date/preview', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const { masterAgeDate } = validate(req.body, { masterAgeDate: { type: 'string', required: true, pattern: DATE, max: 10 } })
    res.json({ preview: await tms.previewMasterDateChange(tid(req), masterAgeDate) })
  })

  // PRD v1 §6: apply a versioned ruleset to this tournament.
  router.post('/:tid/ruleset', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const { rulesetId } = validate(req.body, { rulesetId: { ...ID, required: true } })
    res.json(reply('tournament')(await tms.applyRuleset(withMeta(req), tid(req), rulesetId)))
  })

  router.put('/:tid/registration-form', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const { fields } = req.body || {}
    if (!Array.isArray(fields) || fields.length > 80) return res.status(400).json({ error: 'invalid_fields' })
    res.json(reply('tournament')(await tms.updateForm(withMeta(req), tid(req), fields)))
  })

  // --- age groups and weight categories (sections 7, 9) --------------------

  for (const [path, crud, schema, key] of [
    ['age-groups', tms.ageGroups, AGE_GROUP, 'ageGroup'],
    ['weight-categories', tms.weightCategories, WEIGHT_CATEGORY, 'weightCategory'],
  ]) {
    router.get(`/:tid/${path}`, async (req, res) => res.json({ [`${key}s`]: await crud.list(tid(req)) }))
    router.post(`/:tid/${path}`, requirePermission(P.CATEGORY_CONFIGURE), async (req, res) => {
      res.status(201).json({ [key]: await crud.create(withMeta(req), tid(req), validate(req.body, schema)) })
    })
    router.patch(`/:tid/${path}/:id`, requirePermission(P.CATEGORY_CONFIGURE), async (req, res) => {
      res.json({ [key]: await crud.update(withMeta(req), tid(req), req.params.id, validate(req.body, schema, { partial: true })) })
    })
    router.delete(`/:tid/${path}/:id`, requirePermission(P.RECORD_DELETE), async (req, res) => {
      await crud.remove(withMeta(req), tid(req), req.params.id)
      res.status(204).end()
    })
  }

  // Team members: managers, coaches, judges and referees a team brings.
  router.get('/:tid/team-members', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    res.json({ members: await tms.teamMembers.list(tid(req), { teamId: typeof req.query.teamId === 'string' ? req.query.teamId : null }) })
  })
  router.post('/:tid/team-members', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.status(201).json({ member: await tms.teamMembers.create(withMeta(req), tid(req), validate(req.body, { ...TEAM_MEMBER, teamId: { ...ID, required: true } })) })
  })
  router.patch('/:tid/team-members/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.json({ member: await tms.teamMembers.update(withMeta(req), tid(req), req.params.id, validate(req.body, TEAM_MEMBER, { partial: true })) })
  })
  router.delete('/:tid/team-members/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    await tms.teamMembers.remove(withMeta(req), tid(req), req.params.id)
    res.status(204).end()
  })

  // A standard category set (e.g. SGFI), loaded in one step.
  router.post('/:tid/category-presets', requirePermission(P.CATEGORY_CONFIGURE), async (req, res) => {
    const { preset } = validate(req.body, { preset: { type: 'string', required: true, max: 40 } })
    res.status(201).json(await tms.applyCategoryPreset(withMeta(req), tid(req), preset))
  })

  // --- teams and players (sections 13, 16, 17) ------------------------------

  router.get('/:tid/teams', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ teams: await tms.teams.list(tid(req)) }))
  router.post('/:tid/teams', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.status(201).json({ team: await tms.teams.create(withMeta(req), tid(req), validate(req.body, TEAM)) })
  })
  router.patch('/:tid/teams/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.json({ team: await tms.teams.update(withMeta(req), tid(req), req.params.id, validate(req.body, TEAM, { partial: true })) })
  })
  router.delete('/:tid/teams/:id', requirePermission(P.RECORD_DELETE), async (req, res) => {
    // A team with players needs a reason (sent as ?reason=…).
    const reason = typeof req.query.reason === 'string' ? req.query.reason.trim().slice(0, 300) || null : null
    await tms.teams.remove(withMeta(req), tid(req), req.params.id, reason)
    res.status(204).end()
  })

  router.get('/:tid/players', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    const filter = {}
    for (const key of ['q', 'teamId', 'gender', 'event', 'registrationStatus', 'paymentStatus', 'weighInStatus', 'ageGroupId', 'weightCategoryId', 'club', 'district', 'state', 'country']) {
      if (typeof req.query[key] === 'string' && req.query[key]) filter[key] = req.query[key].slice(0, 120)
    }
    // With ?page, one page and the total (section 62); without, the whole list
    // as before, for exports and the draw screens.
    // Same paging contract as every other list: page from 1, limit, pages.
    if (req.query.page !== undefined) {
      const { page, limit } = readPageQuery(req.query)
      const { rows, total } = await tms.pagePlayers(tid(req), filter, { page: page - 1, pageSize: limit, sort: req.query.sort, dir: req.query.dir })
      return res.json({ players: rows, ...pageMeta({ page, limit, total }) })
    }
    res.json({ players: await tms.listPlayers(tid(req), filter) })
  })
  router.post('/:tid/players', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    res.status(201).json({ player: await tms.createPlayer(withMeta(req), tid(req), playerBody(req.body)) })
  })
  router.patch('/:tid/players/:id', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    res.json({ player: await tms.updatePlayer(withMeta(req), tid(req), req.params.id, playerBody(req.body)) })
  })
  router.delete('/:tid/players/:id', requirePermission(P.RECORD_DELETE), async (req, res) => {
    await tms.removePlayer(withMeta(req), tid(req), req.params.id)
    res.status(204).end()
  })

  // Section 15. The CSV travels as text; the body limit for this route is
  // raised where it is mounted.
  const bulkBody = (req) => validate(req.body, { csv: { type: 'string', required: true, max: 2_000_000, trim: false }, teamId: { ...ID, nullable: true }, confirmDuplicates: { type: 'boolean' } })
  router.post('/:tid/players/bulk/preview', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { csv, teamId } = bulkBody(req)
    res.json(await tms.previewBulk(withMeta(req), tid(req), csv, { teamId }))
  })
  router.post('/:tid/players/bulk', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { csv, teamId, confirmDuplicates } = bulkBody(req)
    res.status(201).json(await tms.importBulk(withMeta(req), tid(req), csv, { teamId, confirmDuplicates }))
  })

  router.post('/:tid/players/:id/registration', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { action, reason } = validate(req.body, {
      action: { type: 'enum', values: ['approve', 'reject', 'request_correction', 'submit', ...Object.values(REGISTRATION_STATUS)], required: true },
      reason: REASON,
    })
    res.json({ player: await tms.setRegistrationStatus(withMeta(req), tid(req), req.params.id, action, reason) })
  })

  // PRD v1 §28: withdrawal after the draw, history kept.
  router.post('/:tid/players/:id/withdraw', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { reason } = validate(req.body, { reason: { type: 'string', required: true, max: 300 } })
    res.json({ player: await tms.withdrawPlayer(withMeta(req), tid(req), req.params.id, reason) })
  })

  router.put('/:tid/players/:id/payment', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const payment = validate(req.body, {
      amount: { type: 'number', min: 0, max: 1_000_000 },
      status: { type: 'enum', values: PAYMENT_STATUS, required: true },
      method: { type: 'string', max: 40, nullable: true },
      transactionId: { type: 'string', max: 80, nullable: true },
      date: { type: 'string', max: 10, pattern: DATE, nullable: true },
      receipt: { type: 'string', max: 200, nullable: true },
    })
    res.json({ player: await tms.recordPayment(withMeta(req), tid(req), req.params.id, payment) })
  })

  router.post('/:tid/players/:id/weigh-in', requirePermission(P.WEIGHIN_RECORD), async (req, res) => {
    const body = validate(req.body, {
      actualWeight: { type: 'number', required: true, min: 1, max: 300 },
      notes: { type: 'string', max: 300, nullable: true },
      status: { type: 'enum', values: WEIGH_IN_STATUS, nullable: true },
    })
    res.json({ player: await tms.recordWeighIn(withMeta(req), tid(req), req.params.id, body) })
  })

  router.put('/:tid/players/:id/entries/:event', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    const { ageGroupId, weightCategoryId, reason } = validate(req.body, {
      ageGroupId: { ...ID, nullable: true }, weightCategoryId: { ...ID, nullable: true }, reason: REASON,
    })
    if (!['kata', 'kumite'].includes(req.params.event)) return res.status(404).json({ error: 'route_not_found' })
    res.json({ player: await tms.overrideCategory(withMeta(req), tid(req), req.params.id, req.params.event, { ageGroupId, weightCategoryId }, reason) })
  })

  // --- categorisation, pools, matches (sections 20-27, 37) ----------------

  router.post('/:tid/categorize', requirePermission(P.POOL_MANAGE), async (req, res) => {
    res.json(await tms.categorize(withMeta(req), tid(req)))
  })
  router.get('/:tid/divisions', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ divisions: await tms.divisions(tid(req)) }))

  router.get('/:tid/pools', async (req, res) => res.json({ pools: await tms.listPools(tid(req)) }))
  router.post('/:tid/pools/generate', requirePermission(P.POOL_MANAGE), async (req, res) => {
    const body = validate(req.body, {
      divisionKey: { type: 'string', max: 200, nullable: true },
      method: { type: 'enum', values: ['random', 'seeded'], nullable: true },
      poolSize: { type: 'integer', min: 2, max: 64, nullable: true },
      seed: { type: 'integer', min: 0, max: 2147483647, nullable: true },
      confirm: { type: 'boolean' },
    })
    const pools = await tms.generatePools(withMeta(req), tid(req), body)
    res.status(201).json({ pools: [...pools], excluded: pools.excluded || [], singles: pools.singles || [] })
  })
  // PRD v1 §28: what a redraw would throw away, before it happens.
  router.get('/:tid/draw/impact', requirePermission(P.POOL_MANAGE), async (req, res) => {
    res.json({ impact: await tms.drawImpact(tid(req), typeof req.query.divisionKey === 'string' ? req.query.divisionKey : null) })
  })
  router.post('/:tid/pools/move', requirePermission(P.POOL_MANAGE), async (req, res) => {
    const body = validate(req.body, { playerId: { ...ID, required: true }, fromPoolId: { ...ID, required: true }, toPoolId: { ...ID, required: true }, reason: REASON, force: { type: 'boolean' } })
    res.json({ pools: await tms.movePlayer(withMeta(req), tid(req), body) })
  })
  // PRD v1 §12 explicit qualification.
  router.post('/:tid/pools/:id/qualifiers', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { playerIds, reason } = validate(req.body, { playerIds: { type: 'array', required: true, items: ID, maxItems: 64, unique: true }, reason: REASON })
    res.json({ pool: await tms.setQualifiers(withMeta(req), tid(req), req.params.id, playerIds, reason) })
  })
  // PRD v1 §28: one player in a category.
  router.post('/:tid/divisions/single-entry', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { divisionKey, decision, reason } = validate(req.body, { divisionKey: { type: 'string', required: true, max: 200 }, decision: { type: 'enum', values: ['award', 'no_competition'], required: true }, reason: REASON })
    res.json(await tms.decideSingleEntry(withMeta(req), tid(req), divisionKey, decision, reason))
  })

  router.get('/:tid/matches', async (req, res) => {
    const filter = {}
    for (const key of ['status', 'mat', 'divisionKey']) if (typeof req.query[key] === 'string') filter[key] = req.query[key]
    // PRD point 20: `?mine=1` for anyone; a referee or judge is held to their
    // own bouts when the tournament says so.
    const t = await loadTournament(tid(req))
    const role = req.tournamentRole || req.user.role
    const official = ['referee', 'judge'].includes(role)
    if (req.query.mine === '1' || (official && t.settings?.officialsSeeAssignedOnly)) filter.officialId = req.user.uid
    let matches = await tms.listMatches(tid(req), filter)
    // PRD v1 §15: a referee sees assigned or open (unassigned) bouts by default.
    if (official && !filter.officialId && req.query.all !== '1') matches = matches.filter((m) => role === 'judge' || !m.refereeId || m.refereeId === req.user.uid)
    res.json({ matches })
  })
  router.post('/:tid/matches/generate', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const body = validate(req.body || {}, { divisionKey: { type: 'string', max: 200, nullable: true } })
    res.status(201).json(await tms.generateMatches(withMeta(req), tid(req), body))
  })
  router.post('/:tid/matches/:id/correct', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { reason, ...result } = validate(req.body, {
      winner: { type: 'enum', values: ['red', 'blue', 'tie'], nullable: true },
      resultType: { type: 'enum', values: RESULT_TYPES, default: 'COMPLETED' },
      avgRed: { type: 'number', min: 0, max: 99, nullable: true },
      avgBlue: { type: 'number', min: 0, max: 99, nullable: true },
      finishReason: { type: 'string', max: 300, nullable: true },
      reason: REASON,
    })
    res.json({ match: await tms.correctResult(withMeta(req), tid(req), req.params.id, result, reason) })
  })

  // PRD v1 §13 match states: called / ready / live / paused.
  router.post('/:tid/matches/:id/status', async (req, res, next) => {
    const role = req.tournamentRole || req.user.role
    return (can(role, P.MATCH_SCORE) || can(role, P.MATCH_CALL) ? next() : res.status(403).json({ error: 'forbidden' }))
  }, async (req, res) => {
    const { status, reason } = validate(req.body, { status: { type: 'enum', values: Object.values(MATCH_STATUS), required: true }, reason: REASON })
    res.json({ match: await tms.setMatchStatus(withMeta(req), tid(req), req.params.id, status, reason) })
  })
  // PRD v1 §4 announcer: attendance.
  router.post('/:tid/matches/:id/attendance', requirePermission(P.ATTENDANCE_MARK), async (req, res) => {
    const { side, present } = validate(req.body, { side: { type: 'enum', values: ['aka', 'ao'], required: true }, present: { type: 'boolean', nullable: true } })
    res.json({ match: await tms.markAttendance(withMeta(req), tid(req), req.params.id, side, present ?? null) })
  })

  router.post('/:tid/matches/:id/call', requirePermission(P.MATCH_CALL), async (req, res) => {
    const { mat } = validate(req.body || {}, { mat: { type: 'integer', min: 1, max: 20, nullable: true } })
    res.json({ match: await tms.callMatch(withMeta(req), tid(req), req.params.id, { mat }) })
  })
  router.get('/:tid/matches/:id/events', requirePermission(P.AUDIT_VIEW), async (req, res) => res.json({ events: await tms.liveEvents(tid(req), req.params.id) }))

  // PRD point 15: put the players in the other corners before the bout.
  router.post('/:tid/matches/:id/swap-corners', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const { reason } = validate(req.body || {}, { reason: REASON })
    res.json({ match: await tms.swapCorners(withMeta(req), tid(req), req.params.id, reason) })
  })

  // --- kata panel (PRD point 19, sections 32-33) ---------------------------

  // Accounts that may sit on this tournament's panels, by seat.
  const panelJudges = async (tournamentId) => (await Promise.all((await listAssignableOfficials())
    .filter((o) => o.role === 'judge' && o.seat)
    .map(async (o) => ({ o, account: await findUserRecord(o.uid) }))))
    .filter(({ account }) => mayAccessTournament(account, tournamentId))
    .map(({ o }) => ({ seat: o.seat, uid: o.uid, email: o.email }))

  router.get('/:tid/kata/divisions', requirePermission(P.KATA_SCORE), async (req, res) => {
    const role = req.tournamentRole || req.user.role
    // A judge sees the rounds they are assigned to (PRD v1 AC-16).
    res.json({ divisions: await tms.kataDivisions(tid(req), role === 'judge' ? { judgeUid: req.user.uid } : {}) })
  })
  router.get('/:tid/kata/judges', requirePermission(P.MATCH_GENERATE), async (req, res) => res.json({ judges: await panelJudges(tid(req)) }))
  router.post('/:tid/kata/rounds', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const { divisionKey, seed, judges, start } = validate(req.body, {
      divisionKey: { type: 'string', required: true, max: 200 }, seed: { type: 'integer', min: 0, max: 2147483647, nullable: true },
      judges: { type: 'array', items: { type: 'object' }, maxItems: 9, nullable: true }, start: { type: 'boolean' },
    })
    // Judges default to the accounts holding each seat for this tournament.
    const assignments = judges ?? (await panelJudges(tid(req))).map(({ seat, uid }) => ({ seat, uid }))
    res.status(201).json({ round: await tms.createKataRound(withMeta(req), tid(req), divisionKey, { seed, judges: assignments, start: !!start }) })
  })
  router.get('/:tid/kata/rounds/:id', requirePermission(P.KATA_SCORE), async (req, res) => res.json({ round: await tms.kataRoundView(tid(req), req.params.id) }))
  router.post('/:tid/kata/rounds/:id/judges', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const { judges } = validate(req.body, { judges: { type: 'array', required: true, items: { type: 'object' }, maxItems: 9 } })
    await tms.assignKataJudges(withMeta(req), tid(req), req.params.id, judges)
    res.json({ round: await tms.kataRoundView(tid(req), req.params.id) })
  })
  router.post('/:tid/kata/rounds/:id/start', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    await tms.startKataRound(withMeta(req), tid(req), req.params.id)
    res.json({ round: await tms.kataRoundView(tid(req), req.params.id) })
  })
  router.post('/:tid/kata/rounds/:id/scores', requirePermission(P.KATA_SCORE), async (req, res) => {
    const body = validate(req.body, {
      playerId: { ...ID, required: true },
      score: { type: 'number', min: 0, max: 100, nullable: true },
      technical: { type: 'number', min: 0, max: 100, nullable: true },
      athletic: { type: 'number', min: 0, max: 100, nullable: true },
      seat: { type: 'integer', min: 1, max: 9, nullable: true },
      submissionId: { type: 'string', max: 80, nullable: true },
    })
    // A judge always scores from their assigned seat, never a seat named in the body.
    const score = await tms.submitKataScore(withMeta(req), tid(req), req.params.id, body)
    res.json({ score, round: await tms.kataRoundView(tid(req), req.params.id) })
  })
  router.post('/:tid/kata/rounds/:id/penalties', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { playerId, deduction, reason } = validate(req.body, { playerId: { ...ID, required: true }, deduction: { type: 'number', required: true, min: 0, max: 10 }, reason: REASON })
    res.json({ round: await tms.setKataPenalty(withMeta(req), tid(req), req.params.id, playerId, deduction, reason) })
  })
  router.post('/:tid/kata/rounds/:id/override', requirePermission(P.RESULT_OVERRIDE), async (req, res) => {
    const { reason, ...body } = validate(req.body, {
      playerId: { ...ID, required: true }, seat: { type: 'integer', required: true, min: 1, max: 9 },
      score: { type: 'number', min: 0, max: 100, nullable: true }, technical: { type: 'number', min: 0, max: 100, nullable: true }, athletic: { type: 'number', min: 0, max: 100, nullable: true },
      reason: { type: 'string', required: true, max: 300 },
    })
    res.json({ round: await tms.overrideKataScore(withMeta(req), tid(req), req.params.id, body, reason) })
  })
  router.post('/:tid/kata/rounds/:id/complete', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    res.json({ round: await tms.completeKataRound(withMeta(req), tid(req), req.params.id) })
  })

  // --- results, brackets, medals, certificates (sections 34-36, 42-44) ---

  // PRD point 21: medals set by hand, always with a reason; `medals: null` clears.
  router.post('/:tid/results/medals/override', requirePermission(P.RESULT_OVERRIDE), async (req, res) => {
    const body = req.body || {}
    const { divisionKey, reason } = validate({ divisionKey: body.divisionKey, reason: body.reason }, {
      divisionKey: { type: 'string', required: true, max: 200 },
      reason: { type: 'string', required: true, max: 300 },
    })
    const medals = body.medals === null ? null : validate({ medals: body.medals }, {
      medals: { type: 'array', required: true, maxItems: 8, items: { type: 'object' } },
    }).medals.map((m) => validate(m, { playerId: { ...ID, required: true }, medal: { type: 'enum', values: ['gold', 'silver', 'bronze'], required: true } }))
    res.json(await tms.overrideMedals(withMeta(req), tid(req), divisionKey, medals, reason))
  })

  router.get('/:tid/results', async (req, res) => res.json({ results: await tms.results(tid(req)) }))
  // PRD v1 §16: an official verifies a category's provisional result.
  router.post('/:tid/results/verify', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { divisionKey, verified } = validate(req.body, { divisionKey: { type: 'string', required: true, max: 200 }, verified: { type: 'boolean', default: true } })
    res.json(await tms.verifyResult(withMeta(req), tid(req), divisionKey, verified))
  })
  // PRD v1 §16: freeze (or, with the override privilege and a reason, unfreeze) one category's result.
  router.post('/:tid/results/lock', requirePermission(P.RESULT_PUBLISH), async (req, res) => {
    const { divisionKey, locked, reason } = validate(req.body, { divisionKey: { type: 'string', required: true, max: 200 }, locked: { type: 'boolean', required: true }, reason: REASON })
    res.json(await tms.setDivisionLock(withMeta(req), tid(req), divisionKey, locked, reason))
  })
  // The bracket screen: every bracket, one bracket, and arranging its first round.
  router.get('/:tid/brackets', async (req, res) => res.json({ brackets: await tms.listBrackets(tid(req)) }))
  router.get('/:tid/bracket', async (req, res) => {
    const key = typeof req.query.divisionKey === 'string' ? req.query.divisionKey : ''
    const bracket = await tms.bracketView(tid(req), key)
    if (!bracket) return res.status(404).json({ error: 'bracket_not_found' })
    const { slots, ...view } = bracket
    res.json({ bracket: view })
  })
  router.put('/:tid/bracket/layout', requirePermission(P.POOL_MANAGE), async (req, res) => {
    const { divisionKey } = validate({ divisionKey: req.body?.divisionKey }, { divisionKey: { type: 'string', required: true, max: 200 } })
    // Places in order; null (or empty) is a bye.
    const layout = req.body?.layout
    if (!Array.isArray(layout) || layout.length > 128 || layout.some((id) => id != null && (typeof id !== 'string' || id.length > 80))) {
      return res.status(400).json({ error: 'invalid_layout' })
    }
    const { slots, ...view } = await tms.arrangeBracket(withMeta(req), tid(req), divisionKey, layout.map((id) => id || null))
    res.json({ bracket: view })
  })

  router.post('/:tid/brackets/generate', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const { divisionKey } = validate(req.body, { divisionKey: { type: 'string', required: true, max: 200 } })
    res.status(201).json({ bracket: await tms.generateBracket(withMeta(req), tid(req), divisionKey) })
  })
  router.post('/:tid/results/publish', requirePermission(P.RESULT_PUBLISH), async (req, res) => {
    const { publish } = validate(req.body || {}, { publish: { type: 'boolean', default: true } })
    res.json(await tms.publishResults(withMeta(req), tid(req), publish))
  })
  router.get('/:tid/medals', async (req, res) => res.json({ medals: await tms.listMedals(tid(req)) }))
  router.get('/:tid/medal-tally', async (req, res) => {
    const by = ['club', 'district', 'state', 'country'].includes(req.query.by) ? req.query.by : 'club'
    res.json({ tally: await tms.tally(tid(req), by) })
  })
  router.get('/:tid/certificates', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    res.json({ certificates: await tms.listCertificates(tid(req), { type: typeof req.query.type === 'string' ? req.query.type : null }) })
  })
  const sendPdf = (res, buffer, filename) => {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(buffer)
  }
  const slugOf = (t) => String(t.slug || t.name || 'tournament').toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const logoOf = async (tournament) => {
    const logoId = String(tournament.logoUrl || '').match(/\/public\/files\/([A-Za-z0-9_-]+)$/)?.[1]
    return logoId ? tms.readFile(null, logoId).then((f) => Buffer.from(f.data, 'base64')).catch(() => null) : null
  }
  const verifyBase = () => process.env.APP_URL || null

  // Section 44 / PRD v1 §18: the certificates as one PDF, built on the server,
  // each with its QR verification link. ?type= narrows to one kind.
  router.get('/:tid/certificates.pdf', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const tournament = await loadTournament(tid(req))
    const type = typeof req.query.type === 'string' ? req.query.type : null
    const certificates = await tms.listCertificates(tid(req), { type })
    await tms.record(withMeta(req), { tournamentId: tid(req), action: 'certificate.downloaded', entity: 'certificates', entityId: type || 'all', after: { count: certificates.length } })
    sendPdf(res, await certificatesPdf(tournament, certificates, { logo: await logoOf(tournament), verifyBase: verifyBase(), settings: tournament.settings?.certificate }), `${slugOf(tournament)}-certificates.pdf`)
  })
  // One certificate, reprinted with the same number.
  router.get('/:tid/certificates/:certificateId.pdf', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const tournament = await loadTournament(tid(req))
    const cert = (await tms.listCertificates(tid(req))).find((c) => c.certificateId === req.params.certificateId)
    if (!cert) return res.status(404).json({ error: 'certificate_not_found' })
    await tms.record(withMeta(req), { tournamentId: tid(req), action: 'certificate.downloaded', entity: 'certificate', entityId: cert.certificateId })
    sendPdf(res, await certificatesPdf(tournament, [cert], { logo: await logoOf(tournament), verifyBase: verifyBase(), settings: tournament.settings?.certificate }), `${cert.certificateId}.pdf`)
  })

  const reportFilters = (query) => Object.fromEntries(REPORT_FILTERS.filter((k) => typeof query[k] === 'string' && query[k]).map((k) => [k, query[k].slice(0, 200)]))

  // Section 45: any report as a PDF table, with the PRD v1 §19 filters.
  router.get('/:tid/reports/:key.pdf', requirePermission(P.REPORT_EXPORT), async (req, res) => {
    if (!REPORT_KEYS.includes(req.params.key)) return res.status(404).json({ error: 'route_not_found' })
    const role = req.tournamentRole || req.user.role
    if (req.params.key === 'audit' && !can(role, P.AUDIT_VIEW)) return res.status(403).json({ error: 'forbidden' })
    const tournament = await loadTournament(tid(req))
    const filters = reportFilters(req.query)
    const rows = buildReport(req.params.key, await loadReportData(tms, tid(req), { audit: req.params.key === 'audit' }), filters)
    await tms.logExport(withMeta(req), tid(req), { report: req.params.key, format: 'pdf', rows: rows.length - 1, filters })
    const title = `${tournament.name} — ${REPORT_TITLE[req.params.key]} report`
    sendPdf(res, await tablePdf(title, rows, { subtitle: `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${rows.length - 1} rows${Object.keys(filters).length ? ` · filtered` : ''}` }), `${slugOf(tournament)}-${req.params.key}.pdf`)
  })
  // The same rows as data, for Excel/CSV in the browser.
  router.get('/:tid/reports/:key', requirePermission(P.REPORT_EXPORT), async (req, res) => {
    if (!REPORT_KEYS.includes(req.params.key)) return res.status(404).json({ error: 'route_not_found' })
    const role = req.tournamentRole || req.user.role
    if (req.params.key === 'audit' && !can(role, P.AUDIT_VIEW)) return res.status(403).json({ error: 'forbidden' })
    res.json({ rows: buildReport(req.params.key, await loadReportData(tms, tid(req), { audit: req.params.key === 'audit' }), reportFilters(req.query)) })
  })
  // PRD v1 §22: an export made in the browser is still an audit event.
  router.post('/:tid/exports', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    const body = validate(req.body, { report: { type: 'string', required: true, max: 60 }, format: { type: 'enum', values: ['xlsx', 'csv', 'pdf'], required: true }, rows: { type: 'integer', min: 0, max: 10_000_000, nullable: true }, filters: { type: 'object', nullable: true } })
    await tms.logExport(withMeta(req), tid(req), body)
    res.status(204).end()
  })

  router.post('/:tid/certificates/generate', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const { types } = validate(req.body || {}, { types: { type: 'array', items: { type: 'enum', values: ['medal', 'participation', 'coach', 'official'] }, maxItems: 4, nullable: true } })
    // Officials: the referees and judges who worked this tournament's bouts and panels.
    let officials = []
    if ((types || []).includes('official')) {
      const worked = new Set()
      for (const m of await tms.listMatches(tid(req))) { if (m.refereeId) worked.add(m.refereeId); (m.judgeIds || []).forEach((j) => worked.add(j)) }
      for (const r of await tms.kataRounds(tid(req))) Object.values(r.judgeAssignments || {}).forEach((uid) => worked.add(uid))
      officials = (await listAssignableOfficials()).filter((o) => worked.has(o.uid)).map((o) => ({ uid: o.uid, name: o.email.split('@')[0].replace(/[._-]+/g, ' '), role: o.role }))
    }
    res.status(201).json(await tms.generateCertificates(withMeta(req), tid(req), { types: types || ['medal'], officials }))
  })
  // --- accreditation passes and QR check-in ----------------------------------

  // Officials who may work this tournament: its referees and judges.
  const tournamentOfficials = async (tournamentId) => (await Promise.all((await listAssignableOfficials())
    .filter((o) => ['referee', 'judge'].includes(o.role))
    .map(async (o) => ({ o, account: await findUserRecord(o.uid) }))))
    .filter(({ account }) => mayAccessTournament(account, tournamentId))
    .map(({ o }) => ({ uid: o.uid, name: o.name || o.email.split('@')[0].replace(/[._-]+/g, ' '), role: o.role }))

  router.post('/:tid/passes/generate', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const { kinds } = validate(req.body || {}, { kinds: { type: 'array', items: { type: 'enum', values: ['player', 'coach', 'official'] }, maxItems: 3, nullable: true } })
    const wanted = kinds || ['player', 'coach']
    const officials = wanted.includes('official') ? await tournamentOfficials(tid(req)) : []
    res.status(201).json(await tms.generatePasses(withMeta(req), tid(req), { kinds: wanted, officials }))
  })
  router.get('/:tid/passes', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const kind = ['player', 'coach', 'official'].includes(req.query.kind) ? req.query.kind : null
    res.json({ passes: await tms.listPasses(tid(req), { kind }) })
  })
  router.get('/:tid/passes.pdf', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const tournament = await loadTournament(tid(req))
    const kind = ['player', 'coach', 'official'].includes(req.query.kind) ? req.query.kind : null
    const passes = await tms.listPasses(tid(req), { kind })
    // Photos uploaded on registration (PNG or JPEG; a PDF is left out).
    const photos = new Map()
    for (const id of new Set(passes.map((p) => p.photoFileId).filter(Boolean))) {
      const file = await tms.readFile(withMeta(req), id, { canViewRegistrations: true }).catch(() => null)
      if (file && ['image/png', 'image/jpeg'].includes(file.type)) photos.set(id, Buffer.from(file.data, 'base64'))
    }
    await tms.logExport(withMeta(req), tid(req), { report: 'passes', format: 'pdf', rows: passes.length, filters: kind ? { kind } : null })
    sendPdf(res, await passesPdf(tournament, passes, { photos, logo: await logoOf(tournament), checkinBase: verifyBase() }), `${slugOf(tournament)}-passes.pdf`)
  })
  // A scanned pass: arrival at the door (registration or weigh-in desk), or
  // presence at the mat for the athlete's next bout.
  router.post('/:tid/checkin', async (req, res, next) => {
    const role = req.tournamentRole || req.user.role
    const point = req.body?.point === 'mat' ? 'mat' : 'arrival'
    const allowed = point === 'mat' ? can(role, P.ATTENDANCE_MARK) : (can(role, P.ATTENDANCE_MARK) || can(role, P.WEIGHIN_RECORD) || can(role, P.REGISTRATION_MANAGE))
    return allowed ? next() : res.status(403).json({ error: 'forbidden' })
  }, async (req, res) => {
    const { code, point } = validate(req.body, { code: { type: 'string', required: true, max: 300 }, point: { type: 'enum', values: ['arrival', 'mat'], default: 'arrival' } })
    res.json(await tms.checkIn(withMeta(req), tid(req), code, { point }))
  })

  router.post('/:tid/certificates/custom', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    const body = validate(req.body, { name: { type: 'string', required: true, max: 120 }, title: { type: 'string', max: 120, nullable: true }, award: { type: 'string', max: 120, nullable: true }, club: { type: 'string', max: 120, nullable: true }, category: { type: 'string', max: 120, nullable: true }, playerId: { ...ID, nullable: true } })
    res.status(201).json({ certificate: await tms.issueCustomCertificate(withMeta(req), tid(req), body) })
  })

  // --- files (sections 5, 12, 17) ---------------------------------------------

  router.post('/:tid/files', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    const body = validate(req.body, FILE_SCHEMA)
    if (body.purpose === 'logo' && !can(req.user.role, P.TOURNAMENT_MANAGE)) return res.status(403).json({ error: 'forbidden' })
    res.status(201).json({ file: await tms.uploadFile(withMeta(req), tid(req), body) })
  })

  // --- link, dashboard, notifications, audit --------------------------------

  router.get('/:tid/registration-link', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => res.json({ link: await tms.getLink(tid(req)) }))
  router.put('/:tid/registration-link', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const body = validate(req.body, {
      regenerate: { type: 'boolean' },
      password: { type: 'string', min: 0, max: 100, nullable: true, trim: false },
      active: { type: 'boolean' },
      expiresAt: { type: 'string', max: 30, nullable: true },
    })
    res.json({ link: await tms.saveLink(withMeta(req), tid(req), body) })
  })

  router.post('/:tid/weigh-in/reminders', requirePermission(P.WEIGHIN_RECORD), async (req, res) => {
    res.json(await tms.sendWeighInReminder(withMeta(req), tid(req)))
  })

  router.get('/:tid/dashboard', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ dashboard: await tms.dashboard(tid(req)) }))
  router.get('/:tid/notifications', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ notifications: await tms.listNotifications(tid(req), 'admin') }))
  router.post('/:tid/notifications/read', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    await tms.markNotificationsRead(tid(req), 'admin')
    res.status(204).end()
  })
  router.get('/:tid/audit', requirePermission(P.AUDIT_VIEW), async (req, res) => {
    if (req.query.page !== undefined) {
      const { page, limit, q } = readPageQuery(req.query)
      const { rows, total } = await tms.pageAudit(tid(req), { page: page - 1, pageSize: limit, q: q || undefined })
      return res.json({ audit: rows, ...pageMeta({ page, limit, total }) })
    }
    res.json({ audit: await tms.auditTrail(tid(req)) })
  })

  return router
}
