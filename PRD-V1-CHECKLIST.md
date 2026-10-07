# PRD v1.0 checklist — Karate Tournament Management System

This checklist maps every section of *Karate_Tournament_Management_System_PRD_2.pdf* (PRD v1.0: 31 sections, 20 acceptance criteria, edge cases, MVP and Phase 2) to the code.
It builds on the earlier work recorded in `PRD-CHECKLIST.md` (66-section PRD) and `KUMITE-PRD.md`.

Legend:

- ✅ done
- 🟡 partly done (what is missing is said)
- ⏭️ Phase 2, not built

"Where" names the main place the behaviour lives:

- `shared/` is the domain service (`packages/shared`).
- `api/` is the Express API.
- `web/` is the React app.

**How it was checked:**

| Workspace | Test files | Tests |
| --- | --- | --- |
| `packages/shared` | 6 | 132 |
| `packages/api` | 17 | 253 |
| `packages/web` | 28 | 208 |

- All of the above run with `npm test` from the root.
- `packages/shared/prdv1.test.js` and `packages/api/prdv1.test.js` are the PRD v1 suites.
- A browser smoke run against a seeded server opened every new screen and reported no page errors.

---

## 1. Product overview — ✅

One system covers setup to archive: configuration, registration, weigh-in, draw, kumite and kata scoring, results, certificates and the public portal. This follows the Appendix A workflow end to end, and `api/scripts/seed-sample.js` builds a full sample tournament through it.

## 2. Goals and success criteria — ✅

| Goal | Where |
| --- | --- |
| No manual age/category errors | Age comes from the master date only. Categorisation is automatic (`shared/categories.js`, `tms.categorize`). |
| Fast, auditable scoring | Live console over Socket.IO. Every command is a `matchEvents` row; corrections are audited. |
| Transparent results | A result moves Provisional → Verified → Published → Locked. Tie-break and medal reasons are shown. |
| Public access without leaking data | The public API uses allow-lists (Rule 8), checked by tests. |

## 3. Scope and product principles — ✅

- Configuration lives in tournament settings and versioned rulesets, not in code.
- Domain logic sits in `shared/` services and state machines (`lifecycle.js`), not in UI or controllers.
- Responsive web only; native apps are out of scope, as the PRD states.

## 4. User roles and permissions — ✅

| Item | Status | Where |
| --- | --- | --- |
| Super Admin, Tournament Admin, Registration Officer, Weigh-in Officer, Referee, Kata Judge, Coach/Team Manager, Announcer, Viewer | ✅ | `shared/permissions.js` |
| **Scoreboard Operator** role, its own screen, announcement on the hall screen | ✅ | role in `permissions.js`; `web/pages/ScoreboardOperator.jsx`; `PATCH /display/message` |
| Sensitive privileges kept apart (result override, draw regeneration, score correction, record delete, tournament reopen, weigh-in override, category override, ruleset manage, backup) | ✅ | `PERMISSION.*` |
| **Tournament-scoped roles** (another role inside one tournament) | ✅ | `account.tournamentRoles`, `roleIn()`, `tournamentAccess`; editor in Accounts |
| Coach accounts (own login) as well as protected links | ✅ | `POST /coach/account`; coach login opens `/coach` |

## 5. Tournament lifecycle — ✅

- Draft → Registration Open → Registration Closed → Verification → Weigh-in → **Entries Locked** → Ready → Live → Completed → Archived, with explicit transitions (`shared/lifecycle.js`).
- Opening registration checks that the tournament is ready (`registrationReadiness`). The Settings tab lists anything missing.
- Moving backwards needs a reason and the reopen privilege; both are audited.
- Entries Locked and Live lock the entries; Completed locks the results. Archived is read-only (`assertWritable`).

## 6. Tournament configuration — ✅

| Item | Where |
| --- | --- |
| Basic details plus validation (name and organiser 2–150, venue 2–200, dates in order, phone, email) | `tournamentProblems`; applied on create and update |
| Registration opens and closes at a date and time, in the tournament's **time zone** | `shared/timezone.js`, `registrationWindow`; Settings has date-time fields and a time-zone picker |
| **Versioned rulesets**: WKF, WKF components and Youth built in; custom ones created by the super admin | `shared/rulesets.js`; `/rulesets`; Admin → Rulesets; applied per tournament in Settings |
| Uneven pools, byes, seeding, draw method, third-place match | Settings → Draw and qualification |
| Overtime (none / senshu / extra time / golden score / hantei), extra-time length, senshu, penalty categories and ladder | Settings → Kumite scoring; enforced in `shared/rules.js` and `commands.js` |
| Qualification: top N, points threshold or manual | Settings; standings in `shared/results.js` |
| Final stage: knockout or master pool | `generateBracket` modes |
| Result publishing: manual or automatic on verify | `verifyResult` |
| Public visibility: public / unlisted / private | `publicList`, `findPublicTournament` |
| Certificate template, title, signatories, footer | Settings → Certificates |
| Notification channels: in-app, email, SMS, WhatsApp | Settings → Notification channels |
| Changing the Master Age Date once players exist shows a preview and needs confirmation | `previewMasterDateChange`; confirmation dialog in Settings |

## 7. Registration and team entry — ✅

- Password-protected link with expiry and enable/disable switch (earlier work).
- Teams get a reference (`T-001`) and an active flag; an inactive team cannot add players.
- Player numbers are generated by the system.
- Coaches register through the link or their own account; organisers register from Registrations.
- **Partner API import**: `POST /partner/tournaments/:tid/players` with `X-API-Key`.
  - Settings → Partner API issues, replaces and revokes the key.
  - Only a hash of the key is stored, in a separate collection, so no tournament response carries it.
  - Imported entries get the same validation, duplicate review and audit as any other.
- Bulk Excel/CSV import (earlier work), now with duplicate warnings that must be confirmed.
- Entries outside the registration window are refused for coaches.

## 8. Dynamic registration form builder — ✅

| Item | Where |
| --- | --- |
| Field types: text, textarea, number, date, dropdown, radio, checkbox, multiselect, file, phone, email, country, state, district, **calculated**, **system** | `shared/registration.js` `FIELD_TYPES` |
| Field properties: help text, placeholder, default, pattern and its message, min/max, **conditional display (show when)**, formula, source | `normalizeForm` / `fieldProperties`; Settings → Registration form → properties dialog |
| Required, shown, read-only for coaches, ordering | Form builder |
| The player form renders every type, hides fields whose condition is unmet, uses the master geography (countries, Indian states) and shows calculated values | `web/components/tms/PlayerForm.jsx` |
| Validation applies the same rules on the server (names 2–100 characters, country and state against master lists, pattern, min/max, conditions) | `validatePlayer` |

## 9. Age calculation and category assignment — ✅

- Age is calculated against the Master Age Date only (Rule 1). A future or invalid date of birth is rejected.
- A category is gender + age + event + weight, plus an optional **division** (e.g. Novice/Advanced) when `groupByDivision` is on.
- Overlapping age groups or weight categories are refused unless explicitly allowed.
- After the lock, a category override needs `CATEGORY_OVERRIDE` and a reason. It is refused once the player has been drawn into a pool.

## 10. Weight management and weigh-in — ✅

- Weights are recorded to a configurable precision; whether the upper limit is inclusive is configurable.
- Each weigh-in is passed, failed or flagged for a recheck. Auto-move or flag follows `weighInAutoMove`.
- **Weigh-in close and reopen**: after close, only `WEIGHIN_OVERRIDE` with a reason may record a weight (Weigh-in tab).
- **Only verified weights enter the draw** (`requireWeighInForDraw`, on by default). Players left out are listed after the draw.

## 11. Entry verification and locking — ✅

- Registrations can be approved, rejected or returned for correction, with reasons.
- Payment is recorded manually (status, amount, method, transaction, receipt).
- **Soft lock**: coaches stop, organisers can still edit. Set from a Dashboard button or the `entryLockAt` deadline.
- **Hard lock**: entries are locked and registrations are marked LOCKED.
- **Withdrawal**: the player is marked WITHDRAWN and their remaining bouts are completed as walkovers, with history kept. Available as Registrations → Withdraw.

## 12. Draw, pool and bracket management — ✅

| Item | Where |
| --- | --- |
| Random and seeded draw; seeding can be switched off | `generatePools` |
| Maximum pool size respected. Modes: even, fewest pools, **equal sizes** (when uneven pools are off) | `shared/pools.js` |
| Moving a player into a full pool only with force and a reason | `movePlayer`; Draw tab asks first |
| **Redraw impact**: shows the pools and matches it would replace, needs `DRAW_REGENERATE` and confirmation, and is blocked once bouts are fought | `drawImpact`; Draw tab dialog |
| Single-entry categories decided by policy (no competition / auto-award / admin decision) | `decideSingleEntry`; Results tab buttons |
| Two players get a direct final | `generateMatches` |
| Qualification by top N, points or **manual selection** | `setQualifiers`; Results → Choose qualifiers |
| Knockout bracket with byes, optional **third-place match**, or a **master pool** | `generateBracket`, `syncBracket` |

## 13. Kumite match management — ✅

- Match states: scheduled → called → ready → open → live ↔ paused → completed / cancelled, enforced by a state machine. Matches tab → change status.
- Result types: COMPLETED, WALKOVER, NO_SHOW, KIKEN, DISQUALIFIED, MANUAL_OVERRIDE, CANCELLED.
  - Every exceptional result needs a **finish reason**.
  - MANUAL_OVERRIDE needs the result-override privilege.
- Every score change is a `matchEvents` row.
- A correction to a decided bout needs `SCORE_CORRECT` and a reason. It writes an OFFICIAL_CORRECTION event and updates the bracket that depends on it.
- **Interrupted match**: live state is persisted (`liveStates`) and restored when the console reconnects.
- **Overtime**: a level bout offers extra time or golden score. The penalty ladder and categories follow the ruleset.
- The scoreboard shows both clubs and the operator's announcement.
- Undo asks for confirmation.
- Commands on a decided bout are blocked, except harmless ones, and the attempt is audited.

## 14. Kata management — ✅

1. Create a round (status *pending*). Its rules (range, precision, components, tie-break, ruleset version) are captured when it is created.
2. **Assign judges to seats**; a seat that has scored keeps its judge.
3. **Start the round**; only then can judges score.
4. Judges score **only from their assigned seat**. Each score carries a `submissionId`, so a resend counts once.
5. Scoring is a single score or **technical + athletic components** (weighted).
6. **Penalties** take deductions with a reason. **Score overrides** need `RESULT_OVERRIDE` and a reason.
7. Ranking follows the configured tie-break and shows its reason.

## 15. Referee / judge operations — ✅

- Officials see the bouts they are assigned to, plus unassigned ones.
- Judges see only the kata rounds they sit on (AC-16).
- Mat control belongs to one socket at a time; takeover is reported.
- Commands sent over the socket are idempotent (`clientEventId`), and REST writes honour an `Idempotency-Key`.
- 🟡 **Offline scoring is Phase 2.** Reconnect restores the persisted live state, but scoring needs the server.

## 16. Results, ranking and medal tally — ✅

- Each category moves through a result lifecycle:
  - **Provisional → Verified → Published → Locked**, with status chips and a Verify button.
  - Publishing verifies any provisional categories and records that it did.
  - Completing the tournament locks results; reopening needs a reason.
- Standings show **tie-break reasons**, and every medal carries its **reason** (won the final, lost a semi-final, place in pool…).
- The medal tally can be grouped by club, district, state or country.
- A medal override needs `RESULT_OVERRIDE` and a reason.

## 17. Public portal and live display — ✅

- Shows tournament info and **registration information**: window with time zone, fees, contact, ruleset.
- Also shows categories, teams, players, draw, live matches, results (including the **master pool**) and the medal tally.
- **Certificates tab** (when enabled): search by name, download the PDF, verify.
- Visibility can be public, unlisted or private.
- Only published or locked categories appear.
- The live board, hall scoreboard and announcement are pushed over the socket.

## 18. Certificates and documents — ✅

- Types: **medal, participation, coach, official**, plus **special awards** (custom title and award).
- Every certificate has a unique ID and a **QR code** that opens the public `/verify/:id` page.
- Certificates use classic, modern or minimal templates with signatories and footer.
- They can be downloaded in bulk by type or one at a time; downloads are audited.

## 19. Reports and exports — ✅

- Reports:
  - Players, teams, categories, pools, matches, results, attendance, club, payments, weigh-in.
  - **Final result**, **medal tally**, **audit** (the audit report needs the audit privilege).
- **Filters**: gender, event, age group, category, club, district, state.
- Formats: Excel, CSV and PDF.
- **Every export is audited**: report PDFs on the server, and browser downloads from any list through `POST /exports`.

## 20. Notifications — ✅

- In-app notifications plus email (earlier work).
- **SMS and WhatsApp** go through configurable webhooks (`SMS_WEBHOOK_URL`, `WHATSAPP_WEBHOOK_URL`), switched on per tournament. Team notices use team mobiles; organiser notices use the contact mobile.

## 21. Validation rules — ✅

Every rule listed in the PRD is enforced on the server and reported in plain language (`web/data/tms/index.js`):

- name lengths, date of birth, phone, email, weight precision, field patterns
- registration window, duplicates, team active
- category and pool limits, lock states, state transitions

## 22. Security, audit and data protection — ✅

| Item | Where |
| --- | --- |
| JWT with pinned algorithm; **server-side sessions** (list, revoke one, revoke others, logout ends the session) | `api/auth/sessions.js`; My account → *Where you are signed in* |
| Failed logins, logouts, account, role and organisation changes, rulesets and backups recorded in a **system audit** | `systemAudit`; Admin → System |
| Tournament audit of every privileged change, with before, after and reason | `tms.record` |
| Rate limits (login, links, public lookups, API) | `lib/rateLimit.js` |
| Rule 8: public allow-lists; key and password hashes never returned | tests assert this |
| Optional two-factor sign-in (earlier work) | |

## 23. Non-functional requirements — 🟡

- ✅ **Backups**: `npm run backup` and `npm run restore` (with `--replace`), plus a backup download for the super admin. A round-trip restore is tested.
- ✅ Health endpoint reports storage and uptime; Mongo indexes are in place; server paging is used.
- ✅ A draw of 5,000 entries is covered by a performance test.
- 🟡 **No full load test or penetration test has been run.** The PRD's "load test, security test and full mock tournament" step remains a release task; the seeded sample tournament is the starting point for the mock.

## 24. Recommended data model — ✅

Collections cover every entity the PRD lists:

- tournaments, rulesets, ageGroups, weightCategories, teams, players, registrationLinks
- pools, brackets, matches, matchEvents, liveStates, kataRounds, kataScores
- divisionResults, medals, medalOverrides, certificates, notifications, auditLog, files, organizations, apiKeys

See `api/lib/store.js` and `TMS_COLLECTIONS`.

## 25. API / integration requirements — ✅

- REST API under `/api/v1` and a Socket.IO live channel.
- Idempotency keys; partner API; webhooks for SMS and WhatsApp.
- Language: **English only, by decision.** The PRD's "i18n-ready" is not taken up; no translation layer is built.

## 26. Key screens — ✅

| Area | Screens |
| --- | --- |
| Admin tournament screens | Dashboard (soft lock, registration window), Settings (all of §6, form builder properties, ruleset, time zone, partner key), Categories |
| Admin entry and draw | Registrations (duplicates, withdraw, team reference and active flag), Weigh-in (close/reopen/override), Draw (impact, exclusions, single entries) |
| Admin matches and results | Matches (status, result types, finish reason), Kata (judges, start, components, penalties, overrides), Call (attendance), Results (verify, qualifiers, single entry, master pool) |
| Admin output and audit | Certificates (types, special award, single PDFs), Reports (filters, audit), Audit |
| Super admin | Rulesets, System (audit and backup), Organisations |
| Coach portal | Link or own account at `/coach`; duplicate review; create own login |
| Hall and public | Scoreboard operator, hall scoreboard with announcement and clubs, public portal, `/verify` |

## 27. Acceptance criteria

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-01 | Create a tournament with a mandatory Master Age Date | ✅ | Readiness check refuses opening registration without it |
| AC-02 | Configure age groups and weight categories | ✅ | Categories tab; overlap checks |
| AC-03 | Age calculated from date of birth against the master date | ✅ | `calculateAge`; tests |
| AC-04 | Invalid or future date of birth rejected | ✅ | `validatePlayer` tests |
| AC-05 | Password-protected registration link | ✅ | Link with password and expiry |
| AC-06 | Coach submits many players under one team | ✅ | Coach portal; API tests |
| AC-07 | Add, remove or configure fields without code | ✅ | Form builder and properties dialog |
| AC-08 | Bulk upload with preview, errors and confirmation | ✅ | BulkUpload, including duplicate confirmation |
| AC-09 | Players grouped by event, gender, age and weight | ✅ | `divisions()`, also by division |
| AC-10 | Only approved, eligible players enter the draw | ✅ | Draw eligibility plus verified weigh-in gate |
| AC-11 | Pools respect the maximum size | ✅ | `poolSizes`; full pool needs force |
| AC-12 | Random and seeded draw | ✅ | Tests |
| AC-13 | Kumite matches assign AKA and AO | ✅ | Matches; swap corners before the bout |
| AC-14 | Referee controls only an authorised match | ✅ | Assignment plus mat control |
| AC-15 | Every score change is an auditable event | ✅ | `matchEvents` |
| AC-16 | Kata judges score only assigned rounds | ✅ | Seat assignment; prdv1 tests (API and shared) |
| AC-17 | Final results not changeable with ordinary permissions | ✅ | `SCORE_CORRECT` / `RESULT_OVERRIDE`; locked results |
| AC-18 | Public results expose no private data | ✅ | Allow-lists; test asserts no date of birth, mobile, email or hashes |
| AC-19 | Certificates bulk generated from final results | ✅ | Generate by type; needs published results for medal certificates |
| AC-20 | Privileged changes are auditable | ✅ | Tournament and system audit |

## 28. Edge cases and exception handling

| Case | Status | How |
| --- | --- | --- |
| One player in a category | ✅ | Policy: auto-award, no competition, or admin decision (Results tab) |
| Odd player count | ✅ | Byes, or refused when byes are off |
| Withdrawal after the draw | ✅ | History kept; remaining bouts walked over; no automatic reshuffle |
| Weight failure | ✅ | Recheck or auto-move by policy; unverified players left out of the draw |
| Duplicate registration | ✅ | Flagged and needs confirmation; Possible duplicates view; never merged |
| Wrong category | ✅ | Reassign before lock; after lock only with the privilege and a reason |
| Interrupted match | ✅ | Live state persisted and restored |
| Score correction after completion | ✅ | Correction event; bracket and medals recalculated |
| Network retry | ✅ | `clientEventId`, `submissionId`, `Idempotency-Key` |
| Pool regeneration | ✅ | Impact shown; blocked once bouts are fought |
| Ties | ✅ | Configured tie-break sequence with reason (kumite and kata) |

## 29. MVP vs Phase 2

**MVP — all ✅:** RBAC, lifecycle, master age date, categories, dynamic registration, team and player entry, Excel import, approval, weigh-in, automatic categorisation, draw, kumite scoring, kata judging, results and medal tally, public results, PDF certificates, reports and audit.

**Phase 2:**

| Item | Status |
| --- | --- |
| Offline scoring | ⏭️ |
| Native mobile apps | ⏭️ |
| Payment gateways | ⏭️ Payments are recorded manually |
| SMS / WhatsApp | ✅ Built early, through webhooks |
| QR check-in | ⏭️ Attendance is marked by the announcer |
| QR certificate verification | ✅ Built early |
| Digital accreditation | ⏭️ |
| Scale hardware integration | ⏭️ |
| Advanced federation rulesets | 🟡 Versioned rulesets with three built in; federation-specific packs are still to be written |
| Multi-venue optimisation | ⏭️ |
| Advanced analytics | ⏭️ |
| Public partner APIs | ✅ Entry import |

## 30. Recommended technology architecture — discrepancy, by decision

| PRD suggests | Built | Why |
| --- | --- | --- |
| Laravel + PHP 8.3 | Node.js + Express 5 | The existing kumite app and the shared domain package are JavaScript. Rules run in the browser and on the server from one package. |
| MySQL 8 | MongoDB (or in-memory for development) | The existing store contract; indexes are defined per collection |
| Redis queue/cache | In-process (rate limits, idempotency, session cache) | One server per venue; Redis can sit behind these interfaces later |
| Laravel broadcasting | Socket.IO | Already used for live scoring |
| React + Vite | ✅ React 18 + Vite + MUI | — |
| Server-side PDF, XLSX | ✅ pdfkit + qrcode, exceljs | — |
| Domain services and state machines | ✅ `packages/shared` (`tms.js`, `lifecycle.js`, `rules.js`, `commands.js`) | — |

## 31. Open product decisions — answers used

| # | Question | Answer in this build |
| --- | --- | --- |
| 1 | Which ruleset first? | WKF standard by default; WKF kata components and Youth are built in; more can be added as versioned rulesets |
| 2 | Pool, elimination, round robin or configurable? | Configurable: pools then knockout, straight knockout, or pools then a master pool |
| 3 | Qualifiers per pool? | Configurable: top N (default 2), points threshold, or manual |
| 4 | Kumite scoring and penalty rules? | From the ruleset: points, gap, senshu, overtime mode, penalty categories and ladder |
| 5 | Kata scoring and tie-break? | From the ruleset: judges, method, range, precision, components, tie-break |
| 6 | Several events per player? | Yes: kata and kumite, one category each |
| 7 | Payment before approval? | Not mandatory; payment is tracked separately and reported |
| 8 | Team managers: accounts or links? | Both: protected link, and an optional own login created from the portal |
| 9 | Identity documents? | Configurable file fields (PNG, JPEG, PDF up to 2 MB, content checked) |
| 10 | Player photos on public results? | No, by Rule 8 (photos are private files) |
| 11 | Single-player categories? | Configurable policy; admin decision by default |
| 12 | Category changes after weigh-in? | Configurable: auto-move, or flag for recheck and admin decision |
| 13 | Multi-organisation SaaS from day one? | Supported (organisations, scoped admins); optional |
| 14 | Notification and payment providers? | Email over SMTP; SMS and WhatsApp through any webhook gateway; payment gateways deferred |
| 15 | Offline scoring for the first event? | No: reconnect with persisted state; full offline is Phase 2 |
| — | Languages? | English only (decided by the product owner) |

---

## Operations notes

- **Seeded accounts** (memory store, password `test123`):
  - `superadmin@kata.local` (super admin)
  - `scoreboard@kata.local` (scoreboard operator)
  - the existing admin, referee, judge and officer accounts
- **Backup**: `cd packages/api && npm run backup -- backups/day1.json`. Restore with `npm run restore -- backups/day1.json [--replace]`.
- **SMS / WhatsApp**: set `SMS_WEBHOOK_URL` and/or `WHATSAPP_WEBHOOK_URL`. The server POSTs `{ channel, to, text }`.
- **API rate limit**: `API_RATE_LIMIT` requests per minute per address (default 1200).
- **Certificate QR codes** link to `APP_URL/verify/:id`; set `APP_URL` in production.
