# Security review

This is an internal code review of the API, the shared service and the web app, done before the first event.
It is **not** a penetration test. An outside test against a staging copy is still recommended before a large public event (see *Still to do*).

Each fix below has a test in `packages/api/security.test.js`, `packages/api/prdv1.test.js` or `packages/shared/prdv1.test.js`.

## Findings fixed

### 1. Demo accounts with a published password were seeded into production — critical

**Problem.** On first connect to an empty MongoDB, the server created 13 demo accounts, all with the password `test123`. These included a super admin. The password appears in this repository.

**Fix:**
- Production (`NODE_ENV=production`) never seeds them.
- An empty production database gets one super admin, from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters).
- Staging can still opt in with `SEED_DEMO_ACCOUNTS=true`.
- At startup, production logs a warning naming any demo account that still has the demo password.

> **Action for any database created before this fix:** sign in as the super admin and change or delete every `@kata.local` account. The server's startup warning lists the ones still exposed.

### 2. Any referee could score any bout — high (PRD v1 AC-14)

**Problem.** Taking control of a mat over the live socket, and the REST route that records results (`PATCH /matches/:id`), checked only that the account was *a* referee. A referee from another tournament or organisation, or one not on that bout, could take over the mat and change the score.

**Fix.** Both routes use one rule (`auth/matchAccess.js`). Control goes only to:
- a super admin,
- an admin of that tournament,
- the referee assigned to the bout, or any referee of that tournament on a bout nobody is assigned to yet.

**Behaviour changes:**
- The check uses the role the account holds *in that tournament*, so tournament-scoped referees work.
- Score commands require actually holding the mat.
- A made-up bout id no longer opens a room or writes live-state rows.
- The category-level match routes (list, create, draw) are limited to tournaments the account can access.

### 3. A tournament role crossed the organisation boundary — high (multi-organisation)

**Problem.** An organisation's admin could give an account a role in *another* organisation's tournament. That role was checked before the organisation boundary, so it granted access.

**Fix:**
- Access checks now apply the organisation boundary first.
- The account routes refuse tournament roles and assignments that name tournaments outside the admin's own organisation.

### 4. Spreadsheet formula injection in CSV exports — medium

**Problem.** Coaches type names and clubs. A value such as `=HYPERLINK(…)` in an exported CSV runs as a formula when an organiser opens the file in Excel.

**Fix:**
- Every CSV *export* (list exports, reports, the upload error report) neutralises formula-like cells with a leading apostrophe.
- Ordinary values such as `-35 KG` or `+91 …` are left alone.
- Imports are unchanged.
- Excel (.xlsx) exports already store cells as text, not formulas.

### 5. Regular-expression denial of service in form fields — medium

**Problem.** An admin-defined field pattern such as `(a+)+` could make validating a coach's input take minutes and stall the server.

**Fix.** Patterns with nested quantifiers or backreferences are refused.

### 6. A weak or missing JWT secret was allowed in production — medium

**Problem.**
- A missing secret meant every restart signed all referees out mid-event.
- A short secret is guessable, which would let anyone mint an admin token.

**Fix.** In production the server refuses to start without a `JWT_SECRET` of 32 or more characters.

### 7. Smaller hardening — low

- **Idempotency replay:** only signed-in requests are replayed, keyed on the whole token. Before, anonymous requests were keyed on the caller's address, so two people on the same venue Wi-Fi could in principle receive each other's response.
- **Browser retries:** browsers may now send the `Idempotency-Key` header cross-origin, so their retries are protected too.
- **Headers:** responses default to `Cache-Control: no-store`; production adds `Strict-Transport-Security`.
- **Load:** the public tournament page is computed once and shared until data changes. Before, 600 polling spectators pushed response times past 10 seconds, a denial of service needing no account (see *Load test* below).

### 8. Second review (October): the scoring app's own routes, and business rules

The routes that address categories, entrants and bouts by id (`/categories/:id`,
`/competitors`, `/matches`) predate the tournament system and were missing its checks.

| Finding | Severity | Fix |
| --- | --- | --- |
| An admin of one organisation could read, change or delete another organisation's categories, entrants and bouts by id; `GET /matches` listed every organisation's bouts | High | Every route resolves the record to its tournament and checks the caller's reach (`api/auth/categoryAccess.js`); the event-wide list pages only the caller's tournaments; coach sessions are refused |
| Deleting a bout had no audit entry and worked on finished, published or locked results | High | Recorded in the audit log; a fought bout needs a reason and the score-correction privilege, and respects result locks; a bout of a locked draw is refused |
| The old routes ignored the draw and closed tournaments | High | A category drawn by the tournament system is changed only through its draw; archived tournaments are read-only, completed ones take nothing new; categories and entrants with results are not deleted |
| Live scoring was accepted for completed and archived tournaments | High | Refused and audited (`tournament_closed`) |
| Deleting a tournament worked while live and left passes, kata scores, live logs, result records and coach logins behind | High | Refused while live; everything it owns is removed; the deletion is in the system audit log |
| A coach could change an approved player's details and keep the approval | Medium | Sent back to verification, audited, organisers notified |
| Adding an event after payment kept the player marked paid | Medium | The balance due (or refund due) is recorded and shown |
| Team email and mobile were not validated; tournament dates were not cross-checked | Medium | Validated on the server and in both team forms; registration closes and weigh-in happens by the last day |
| An official on unfinished bouts could be deleted or change role; an admin could demote themselves | Medium | Refused with the number of bouts; own role changes refused |
| Deleting a team silently deleted its players | Medium | Coaches only remove empty teams; organisers give a reason, kept with the names |
| A refused schedule lost what was typed and did not say what clashed; some Save buttons could be pressed twice | Low | The dialog stays open and names the clash; Save is disabled while saving |

Tests: `api/integrity.test.js`, `shared/integrity.test.js`.

### 9. Review of the tournament-type, bracket, team-member and SGFI changes

| Finding | Severity | Fix |
| --- | --- | --- |
| A player could enter an event the tournament does not hold (Kata in a Kumite-only event), which the type-based tabs would then hide | Medium | Entries, edits and bulk uploads accept only the events the type holds; bulk rows are flagged in the preview with their row number |
| Changing the type could drop an event players had already entered | Medium | Refused with the number of players (`type_has_entries`) |
| Older tournaments carry only a scoring template; the tabs read it as the type and could hide Weigh-in or the Kata panel | Medium | No type set means both events, in one shared rule (`tournamentEvents`) used by the server and the screens |
| A bracket could be rearranged after a bout was called to the mat | Low | "Started" now includes called and ready bouts |
| The bracket screen did not show console results until reopened | Low | Refreshes every 15 seconds, never mid-arrangement, mid-drag or while a result is being entered |

Checked and sound: team-member routes (permissions, a coach only reaches their own team, archived tournaments read-only, email/mobile checks, removed with their team); bracket arrangement (manager permission, tournament reach, every player placed once, no empty bout, byes only where allowed, audited); the SGFI set (category permission, refused as a whole on overlap, audited); the printed sheet escapes every name.

## Checked and found sound

| Area | What is in place |
| --- | --- |
| Passwords | scrypt with per-password salt; constant-time comparison; 8+ characters for accounts |
| Tokens | JWT with the algorithm pinned (no `alg: none` or algorithm confusion); 12-hour lifetime; server-side sessions that can be revoked; sign-out ends the session |
| Sign-in | Rate limited per address and per account; failures audited; optional two-factor sign-in |
| Registration link | Password attempts rate limited; link expiry and enable/disable |
| Authorisation | One permission table for API and web; sensitive privileges separate; tournament and organisation scoping on every tournament route |
| Input | Strict schemas (unknown fields refused); body size limits; Express's plain query parser (no nested objects, so no operator injection); search terms escaped before reaching a regex |
| Public data (Rule 8) | Allow-lists for every public field, tested; key and password hashes never returned |
| Uploads | Type, size and real file content checked; served with `nosniff`; private files only to those allowed |
| Partner API | Key shown once, stored only as a hash in its own collection, compared in constant time, rate limited, revocable |
| Audit | Every privileged change with before, after and reason; system-level audit for accounts, roles, organisations, rulesets, backups and sign-ins |
| Browser | React escapes all output; the one HTML builder (print view) escapes every cell; tokens are kept in session storage, not cookies, so there is no CSRF exposure |

## Still to do (outside the code)

- **External penetration test** against a staging copy before a large public event.
- **Set the production variables:** `NODE_ENV=production`, `JWT_SECRET`, `CORS_ORIGIN` (exact front-end origin, not `*`), `TRUST_PROXY` only behind a proxy, `APP_URL`.
- **Treat backups as secret.** They contain account password hashes; keep backup files somewhere access-controlled.
- **More than one API instance needs shared state.** Rate limits, idempotency and the session cache are per process. A single server per venue is fine; several instances would need Redis behind those interfaces.

## Load test

Run with `npm run loadtest` in `packages/api`; see `scripts/loadtest.js` for options.
It simulates mats scoring over the socket while spectators poll the public page and the hall scoreboard.
These figures come from an in-process run, where the simulated crowd shares the server's CPU, so they are pessimistic:

| Scenario | Score commands p95 | Public page p95 | Failures |
| --- | --- | --- | --- |
| 6 mats, 200 spectators (every 3 s) | 10 ms | 15 ms | 0 |
| 10 mats, 600 spectators (every 2 s), before the public-view cache | 377 ms | 12.2 s | 0 |
| 10 mats, 600 spectators (every 2 s), after | 55 ms | 76 ms | 0 |

Before an event, run it once against the staging server (`--url`, with an admin account).
That run is subject to the server's per-address rate limit, because every simulated spectator comes from one machine.
