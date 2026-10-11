import { installAccounts } from '../auth/users.js'

/**
 * The accounts the test suite signs in as.
 *
 * They live here, in a file vitest loads and the server never does, because
 * the app itself ships no accounts: an installation's first administrator
 * comes from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD and every other
 * account is made through /users. A roster inside `auth/users.js` would be a
 * published password that opens a real event, which is exactly what this
 * arrangement removes.
 *
 * Installed into the in-memory store before each test file runs (vitest
 * `setupFiles`), so a test can sign in as any role without arranging it.
 */
export const TEST_PASSWORD = 'test123'

export const TEST_ROSTER = [
  { uid: 'admin-uid-001', email: 'admin@kata.local', role: 'admin' },
  { uid: 'ref-uid-001', email: 'referee@kata.local', role: 'referee' },
  { uid: 'judge1-uid', email: 'judge1@kata.local', role: 'judge', seat: 1 },
  { uid: 'judge2-uid', email: 'judge2@kata.local', role: 'judge', seat: 2 },
  { uid: 'judge3-uid', email: 'judge3@kata.local', role: 'judge', seat: 3 },
  { uid: 'judge4-uid', email: 'judge4@kata.local', role: 'judge', seat: 4 },
  { uid: 'registrar-uid', email: 'registrar@kata.local', role: 'registration_officer' },
  { uid: 'weighin-uid', email: 'weighin@kata.local', role: 'weighin_officer' },
  { uid: 'announcer-uid', email: 'announcer@kata.local', role: 'announcer' },
  { uid: 'scoreboard-uid', email: 'scoreboard@kata.local', role: 'scoreboard_operator' },
  // Nothing assigned, so it starts out reaching no tournament at all; the
  // scenario seeder hands it one.
  { uid: 'owner-uid', email: 'owner@kata.local', role: 'tournament_owner' },
  { uid: 'superadmin-uid', email: 'superadmin@kata.local', role: 'super_admin' },
  { uid: 'viewer-uid', email: 'viewer@kata.local', role: 'viewer' },
].map((account) => ({ ...account, password: TEST_PASSWORD }))

await installAccounts(TEST_ROSTER)
