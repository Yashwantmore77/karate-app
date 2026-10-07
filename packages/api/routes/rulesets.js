import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { can, PERMISSION as P } from '@kumite/shared/permissions.js'
import { validate } from '../lib/validate.js'
import { forbidden } from '../lib/errors.js'

// PRD v1 §6, §14, §24: versioned rulesets. Everyone on staff can read them
// (a tournament admin picks one); only those with the ruleset privilege
// (the super admin) write them.

const RULESET = {
  name: { type: 'string', required: true, min: 2, max: 80 },
  description: { type: 'string', max: 400, nullable: true },
  kumite: { type: 'object', required: true },
  kata: { type: 'object', required: true },
}

export function rulesetRoutes(tms) {
  const router = Router()
  router.use(requireAuth)
  const manage = (req, _res, next) => next(can(req.user.role, P.RULESET_MANAGE) ? undefined : forbidden())
  const staff = (req, _res, next) => next(req.user.role === 'coach' ? forbidden() : undefined)

  router.get('/', staff, async (req, res) => res.json({ rulesets: await tms.listRulesets({ includeSuperseded: req.query.all === '1' }) }))
  router.post('/', manage, async (req, res) => {
    res.status(201).json({ ruleset: await tms.createRuleset(req.user, validate(req.body, RULESET)) })
  })
  router.patch('/:id', manage, async (req, res) => {
    res.json({ ruleset: await tms.updateRuleset(req.user, req.params.id, validate(req.body, RULESET, { partial: true })) })
  })
  router.post('/:id/active', manage, async (req, res) => {
    const { active } = validate(req.body, { active: { type: 'boolean', required: true } })
    res.json({ ruleset: await tms.setRulesetActive(req.user, req.params.id, active) })
  })
  return router
}
