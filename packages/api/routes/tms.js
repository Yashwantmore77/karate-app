import { Router } from 'express'
import { requireAuth, requirePermission, tournamentAccess } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { validate } from '../lib/validate.js'
import { clientIp, userAgent } from '../lib/requestMeta.js'
import { PERMISSION as P } from '@kumite/shared/permissions.js'
import { TOURNAMENT_STATUS, REGISTRATION_STATUS } from '@kumite/shared/lifecycle.js'
import { PAYMENT_STATUS, WEIGH_IN_STATUS, RESULT_TYPES } from '@kumite/shared/tms.js'

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
}

const WEIGHT_CATEGORY = {
  ageGroupId: { ...ID, required: true },
  name: { type: 'string', required: true, max: 40 },
  label: { type: 'string', max: 60, nullable: true },
  minWeight: { type: 'number', min: 0, max: 300, nullable: true },
  maxWeight: { type: 'number', min: 0, max: 300, nullable: true },
  active: { type: 'boolean', default: true },
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
  fees: { type: 'object' },
}

// The actor is always the authenticated caller; the request adds where from.
export const withMeta = (req) => ({ ...req.user, meta: { ip: clientIp(req), userAgent: userAgent(req) } })

export function tmsRoutes(tms) {
  const router = Router()
  router.use(requireAuth)
  router.param('tid', tournamentAccess(findUserRecord))

  const tid = (req) => req.params.tid
  const reply = (key) => (value) => ({ [key]: value })

  // --- tournament status, locks, form, settings ----------------------------

  router.patch('/:tid/settings', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const settings = validate(req.body, TOURNAMENT_SETTINGS, { partial: true })
    res.json(reply('tournament')(await tms.updateTournament(withMeta(req), tid(req), { settings })))
  })

  router.post('/:tid/lifecycle', requirePermission(P.TOURNAMENT_MANAGE), async (req, res) => {
    const { to, reason } = validate(req.body, { to: { type: 'enum', values: Object.values(TOURNAMENT_STATUS), required: true }, reason: REASON })
    res.json(reply('tournament')(await tms.setLifecycle(withMeta(req), tid(req), to, reason)))
  })

  router.post('/:tid/locks/:which', requirePermission(P.POOL_MANAGE), async (req, res) => {
    const { locked, reason } = validate(req.body, { locked: { type: 'boolean', required: true }, reason: REASON })
    const set = req.params.which === 'draw' ? tms.setDrawLock : req.params.which === 'entries' ? tms.setEntriesLock : null
    if (!set) return res.status(404).json({ error: 'route_not_found' })
    res.json(reply('tournament')(await set(withMeta(req), tid(req), locked, reason)))
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
    router.delete(`/:tid/${path}/:id`, requirePermission(P.CATEGORY_CONFIGURE), async (req, res) => {
      await crud.remove(withMeta(req), tid(req), req.params.id)
      res.status(204).end()
    })
  }

  // --- teams and players (sections 13, 16, 17) ------------------------------

  router.get('/:tid/teams', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ teams: await tms.teams.list(tid(req)) }))
  router.post('/:tid/teams', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.status(201).json({ team: await tms.teams.create(withMeta(req), tid(req), validate(req.body, TEAM)) })
  })
  router.patch('/:tid/teams/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    res.json({ team: await tms.teams.update(withMeta(req), tid(req), req.params.id, validate(req.body, TEAM, { partial: true })) })
  })
  router.delete('/:tid/teams/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    await tms.teams.remove(withMeta(req), tid(req), req.params.id)
    res.status(204).end()
  })

  router.get('/:tid/players', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    const filter = {}
    for (const key of ['q', 'teamId', 'gender', 'event', 'registrationStatus', 'paymentStatus', 'weighInStatus', 'ageGroupId', 'weightCategoryId', 'club', 'district', 'state', 'country']) {
      if (typeof req.query[key] === 'string' && req.query[key]) filter[key] = req.query[key].slice(0, 120)
    }
    res.json({ players: await tms.listPlayers(tid(req), filter) })
  })
  router.post('/:tid/players', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    res.status(201).json({ player: await tms.createPlayer(withMeta(req), tid(req), playerBody(req.body)) })
  })
  router.patch('/:tid/players/:id', requirePermission(P.PLAYER_EDIT), async (req, res) => {
    res.json({ player: await tms.updatePlayer(withMeta(req), tid(req), req.params.id, playerBody(req.body)) })
  })
  router.delete('/:tid/players/:id', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    await tms.removePlayer(withMeta(req), tid(req), req.params.id)
    res.status(204).end()
  })

  // Section 15. The CSV travels as text; the body limit for this route is
  // raised where it is mounted.
  const bulkBody = (req) => validate(req.body, { csv: { type: 'string', required: true, max: 2_000_000, trim: false }, teamId: { ...ID, nullable: true } })
  router.post('/:tid/players/bulk/preview', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { csv, teamId } = bulkBody(req)
    res.json(await tms.previewBulk(withMeta(req), tid(req), csv, { teamId }))
  })
  router.post('/:tid/players/bulk', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { csv, teamId } = bulkBody(req)
    res.status(201).json(await tms.importBulk(withMeta(req), tid(req), csv, { teamId }))
  })

  router.post('/:tid/players/:id/registration', requirePermission(P.REGISTRATION_MANAGE), async (req, res) => {
    const { action, reason } = validate(req.body, {
      action: { type: 'enum', values: ['approve', 'reject', 'request_correction', 'submit', ...Object.values(REGISTRATION_STATUS)], required: true },
      reason: REASON,
    })
    res.json({ player: await tms.setRegistrationStatus(withMeta(req), tid(req), req.params.id, action, reason) })
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
      method: { type: 'enum', values: ['random', 'seeded'], default: 'random' },
      poolSize: { type: 'integer', min: 2, max: 64, nullable: true },
      seed: { type: 'integer', min: 0, max: 2147483647, nullable: true },
    })
    res.status(201).json({ pools: await tms.generatePools(withMeta(req), tid(req), body) })
  })
  router.post('/:tid/pools/move', requirePermission(P.POOL_MANAGE), async (req, res) => {
    const body = validate(req.body, { playerId: { ...ID, required: true }, fromPoolId: { ...ID, required: true }, toPoolId: { ...ID, required: true }, reason: REASON })
    res.json({ pools: await tms.movePlayer(withMeta(req), tid(req), body) })
  })

  router.get('/:tid/matches', async (req, res) => {
    const filter = {}
    for (const key of ['status', 'mat', 'divisionKey']) if (typeof req.query[key] === 'string') filter[key] = req.query[key]
    res.json({ matches: await tms.listMatches(tid(req), filter) })
  })
  router.post('/:tid/matches/generate', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const body = validate(req.body || {}, { divisionKey: { type: 'string', max: 200, nullable: true } })
    res.status(201).json(await tms.generateMatches(withMeta(req), tid(req), body))
  })
  router.patch('/:tid/matches/:id/schedule', requirePermission(P.MATCH_GENERATE), async (req, res) => {
    const body = validate(req.body, {
      mat: { type: 'integer', min: 1, max: 99, nullable: true },
      scheduledAt: { type: 'string', max: 30, nullable: true },
      refereeId: { ...ID, nullable: true },
      judgeIds: { type: 'array', items: { type: 'string', max: 80 }, max: 9 },
    }, { partial: true })
    if (body.judgeIds) body.judgeIds = [...new Set(body.judgeIds)]
    res.json({ match: await tms.scheduleMatch(withMeta(req), tid(req), req.params.id, body) })
  })
  router.post('/:tid/matches/:id/correct', requirePermission(P.RESULT_MANAGE), async (req, res) => {
    const { reason, ...result } = validate(req.body, {
      winner: { type: 'enum', values: ['red', 'blue', 'tie'], nullable: true },
      resultType: { type: 'enum', values: RESULT_TYPES, default: 'COMPLETED' },
      avgRed: { type: 'number', min: 0, max: 99, nullable: true },
      avgBlue: { type: 'number', min: 0, max: 99, nullable: true },
      reason: REASON,
    })
    res.json({ match: await tms.correctResult(withMeta(req), tid(req), req.params.id, result, reason) })
  })

  // --- results, brackets, medals, certificates (sections 34-36, 42-44) ---

  router.get('/:tid/results', async (req, res) => res.json({ results: await tms.results(tid(req)) }))
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
  router.get('/:tid/certificates', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => res.json({ certificates: await tms.listCertificates(tid(req)) }))
  router.post('/:tid/certificates/generate', requirePermission(P.CERTIFICATE_GENERATE), async (req, res) => {
    res.status(201).json(await tms.generateCertificates(withMeta(req), tid(req)))
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

  router.get('/:tid/dashboard', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ dashboard: await tms.dashboard(tid(req)) }))
  router.get('/:tid/notifications', requirePermission(P.REGISTRATION_VIEW), async (req, res) => res.json({ notifications: await tms.listNotifications(tid(req), 'admin') }))
  router.post('/:tid/notifications/read', requirePermission(P.REGISTRATION_VIEW), async (req, res) => {
    await tms.markNotificationsRead(tid(req), 'admin')
    res.status(204).end()
  })
  router.get('/:tid/audit', requirePermission(P.AUDIT_VIEW), async (req, res) => res.json({ audit: await tms.auditTrail(tid(req)) }))

  return router
}
