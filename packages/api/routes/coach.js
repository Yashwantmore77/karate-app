import { Router } from 'express'
import { requireAuth, requireCoach } from '../auth/middleware.js'
import { validate } from '../lib/validate.js'
import { signCoachToken } from '../auth/jwt.js'
import { playerBody, withMeta } from './tms.js'
import { FILE_SCHEMA, sendFile } from './files.js'

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
 * PRD section 52, the coach / team manager panel. Every call acts as the coach
 * the token names, inside the one tournament it was issued for; the service
 * refuses another team's players and anything after the registration lock.
 */
export function coachRoutes(tms) {
  const router = Router()
  router.use(requireAuth, requireCoach)

  const t = (req) => req.user.tournamentId

  router.get('/me', async (req, res) => res.json(await tms.coachOverview(req.user)))

  // Registering the team re-issues the session with the team in it.
  router.post('/team', async (req, res) => {
    const team = await tms.teams.create(withMeta(req), t(req), validate(req.body, { ...TEAM, termsAccepted: { type: 'boolean' } }))
    res.status(201).json({ team, token: signCoachToken({ linkId: req.user.linkId, tournamentId: t(req), teamId: team.id }) })
  })
  router.patch('/team', async (req, res) => {
    res.json({ team: await tms.teams.update(withMeta(req), t(req), req.user.teamId, validate(req.body, TEAM, { partial: true })) })
  })

  router.post('/players', async (req, res) => {
    res.status(201).json({ player: await tms.createPlayer(withMeta(req), t(req), playerBody(req.body)) })
  })
  router.patch('/players/:id', async (req, res) => {
    res.json({ player: await tms.updatePlayer(withMeta(req), t(req), req.params.id, playerBody(req.body)) })
  })
  router.delete('/players/:id', async (req, res) => {
    await tms.removePlayer(withMeta(req), t(req), req.params.id)
    res.status(204).end()
  })

  router.post('/files', async (req, res) => {
    res.status(201).json({ file: await tms.uploadFile(withMeta(req), t(req), validate(req.body, FILE_SCHEMA)) })
  })
  router.get('/files/:id', async (req, res) => sendFile(res, await tms.readFile(req.user, req.params.id)))

  const bulkBody = (req) => validate(req.body, { csv: { type: 'string', required: true, max: 2_000_000, trim: false } })
  router.post('/players/bulk/preview', async (req, res) => res.json(await tms.previewBulk(withMeta(req), t(req), bulkBody(req).csv)))
  router.post('/players/bulk', async (req, res) => res.status(201).json(await tms.importBulk(withMeta(req), t(req), bulkBody(req).csv)))

  return router
}
