import { Router } from 'express'
import { requireAuth, requireCoach } from '../auth/middleware.js'
import { validate } from '../lib/validate.js'
import { signCoachToken } from '../auth/jwt.js'
import { createCoachAccount } from '../auth/users.js'
import { badRequest } from '../lib/errors.js'
import { playerBody, withMeta } from './tms.js'
import { FILE_SCHEMA, sendFile } from './files.js'
import { certificatesPdf } from '../lib/pdf.js'

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

  // PRD v1 §7: a team manager may keep a login of their own instead of the
  // shared link, scoped to this tournament and team. Signing in with it later
  // opens the same coach session.
  router.post('/account', async (req, res) => {
    if (!req.user.teamId) throw badRequest('team_required')
    const { email, password } = validate(req.body, { email: { type: 'string', required: true, max: 200, lowercase: true }, password: { type: 'string', required: true, min: 8, max: 100, trim: false } })
    const account = await createCoachAccount({ email, password, tournamentId: t(req), teamId: req.user.teamId })
    await tms.record(withMeta(req), { tournamentId: t(req), action: 'user.changed', entity: 'user', entityId: account.uid, after: { email: account.email, role: 'coach', teamId: account.teamId }, reason: 'coach account created' })
    res.status(201).json({ account })
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

  // The team's certificates, and one at a time as a PDF (same number as the organisers').
  const PUBLIC_CERT = ['certificateId', 'type', 'title', 'name', 'club', 'category', 'medal', 'award', 'issuedAt']
  router.get('/certificates', async (req, res) => {
    const { certificates } = await tms.coachCertificates(req.user)
    res.json({ certificates: certificates.map((c) => Object.fromEntries(PUBLIC_CERT.map((k) => [k, c[k] ?? null]))) })
  })
  router.get('/certificates/:certificateId.pdf', async (req, res) => {
    const { tournament, certificates } = await tms.coachCertificates(req.user)
    const cert = certificates.find((c) => c.certificateId === req.params.certificateId)
    if (!cert) return res.status(404).json({ error: 'certificate_not_found' })
    await tms.record(withMeta(req), { tournamentId: tournament.id, action: 'certificate.downloaded', entity: 'certificate', entityId: cert.certificateId })
    const buffer = await certificatesPdf(tournament, [cert], { verifyBase: process.env.APP_URL || null, settings: tournament.settings?.certificate })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certificateId}.pdf"`)
    res.send(buffer)
  })

  const bulkBody = (req) => validate(req.body, { csv: { type: 'string', required: true, max: 2_000_000, trim: false }, confirmDuplicates: { type: 'boolean' } })
  router.post('/players/bulk/preview', async (req, res) => res.json(await tms.previewBulk(withMeta(req), t(req), bulkBody(req).csv)))
  router.post('/players/bulk', async (req, res) => {
    const { csv, confirmDuplicates } = bulkBody(req)
    res.status(201).json(await tms.importBulk(withMeta(req), t(req), csv, { confirmDuplicates }))
  })

  return router
}
