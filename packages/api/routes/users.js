import { Router } from 'express'
import { listUsers, createUser, updateUser, deleteUser } from '../auth/users.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { badRequest } from '../lib/errors.js'

/**
 * Account administration. There is no self-service signup anywhere in the
 * system by design: accounts exist because an administrator created them, so
 * every route here is behind the admin gate.
 */
export function userRoutes() {
  const router = Router()
  router.use(requireAuth, requireRole('admin'))

  router.get('/', async (_req, res) => res.json({ users: await listUsers() }))

  router.post('/', async (req, res) => {
    res.status(201).json({ user: await createUser(req.body) })
  })

  router.patch('/:uid', async (req, res) => {
    res.json({ user: await updateUser(req.params.uid, req.body) })
  })

  router.delete('/:uid', async (req, res) => {
    // Removing your own account would leave the admin surface unreachable if
    // you were the only administrator, and there is no way back in from here.
    if (req.params.uid === req.user.uid) throw badRequest('cannot_delete_self')
    await deleteUser(req.params.uid)
    res.status(204).end()
  })

  return router
}
