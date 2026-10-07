import { Router } from 'express'
import { requireAuth, mayAccessTournament, tournamentFor } from '../auth/middleware.js'
import { findUserRecord } from '../auth/users.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'

/**
 * Sends a stored file. Served inline but sandboxed: even a PDF with script
 * in it gets no origin to run against, and the type is the one checked at
 * upload, never a guess from the name.
 */
export function sendFile(res, file) {
  res.setHeader('Content-Type', file.type)
  res.setHeader('Content-Disposition', `inline; filename="${file.name.replace(/"/g, '')}"`)
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Cache-Control', file.public ? 'public, max-age=3600' : 'private, no-store')
  res.send(Buffer.from(file.data, 'base64'))
}

/** GET /files/:id for signed-in staff and coaches (PRD 17: view documents). */
export function fileRoutes(tms) {
  const router = Router()
  router.use(requireAuth)
  router.get('/:id', async (req, res) => {
    if (req.user.role === 'coach') return sendFile(res, await tms.readFile(req.user, req.params.id))
    const account = await findUserRecord(req.user.uid)
    const file = await tms.readFile(req.user, req.params.id, { canViewRegistrations: can(account?.role, P.REGISTRATION_VIEW) })
    if (!file.public && !mayAccessTournament(account, file.tournamentId, account?.organizationId ? await tournamentFor(file.tournamentId) : null)) return res.status(403).json({ error: 'tournament_forbidden' })
    return sendFile(res, file)
  })
  return router
}

export const FILE_SCHEMA = {
  name: { type: 'string', required: true, max: 200 },
  type: { type: 'string', required: true, max: 60 },
  data: { type: 'string', required: true, max: 3_000_000, trim: false },
  purpose: { type: 'enum', values: ['logo', 'player'], default: 'player' },
}
