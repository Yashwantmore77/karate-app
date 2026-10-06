# Karate Tournament Management System — PRD implementation checklist

Tracks every section of the PRD against what is built. Updated with each module.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Pending · ⚠️ Discrepancy (deviates from the PRD — see [Discrepancies](#discrepancies))

**Where things live**

| Layer | Path | Notes |
|---|---|---|
| Business rules (one copy) | `packages/shared/tms.js` + `age.js`, `categories.js`, `lifecycle.js`, `pools.js`, `results.js`, `registration.js`, `permissions.js`, `audit.js`, `secret.js` | Runs on the API **and** in the offline browser build, so both enforce identical rules |
| API | `packages/api/routes/tms.js` (admin), `public.js`, `coach.js` | `/api/v1/tournaments/:id/...`, `/api/v1/public/...`, `/api/v1/coach/...` |
| Web | `packages/web/src/pages/tms/*` (admin tabs), `pages/public/*` (public site, coach portal), `components/tms/*` (reusable) | Admin: Tournaments → a tournament → **Manage tournament** |
| Tests | `packages/shared/tms.test.js` (§64 flow on the service), `packages/api/tms.test.js` (§64 flow over HTTP), `packages/web/src/data/tms/local.test.js` (offline adapter) | Plus a browser run of §64 in offline and API modes (not committed; needs Playwright) |

**Kept as it was:** the login screen and its role quick-select chips (Admin, Referee, Judge 1–4), the kumite console, the judge/referee screens and the original tournament/category screens. Everything PRD is added on top.

---

## Module status (PRD §63 order)

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Project setup | ✅ | npm workspaces: `api`, `shared`, `web` |
| 2 | Authentication | 🟡 | Login/logout, scrypt hashes, JWT. Forgot/reset password and 2FA pending |
| 3 | Roles / permissions | 🟡 | Permission table for all 8 PRD roles, enforced in API and web tabs. Per-tournament user assignment pending |
| 4 | Tournament module | ✅ | All §5 fields, master age date, §6 lifecycle |
| 5 | Category configuration | ✅ | Age groups, weight categories, rules settings |
| 6 | Registration system | ✅ | Configurable form, password link, coach portal |
| 7 | Team / player management | ✅ | |
| 8 | Bulk upload | ⚠️ | CSV, not .xlsx (see D3) |
| 9 | Verification | ✅ | |
| 10 | Weigh-in | ✅ | |
| 11 | Categorization | ✅ | |
| 12 | Pool generation | ✅ | |
| 13 | Match generation | ✅ | |
| 14 | Kumite scoring | 🟡 | Live console existed already; tournament rule settings not yet fed into it (D6) |
| 15 | Kata scoring | ⚠️ | Out of scope by your instruction (D1) |
| 16 | Results | ✅ | |
| 17 | Brackets | ✅ | |
| 18 | Certificates | ✅ | PDF via the browser's print → Save as PDF (D4) |
| 19 | Reports | ⚠️ | CSV + printable PDF; no native .xlsx (D3) |
| 20 | Public pages | ✅ | |
| 21 | Real-time | 🟡 | Live match socket and hall display existed; public page refreshes every 5 s rather than by push |
| 22 | Testing | ✅ | 432 automated tests; §64 run in a browser in both modes |

---

## Section by section

### §1 Product overview — capability list
| Capability | Status |
|---|---|
| Tournament creation and configuration | ✅ |
| Dynamic age groups and weight categories | ✅ |
| Master date-based age calculation | ✅ |
| Team/club registration | ✅ |
| Dynamic registration forms | ✅ |
| Password-protected registration links | ✅ |
| Bulk Excel player upload | ⚠️ CSV (D3) |
| Player verification | ✅ |
| Payment management | ✅ manual recording; no gateway (PRD allows later) |
| Weigh-in management | ✅ |
| Automatic player categorization | ✅ |
| Kata and Kumite event management | 🟡 both events register, categorise and draw; kata judge scoring out of scope (D1) |
| Pool/draw generation | ✅ |
| Match scheduling | ✅ |
| AKA/AO assignment | ✅ |
| Live match management | ✅ existing console |
| Kumite scoring | ✅ existing console |
| Kata scoring | ⚠️ D1 |
| Pool results | ✅ |
| Final/master pool | ✅ |
| Knockout/bracket | ✅ |
| Medal results | ✅ |
| Certificate generation | ✅ (D4) |
| Public live results | ✅ (polling, D7) |
| Reports and exports | ✅ (D3) |
| Role-based access control | ✅ |
| Audit logs | ✅ |

### §2 Core design principle
- ✅ Configuration over hard-coding: age groups, weight categories, pool size, qualifiers, points, tie-breakers, bronze count, mats, match duration, point gap, fees, registration form — all per tournament.
- ✅ Tournament data isolation: every PRD record carries `tournamentId`; the service checks ownership on every id.

### §3 User roles
| Role | Status | Notes |
|---|---|---|
| 3.1 Super Admin | 🟡 | Role and full permissions exist (`super_admin`); uses the admin screens. Managing roles in the UI pending |
| 3.2 Tournament Admin | ✅ | Existing `admin` role |
| 3.3 Registration Officer | ✅ | `registrar@kata.local` / `test123`. Sees Dashboard + Registrations only |
| 3.4 Weigh-in Officer | ✅ | `weighin@kata.local` / `test123`. Sees Weigh-in only |
| 3.5 Referee | ✅ | Existing; blocked from configuration (403 tested) |
| 3.6 Kata Judge | ⚠️ | Existing `judge` role; kata panel per PRD out of scope (D1) |
| 3.7 Coach / Team Manager | ✅ | No account: opens the registration link (password) → scoped session for one tournament and one team |
| 3.8 Public Viewer | ✅ | `/tournaments`, `/tournament/{slug}` |

The officer accounts are **not** on the login quick-select chips (kept unchanged); sign in by typing the address.

### §4 Authentication & authorization
| Item | Status |
|---|---|
| Login / logout | ✅ |
| Forgot password / password reset | ⬜ |
| Role-based access | ✅ |
| Tournament-level permissions | 🟡 coaches are scoped to one tournament+team; staff accounts are not yet limited to assigned tournaments |
| Session management | 🟡 JWT 12 h; expired-token UX pending |
| Secure password storage | ✅ scrypt (accounts), PBKDF2 (link passwords) |
| Optional 2FA for admins | ⬜ |

### §5 Tournament management
- ✅ Name, logo (URL), description, type (Kata / Kumite / Kata+Kumite), organizer, association, venue, address, city, district, state, country, contact person/mobile/email.
- ✅ Registration start/close, weigh-in date, start/end dates.
- ✅ **Master Age Calculation Date** — required before registration opens; cannot change once entries are locked.
- ⚠️ Logo is a URL, not an upload (D5).

### §6 Tournament status
- ✅ DRAFT → … → ARCHIVED as a transition table; only listed moves allowed; every move audited; stepping back needs a reason. Pools auto-advance VERIFICATION/WEIGH_IN → DRAW_GENERATED.
- Note: the original `status` (draft/active/completed) used by the existing screens is kept; the PRD lifecycle is the new `lifecycleStatus`.

### §7 Age groups — ✅ name, gender, min/max age, active.
### §8 Age calculation — ✅ DOB vs master date (Rule 1), suggestion shown on every player, admin override with reason → audit log.
### §9 Weight categories — ✅ name, min, max, display label, active; open-ended `-35 KG` / `+45 KG`.
### §10 Event management — ✅ kata / kumite / both; each event has its own entry (category, override, division) on the player.
### §11 Registration form builder — ✅ add, remove, reorder, rename, required/optional, show/hide, field type (all 9 types). Categorisation fields can be renamed but not removed.
### §12 Default player fields — ✅ all 19 listed. Age group / weight category are computed rather than typed.
### §13 Team / club — ✅ all fields; Tournament → Team → Players → Event entries.
### §14 Registration link
| Item | Status |
|---|---|
| Unique URL `/register/{token}` | ✅ |
| Enable/disable password | ✅ |
| Expiry | ✅ |
| Regenerate | ✅ |
| Disable link | ✅ |
| Copy/share | ✅ copy button |

### §15 Bulk upload
- ✅ Upload → validate → preview → errors → confirm → create; imports only a clean file.
- ✅ Detects missing required, invalid DOB, gender, weight, event, duplicate player (in file and already registered), invalid team, phone/email.
- ✅ Downloadable error report (CSV) and a template matching the tournament's own form.
- ⚠️ Accepts CSV, not .xlsx (D3). "Invalid category" is reported at categorisation rather than at upload.

### §16 Registration status — ✅ all 12 statuses as a transition table.
### §17 Verification — ✅ view, edit, approve (incl. bulk "approve all pending"), reject (reason required), request correction, change category, history (audit log). 🟡 document upload/view (D5).
### §18 Payments — ✅ fee per event (kata, kumite, both, team) computed per player; amount, status (PENDING/PAID/FAILED/REFUNDED), method, transaction ID, date, receipt no. 🟡 team fee configured but not yet charged per team; no gateway (PRD: separate integration).
### §19 Weigh-in — ✅ kumite only; registered vs actual weight, time, officer, result, notes; PENDING/PASSED/FAILED/RECHECK_REQUIRED; moves to the fitting category when the tournament allows it (audited), otherwise flags a recheck.
### §20 Automatic categorization — ✅ gender + age + event + weight → "Boys 12-13 / Kumite / -35 KG"; issues listed per player (no group, overlapping groups, missing weight).
### §21 Category lock — ✅ Lock entries: coaches read-only, no new entries, category-deciding fields frozen, config frozen; unlock needs a reason and is audited.
### §22 Pool generation — ✅ per category, default 8, configurable, even split (20 → 7/7/6).
### §23 Pool options — ✅ random, seeded (snake by seed), manual move (logged, reason asked). Extra: clubmates kept apart where numbers allow; every draw reproducible from its stored seed.
### §24 Draw lock — ✅ needs entries locked and pools; blocks moves/redraws; unlock needs a reason.
### §25 Match generation — ✅ tournament, category, pool, round, match number (M-001…), mat, scheduled time, AKA, AO, status. Round robin per pool.
### §26 Red/Blue — ✅ AKA/AO stored on the match (`redId`/`blueId` + `akaPlayerId`/`aoPlayerId`), corners balanced per player.
### §27 Match status — 🟡 the PRD statuses exist in `lifecycle.js`; bouts use the existing scoring app's `scheduled/open/live/completed` so the console keeps working (D2).
### §28 Match screen — ✅ existing kumite console; admins open it from the match queue.
### §29 Kumite scoring config — 🟡 duration and point gap are tournament settings; wiring them into the console's rules is pending (D6). Score values 1/2/3 as you specified earlier.
### §30 Match event log — 🟡 existing console keeps an event history (with server sequence numbers in API mode); not yet persisted per match for later review.
### §31 Undo / correction — ✅ console undo; result corrections after completion need a reason and are audited (Rule 6).
### §32–33 Kata — ⚠️ D1.
### §34 Pool results — ✅ played, wins, losses, score, points, penalties, rank, qualified; tie-breakers configurable (points, wins, head-to-head between two, score difference, score for, penalties).
### §35 Master pool / final — ✅ top N per pool (configurable) cross-seeded into a knockout (A1 v B2, B1 v A2).
### §36 Bracket — ✅ visual bracket, byes, fills itself as results arrive.
### §37 Scheduling — ✅ mat, date/time per match; per-mat queue filter. 🟡 assigning referee/judges per match is in the API (`refereeId`) but not in the UI yet.
### §38 Live display — ✅ existing `/display` hall screen; public page shows current matches. 🟡 "next match" panel on the hall screen pending.
### §39 Public tournament page — ✅ `/tournament/{slug}` with info, categories, teams, players, draw (after draw lock), live matches, results and medal tally (after publish). Drafts are hidden.
### §40 Search — ✅ player name/ID, team, club, category, match number (public and admin).
### §41 Filters — ✅ gender, event, team, registration status, payment status, weigh-in status, category, mat, match status. 🟡 club/district/state/country/age group/weight category are API filters; not all are in the UI yet.
### §42 Medals — ✅ stored on publish: player, team, club, category, event, rank, medal, tournament. Gold, silver, two bronzes (configurable).
### §43 Medal tally — ✅ by club, district, state, country.
### §44 Certificates — ✅ every listed field, unique certificate IDs, printable; PDF via the browser (D4). Signature is a line, not an uploaded image.
### §45 Reports — ✅ all 11 reports (registration, player, team, category, weigh-in, pool, match, result, medal, payment, attendance) as CSV and printable PDF (D3).
### §46 Dashboard — ✅ all listed counts per tournament, next matches. 🟡 "Total tournaments" across all events is on the tournament list, not a separate dashboard.
### §47 Notifications — 🟡 in-app: registration submitted/approved/rejected/correction, payment, draw published, matches scheduled, results published, new registration, bulk upload, payment received. ⬜ email channel; weigh-in reminder.
### §48 Audit log — ✅ user, role, action, entity, old → new, timestamp, IP and device, reason; screen with search. Covers status changes, locks/unlocks, DOB/weight edits, category overrides, pool moves, result corrections, approvals, payments, weigh-ins, publishing.
### §49 Data security
| Item | Status |
|---|---|
| Role-based authorization | ✅ |
| Validate all API inputs | ✅ unknown fields rejected, sizes bounded |
| Protect sensitive player info | ✅ public allow-list (Rule 8) |
| Hash passwords | ✅ |
| Secure authentication | ✅ |
| Prevent unauthorized tournament access | 🟡 coaches scoped; staff see all tournaments |
| Validate uploaded files, types/sizes | ✅ CSV ≤ 2 MB; photo/ID: PNG/JPEG/PDF ≤ 2 MB checked in the browser (storage pending, D5) |
| Protect public APIs | ✅ read-only, link password check rate-limited |
| Audit logs | ✅ |

### §50 Business rules
| Rule | Status | Enforced in |
|---|---|---|
| 1 Age vs master date | ✅ | `age.js`; never today |
| 2 Category suggestion | ✅ | `categories.js`, `tms.js` |
| 3 Pool size 8, configurable | ✅ | `pools.js`, settings |
| 4 Even distribution | ✅ | `poolSizes()` |
| 5 Draw lock | ✅ | `setDrawLock`, `movePlayer`, `generatePools` |
| 6 No silent result change | ✅ | match PATCH + `correctResult` need a reason and write the audit log |
| 7 Registration lock | ✅ | coach writes refused when locked or registration not open |
| 8 Public privacy | ✅ | allow-list; tested that DOB, mobile, email, parents' names never reach public JSON |

### §51 Admin navigation — ✅ as tabs on each tournament: Dashboard, Settings, Categories, Registrations (teams, players, bulk), Weigh-in, Draw/Pools, Matches (queue/live/completed), Results (pools, final, tally), Certificates, Reports, Audit log. Users & roles: existing Accounts page.
### §52 Coach panel — ✅ team, players, registration, bulk upload, payment and weigh-in status, notifications, link to draw/results. 🟡 certificates download for coaches pending.
### §53 Referee panel — ✅ existing (categories → matches → console). 🟡 "assigned matches" filtering pending (needs §37 referee assignment UI).
### §54 Public website — ✅ home (`/tournaments`), details, categories, players, draw, live, results, tally.
### §55 Database entities — 🟡 implemented as collections: tournaments, ageGroups, weightCategories, teams, players (with event entries, payment and weigh-in embedded), pools, brackets, matches/competitors/categories (existing), medals, certificates, registrationLinks, notifications, auditLog, users. Embedded rather than separate tables for player_entries/payments/weigh_ins (D8).
### §56 API — ✅ modular `/api/v1/tournaments/{id}/settings|age-groups|weight-categories|teams|players|registrations|weigh-ins|pools|matches|results|certificates|...`; public APIs separate under `/api/v1/public`.
### §57 Real-time — 🟡 existing socket for scoring, clock and display; public page polls every 5 s (D7).
### §58 Mobile — ✅ responsive layouts, scrolling tables, scrollable tabs; checked at 390 px.
### §59 UX — ✅ large action buttons, status badges with text + symbol (colour-independent), confirmations, search everywhere, filters, clear error messages, loading and empty states.
### §60 Confirmations — ✅ delete player/team/category, lock/unlock entries and draw, generate/regenerate pools, generate matches, publish results, change a final result. 🟡 delete tournament uses the existing screen's confirm.
### §61 MVP scope — Phase 1 ✅ (kata excepted). Phase 2 ✅ except kata scoring. Phase 3 ⬜ (out of scope).
### §62 Non-functional — 🟡 client-side paging and filtering; server-side pagination and DB indexes pending. Scoring reliability from the existing server-authoritative match room.
### §63 Agent instructions — ✅ module order, database first, configuration over hard-coding, isolation, auditability, reusable components (`DataTable`, `StatusBadge`, `ConfirmDialog`, `PlayerForm`, `BulkUpload`, `TournamentSelector`, `Bracket`, `StatCard`), validation on both sides (shared validators).
### §64 Acceptance flow
| Step | Status |
|---|---|
| Create tournament | ✅ |
| Set master age date | ✅ |
| Create Boys 12–13 | ✅ |
| Create -35 KG | ✅ |
| Configure registration form | ✅ |
| Password-protected link | ✅ |
| Coach registers team + 10 players | ✅ (form or bulk) |
| Admin approves | ✅ |
| Ages calculated | ✅ |
| Players categorised | ✅ |
| Lock category | ✅ |
| Pools A and B | ✅ 5 + 5 |
| Matches generated | ✅ 20 |
| AKA / AO assigned | ✅ |
| Referee scores | ✅ existing console / result entry |
| Standings | ✅ |
| Final | ✅ semis + final |
| Medals | ✅ |
| Publish results | ✅ |
| Certificate | ✅ |

Verified three ways: shared service test, HTTP test, and a browser run of every step in both offline and API modes.

### §65 Future enhancements — ⬜ not started (by design).
### §66 Product vision — n/a.

---

## Discrepancies

| ID | PRD says | What is built | Why / next step |
|---|---|---|---|
| D1 | Kata workflow and kata judge panel with configurable calculation (§32–33) | Kata entries register, categorise, draw and fight bouts through the existing flag/score judging; no 5-judge drop-high/low panel | You said kata is out of scope. Ready to build when you want it |
| D2 | Match statuses SCHEDULED…DISQUALIFIED (§27) | Bouts use the scoring app's `scheduled/open/live/completed` | Keeps the existing console untouched. The PRD lifecycle exists in `lifecycle.js`; mapping walkover/DQ/cancel into the console is pending |
| D3 | Excel upload and Excel export (§15, §45) | CSV in and out (Excel opens and saves CSV directly); PDF via print | No .xlsx library added. Can add one if you need native .xlsx |
| D4 | Downloadable PDF certificates (§44) | Printable certificate pages; "Save as PDF" in the print dialog | Avoids a server PDF dependency. Server-side PDF can be added |
| D5 | File uploads: logo, photo, ID proof, documents (§5, §12, §17) | File type/size checked, file **name** recorded; logo is a URL | No file storage yet (needs object storage or GridFS) |
| D6 | Configurable kumite rules feeding scoring (§29) | Duration and point gap stored per tournament; console still uses its built-in defaults | Next: pass tournament settings into the console |
| D7 | Real-time public updates (§57) | Public page polls every 5 s; scoring screens are real-time | Next: push `data:changed` to public viewers |
| D8 | Separate tables with foreign keys (§55) | Document collections; event entries, payment and weigh-in embedded in the player; ownership checked in code | Fits MongoDB; indexes still to add |
| D9 | Changing a completed match result | Now requires a reason everywhere (Rule 6). In API mode the old kata "reopen round" on a completed match also needs one | Intended by Rule 6; flagging because it changes an existing flow |
| D10 | Kumite scores on match records | PRD bouts allow scores above 10; older matches keep the 0–10 judge-average limit | The old limit would reject an 11–3 kumite result |

## Fixed along the way
- MUI v9 dropped `InputLabelProps`/`InputProps` and Stack/Box layout props. The new screens use `slotProps`/`sx`; the console's two Stacks, the accounts page and the app's loading box were fixed too (they were silently ignored).

## Pending — next modules, in order
1. Feed tournament rule settings into the kumite console (D6); map WALKOVER/DISQUALIFIED/CANCELLED (D2).
2. Referee/judge assignment per match in the UI → referee "assigned matches" (§37, §53).
3. Push updates to public pages (D7) and a next-match panel on the hall display (§38).
4. Limit staff accounts to assigned tournaments (§4, §49); forgot/reset password; optional admin 2FA.
5. File storage for photos, ID proofs, logos (D5).
6. Email notifications; weigh-in reminder (§47).
7. Native .xlsx import/export and server-side PDF if needed (D3, D4).
8. Server-side pagination and Mongo indexes (§62).
9. Kata panel when you bring kata back into scope (D1).
10. Earlier open front-end items: clock offset into the connection state, connection status indicator, display over socket, clearing the session on sign-out, token-expiry handling.
