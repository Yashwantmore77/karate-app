// What the scripts that drive the API (mock, loadtest, demo) share.

import { randomBytes, randomUUID } from 'node:crypto'

/** `--name value` from the command line; a bare `--name` is true. */
export const opt = (name, fallback) => {
  const args = process.argv.slice(2)
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

/** The API in this process on a free port. `prepare` gets its stores before it listens. */
export async function startLocal(prepare = async () => {}) {
  // A script's simulated crowd shares one address, which the API rate limit
  // would otherwise (correctly) throttle.
  process.env.API_RATE_LIMIT = process.env.API_RATE_LIMIT || '1000000'
  const { createApp } = await import('../index.js')
  const { http, stores } = createApp()
  await prepare(stores)
  const port = await new Promise((resolve) => http.listen(0, () => resolve(http.address().port)))
  return { url: `http://localhost:${port}`, close: () => new Promise((resolve) => http.close(resolve)) }
}

/**
 * The administrator a script runs as.
 *
 * Against a real server (--url) it has to be given one, because that server's
 * accounts live in its database: --email and --password, or the two variables
 * named in `env`. Against its own in-process server it makes a throwaway
 * administrator with a password generated for this run, so no script carries
 * an account or a password of its own.
 */
export async function scriptAdmin({ email, password, local, env = ['BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD'] }) {
  if (email && password) return { email, password }
  if (!local) {
    const [emailVar, passwordVar] = env
    const fromEnv = { email: process.env[emailVar], password: process.env[passwordVar] }
    if (fromEnv.email && fromEnv.password) return fromEnv
    throw new Error(`Give an administrator to sign in as: --email and --password, or ${emailVar} and ${passwordVar} in packages/api/.env.`)
  }
  const { createUser } = await import('../auth/users.js')
  const made = { email: `script-${randomUUID().slice(0, 8)}@localhost.test`, password: randomBytes(18).toString('base64url') }
  await createUser({ ...made, role: 'admin' })
  return made
}
