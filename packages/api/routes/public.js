import { Router } from 'express'
import { validate } from '../lib/validate.js'
import { rateLimit } from '../lib/rateLimit.js'
import { signCoachToken } from '../auth/jwt.js'
import { sendFile } from './files.js'
import { certificatesPdf } from '../lib/pdf.js'

/**
 * One public tournament view, worked out once and shared by every spectator
 * until something changes (PRD v1 §23: hundreds of phones polling during
 * finals). Concurrent requests wait on the same computation; any write
 * through the stores calls `invalidate`, and a short age limit covers writes
 * made by another server instance. Refusals (an unknown or private
 * tournament) are never cached.
 */
export function publicViewCache(tms, { maxAgeMs = 2000, maxEntries = 500 } = {}) {
  let generation = 0
  const cache = new Map()
  return {
    invalidate() { generation += 1 },
    get(idOrSlug) {
      const key = String(idOrSlug)
      const hit = cache.get(key)
      if (hit && hit.generation === generation && Date.now() - hit.at < maxAgeMs) return hit.promise
      const promise = tms.publicView(key)
      // Serialised once too: the view is large, and stringifying it per
      // request was most of the cost under load.
      const entry = { generation, at: Date.now(), promise, body: promise.then((view) => JSON.stringify(view)) }
      cache.set(key, entry)
      entry.body.catch(() => { if (cache.get(key) === entry) cache.delete(key) })
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value)
      return entry.promise
    },
    /** The same view as JSON text, ready to send. */
    async json(idOrSlug) {
      await this.get(idOrSlug)
      return cache.get(String(idOrSlug))?.body ?? JSON.stringify(await tms.publicView(String(idOrSlug)))
    },
  }
}

/**
 * PRD sections 39 and 54, and the registration link of section 14. No sign-in,
 * so everything here is either read-only and stripped of private fields by the
 * service (Rule 8), or the password check that opens a coach session — which is
 * rate limited like the login it effectively is.
 */
export function publicRoutes(tms, { views = publicViewCache(tms) } = {}) {
  const router = Router()

  const linkAttempts = rateLimit({
    windowMs: 60_000,
    max: 10,
    code: 'too_many_attempts',
    keyOf: (req) => `${req.ip || 'unknown'}|${req.params.token}`,
  })

  router.get('/tournaments', async (req, res) => {
    const org = typeof req.query.org === 'string' && /^[a-z0-9-]{1,60}$/.test(req.query.org) ? req.query.org : null
    res.json({ tournaments: await tms.publicList({ org }) })
  })

  router.get('/tournaments/:idOrSlug', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.type('application/json').send(await views.json(req.params.idOrSlug))
  })

  // PRD v1 §18: the QR on a certificate opens this. Only what the
  // certificate itself already shows.
  const lookups = rateLimit({ windowMs: 60_000, max: 60, code: 'too_many_attempts' })
  router.get('/certificates/:certificateId', lookups, async (req, res) => {
    res.json({ certificate: await tms.verifyCertificate(req.params.certificateId) })
  })

  // PRD v1 §17 "Certificates if enabled": search by name, download your own.
  router.get('/tournaments/:idOrSlug/certificates', lookups, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : ''
    res.json({ certificates: await tms.publicCertificates(req.params.idOrSlug, q) })
  })
  router.get('/tournaments/:idOrSlug/certificates/:certificateId.pdf', lookups, async (req, res) => {
    const view = await views.get(req.params.idOrSlug)
    if (!view.tournament.publicCertificates) return res.status(404).json({ error: 'certificates_not_public' })
    const cert = await tms.verifyCertificate(req.params.certificateId)
    if (cert.tournament?.name !== view.tournament.name || ['coach', 'official'].includes(cert.type)) return res.status(404).json({ error: 'certificate_not_found' })
    const full = { certificateId: cert.certificateId, name: cert.name, club: cert.club, category: cert.category, medal: cert.medal, type: cert.type, title: cert.title, award: cert.award, rank: cert.medal === 'gold' ? 1 : cert.medal === 'silver' ? 2 : cert.medal === 'bronze' ? 3 : null }
    const buffer = await certificatesPdf(view.tournament, [full], { verifyBase: process.env.APP_URL || null })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certificateId}.pdf"`)
    res.send(buffer)
  })

  // Only files marked public (tournament logos); anything else is refused.
  router.get('/files/:id', async (req, res) => sendFile(res, await tms.readFile(null, req.params.id)))

  router.get('/register/:token', async (req, res) => res.json(await tms.linkInfo(req.params.token)))

  router.post('/register/:token/session', linkAttempts, async (req, res) => {
    const { password } = validate(req.body || {}, { password: { type: 'string', min: 0, max: 100, trim: false, nullable: true } })
    const session = await tms.openLink(req.params.token, password || '')
    res.json({ token: signCoachToken(session), tournamentId: session.tournamentId })
  })

  return router
}
