import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The server has no DOM; this only exists to override the API-only
    // default some editors assume from a shared root config. No jsdom, no
    // per-file `// @vitest-environment node` pragma needed.
    environment: 'node',
    // The app ships no accounts, so the roster the tests sign in with is
    // installed here rather than living in `auth/users.js`.
    setupFiles: ['./test/roster.js'],
  },
})
