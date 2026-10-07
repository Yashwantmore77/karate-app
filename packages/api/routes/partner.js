import { Router } from 'express'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { validate } from '../lib/validate.js'
import { rateLimit } from '../lib/rateLimit.js'
import { unauthorized, notFound } from '../lib/errors.js'
import { playerBody } from './tms.js'

// PRD v1 §7 "Optional partner API import": a federation or club system pushes
// entries with the tournament's API key. Same validation, duplicate review
// and audit as any other entry; the key can be revoked at any time.

const hash = (key) => createHash('sha256').update(String(key)).digest()

export function partnerRoutes(tms, stores) {
  const router = Router()
  const limit = rateLimit({ windowMs: 60_000, max: 120, code: 'too_many_requests', keyOf: (req) => `${req.ip}|${req.params.tid}` })

  const authorise = async (req) => {
    const t = await stores.tournaments.get(req.params.tid)
    if (!t) throw notFound('tournament_not_found')
    const key = String(req.headers['x-api-key'] || '')
    // Kept apart from the tournament document, so no tournament response can
    // ever carry it.
    const [row] = await stores.apiKeys.list({ tournamentId: t.id })
    if (!row?.keyHash || !key) throw unauthorized('invalid_api_key')
    const given = hash(key)
    const stored = Buffer.from(row.keyHash, 'hex')
    if (stored.length !== given.length || !timingSafeEqual(stored, given)) throw unauthorized('invalid_api_key')
    return t
  }

  router.post('/tournaments/:tid/players', limit, async (req, res) => {
    const t = await authorise(req)
    const actor = { uid: `partner:${t.id}`, role: 'partner', meta: { ip: req.ip } }
    const { team, players, confirmDuplicates } = validate(req.body, {
      team: { type: 'object', required: true },
      players: { type: 'array', required: true, maxItems: 500, items: { type: 'object' } },
      confirmDuplicates: { type: 'boolean' },
    })
    const teamBody = validate(team, { name: { type: 'string', required: true, max: 120 }, club: { type: 'string', max: 120, nullable: true }, coachName: { type: 'string', max: 120, nullable: true }, district: { type: 'string', max: 80, nullable: true }, state: { type: 'string', max: 80, nullable: true }, country: { type: 'string', max: 80, nullable: true } })
    let teamRow = (await tms.teams.list(t.id)).find((x) => x.name.trim().toLowerCase() === teamBody.name.trim().toLowerCase())
    if (!teamRow) teamRow = await tms.teams.create(actor, t.id, teamBody)
    const created = []
    const rejected = []
    for (const [i, raw] of players.entries()) {
      try {
        created.push(await tms.createPlayer(actor, t.id, { ...playerBody(raw), teamId: teamRow.id, ...(confirmDuplicates ? { confirmDuplicate: true } : {}) }))
      } catch (err) {
        rejected.push({ index: i, error: err.code || 'rejected', details: err.details || null })
      }
    }
    await tms.record(actor, { tournamentId: t.id, action: 'players.partner_import', entity: 'tournament', entityId: t.id, after: { team: teamRow.name, created: created.length, rejected: rejected.length } })
    res.status(created.length ? 201 : 400).json({ team: { id: teamRow.id, name: teamRow.name, teamNumber: teamRow.teamNumber }, created: created.map((p) => ({ id: p.id, playerNumber: p.playerNumber, name: p.name })), rejected })
  })

  return router
}

export const partnerKeyHash = (key) => hash(key).toString('hex')

/** A fresh partner key: shown once, only its hash is stored. */
export const newPartnerKey = () => `kpk_${randomBytes(24).toString('base64url')}`
