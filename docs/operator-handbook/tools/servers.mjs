// A throwaway copy of the app for the screenshot scripts: the API in memory
// with its test tournaments, and the web front end pointed at it. Nothing is
// written to a database (MONGODB_URI is dropped, and packages/api/.env is not
// read). It uses ports of its own, 4100 and 5273 (SHOT_API_PORT and
// SHOT_WEB_PORT), so a development server already running is left alone.
//
// Set APP_URL or API_URL to use servers you started yourself instead.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const waitFor = async (url, what, child) => {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`${what} stopped while starting (exit ${child.exitCode})`)
    try {
      if ((await fetch(url)).ok) return
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error(`${what} did not start within a minute at ${url}`)
}

/** Starts the app unless APP_URL or API_URL name one; returns { base, api, stop }. */
export async function startApp() {
  if (process.env.APP_URL || process.env.API_URL) {
    return { base: process.env.APP_URL || 'http://localhost:5173', api: process.env.API_URL || 'http://localhost:4000', stop: () => {} }
  }
  const apiPort = Number(process.env.SHOT_API_PORT || 4100)
  const webPort = Number(process.env.SHOT_WEB_PORT || 5273)
  const api = `http://localhost:${apiPort}`
  const base = `http://localhost:${webPort}`

  const { MONGODB_URI, ...env } = process.env
  const children = [
    spawn(process.execPath, ['index.js'], {
      cwd: path.join(ROOT, 'packages', 'api'),
      env: { ...env, SEED_SCENARIOS: 'true', API_RATE_LIMIT: '100000', PORT: String(apiPort) },
      stdio: 'ignore',
    }),
    // Vite through Node, not node_modules/.bin (a .cmd file on Windows), so it starts and stops the same everywhere.
    spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort'], {
      cwd: path.join(ROOT, 'packages', 'web'),
      env: { ...env, VITE_SERVER_URL: api },
      stdio: 'ignore',
    }),
  ]
  const stop = () => { for (const c of children) if (c.exitCode === null) c.kill() }
  process.on('exit', stop)
  try {
    console.log(`Starting the app with its test tournaments: API ${api}, web ${base}`)
    await waitFor(`${api}/health`, 'The API', children[0])
    await waitFor(base, 'The web front end', children[1])
  } catch (err) {
    stop()
    throw err
  }
  return { base, api, stop }
}
