# Karate Tournament Management System — PRD implementation checklist

Tracks every section of the PRD against what is built. Updated with each module.

**Legend:** ✅ Done · 🟡 Partial · ⬜ Pending · ⚠️ Discrepancy (deviates from the PRD — see [Discrepancies](#discrepancies))

**Where things live**

| Layer | Path | Notes |
|---|---|---|
| Business rules (one copy) | `packages/shared/tms.js` + `age.js`, `categories.js`, `lifecycle.js`, `pools.js`, `results.js`, `registration.js`, `permissions.js`, `audit.js`, `secret.js`, `files.js`, `reports.js`, `paging.js` | Run on the API; the web app calls them over REST |
| API | `packages/api/routes/tms.js` (admin), `public.js`, `coach.js`, `files.js`, `auth.js`; `lib/mailer.js`, `lib/pdf.js` | `/api/v1/tournaments/:id/...`, `/api/v1/public/...`, `/api/v1/coach/...`, `/api/v1/files/...`; `/public` socket namespace |
| Web | `packages/web/src/pages/tms/*` (admin tabs), `pages/public/*` (public site, coach portal), `components/tms/*` (reusable) | Admin: Tournaments → a tournament → **Manage tournament** |
| Tests | `packages/shared/tms.test.js` (§64 flow on the service), `packages/api/tms.test.js` (§64 flow over HTTP), `packages/api/account.test.js` (access, reset, 2FA) | Plus a browser run of §64 against the API (not committed; needs Playwright) |

**Kept as it was:** the login screen and its role quick-select chips (Admin, Referee, Judge 1–4), the kumite console, the judge/referee screens and the original tournament/category screens. Everything PRD is added on top.

**Merged with main:** main removed offline (local) mode and the Firebase mock, and added its own officials assignment, schedule clash checks, round-robin draw, mat takeover and list paging. This branch follows that: the app needs the API server; PRD bouts are scheduled through main's clash-checked match API; my paged endpoints use main's paging contract (`page` from 1, `limit`, `pages`).

---

## Module status (PRD §63 order)

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Project setup | ✅ | npm workspaces: `api`, `shared`, `web` |
| 2 | Authentication | ✅ | Login/logout, scrypt hashes, JWT, forgot/reset password by email, optional TOTP 2FA, sign-out on expiry |
| 3 | Roles / permissions | ✅ | Permission table for the 8 PRD roles plus Announcer and Viewer, enforced in API and web tabs; staff accounts limited to assigned tournaments and to their organisation |
| 4 | Tournament module | ✅ | All §5 fields, master age date, §6 lifecycle |
| 5 | Category configuration | ✅ | Age groups, weight categories, rules settings; each category may override pool size, pool split, system, duration, point gap, qualifiers, ruleset and kata settings |
| 6 | Registration system | ✅ | Configurable form, password link, coach portal |
| 7 | Team / player management | ✅ | |
| 8 | Bulk upload | ✅ | Excel (.xlsx) and CSV |
| 9 | Verification | ✅ | |
| 10 | Weigh-in | ✅ | |
| 11 | Categorization | ✅ | |
| 12 | Pool generation | ✅ | |
| 13 | Match generation | ✅ | |
| 14 | Kumite scoring | ✅ | Live console runs each tournament's (or category's) duration, point gap and point values; Timeout button; every live command logged, corrections audited; walkover / disqualification / cancellation recorded |
| 15 | Kata scoring | ✅ | Judging panel (3–7 judges, 5.0–10.0), configurable calculation, rounds with qualifiers, judge screen, live sheet, medals from the final |
| 16 | Results | ✅ | |
| 17 | Brackets | ✅ | |
| 18 | Certificates | ✅ | Server-generated PDF, plus a printable page |
| 19 | Reports | ✅ | Excel (.xlsx), CSV and server-generated PDF |
| 20 | Public pages | ✅ | |
| 21 | Real-time | ✅ | Scoring socket; a sign-in-free `/public` channel pushes updates to public pages and hall screens |
| 22 | Testing | ✅ | 556 automated tests; §64 and the new screens run in a browser against the API |

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
| Bulk Excel player upload | ✅ .xlsx and CSV |
| Player verification | ✅ |
| Payment management | ✅ manual recording; no gateway (PRD allows later) |
| Weigh-in management | ✅ |
| Automatic player categorization | ✅ |
| Kata and Kumite event management | ✅ kata by judging panel (or bouts), kumite by bouts |
| Pool/draw generation | ✅ |
| Match scheduling | ✅ |
| AKA/AO assignment | ✅ |
| Live match management | ✅ existing console |
| Kumite scoring | ✅ console, with tournament / category rules and point values |
| Kata scoring | ✅ judging panel, configurable calculation |
| Pool results | ✅ |
| Final/master pool | ✅ |
| Knockout/bracket | ✅ |
| Medal results | ✅ |
| Certificate generation | ✅ server PDF |
| Public live results | ✅ pushed |
| Reports and exports | ✅ Excel, CSV, PDF |
| Role-based access control | ✅ |
| Audit logs | ✅ |

### §2 Core design principle
- ✅ Configuration over hard-coding: age groups, weight categories, pool size, qualifiers, points, tie-breakers, bronze count, mats, match duration, point gap, fees, registration form — all per tournament.
- ✅ Tournament data isolation: every PRD record carries `tournamentId`; the service checks ownership on every id.

### §3 User roles
| Role | Status | Notes |
|---|---|---|
| 3.1 Super Admin | ✅ | `super_admin`: full permissions, always sees every tournament; roles and tournament access are set on the Accounts page |
| 3.2 Tournament Admin | ✅ | Existing `admin` role |
| 3.3 Registration Officer | ✅ | `registrar@kata.local` / `test123`. Sees Dashboard + Registrations only |
| 3.4 Weigh-in Officer | ✅ | `weighin@kata.local` / `test123`. Sees Weigh-in only |
| 3.5 Referee | ✅ | Existing; blocked from configuration (403 tested); sees "Assigned to me" |
| 3.6 Kata Judge | ✅ | `judge` role scores kata from the seat on their account (J1–J7) at **Kata scoring**; also sits on kumite panels as before |
| Announcer (your spec) | ✅ | `announcer@kata.local` / `test123`. Calls bouts to their mats (recorded, shown on the live board), reads latest results |
| Viewer (your spec) | ✅ | `viewer@kata.local` / `test123`. Read-only: dashboard, registrations, reports |
| 3.7 Coach / Team Manager | ✅ | No account: opens the registration link (password) → scoped session for one tournament and one team |
| 3.8 Public Viewer | ✅ | `/tournaments`, `/tournament/{slug}` |

The officer accounts are **not** on the login quick-select chips (kept unchanged); sign in by typing the address.

### §4 Authentication & authorization
| Item | Status |
|---|---|
| Login / logout | ✅ |
| Forgot password / password reset | ✅ one-time 30-minute email link (hash stored), same answer for unknown addresses, rate limited; needs the server |
| Role-based access | ✅ |
| Tournament-level permissions | ✅ accounts carry assigned tournaments (empty = all), checked on every request; coaches scoped to one tournament + team |
| Session management | ✅ JWT 12 h; signs out at expiry or on a rejected token; sign-out drops the match socket |
| Secure password storage | ✅ scrypt (accounts), PBKDF2 (link passwords) |
| Optional 2FA for admins | ✅ TOTP (authenticator apps), set up under My account; login asks for the code only when on |

### §5 Tournament management
- ✅ Name, logo (upload or URL), description, type (Kata / Kumite / Kata+Kumite), organizer, association, venue, address, city, district, state, country, contact person/mobile/email.
- ✅ Registration start/close, weigh-in date, start/end dates.
- ✅ **Master Age Calculation Date** — required before registration opens; cannot change once entries are locked.
- ✅ Logo upload (PNG/JPEG, public file); appears on the public page and certificates.
- ✅ Tournament rules and terms & conditions: shown on the public page; a coach must accept the terms to register a team (time of acceptance stored).

### §6 Tournament status
- ✅ DRAFT → … → ARCHIVED as a transition table; only listed moves allowed; every move audited; stepping back needs a reason. Pools auto-advance VERIFICATION/WEIGH_IN → DRAW_GENERATED.
- Note: the original `status` (draft/active/completed) used by the existing screens is kept; the PRD lifecycle is the new `lifecycleStatus`.

### §7 Age groups — ✅ name, gender, min/max age, active.
### §8 Age calculation — ✅ DOB vs master date (Rule 1), suggestion shown on every player, admin override with reason → audit log.
### §9 Weight categories — ✅ name, min, max, display label, active; open-ended `-35 KG` / `+45 KG`.
### §10 Event management — ✅ kata / kumite / both; each event has its own entry (category, override, division) on the player.
### §11 Registration form builder — ✅ add, remove, reorder, rename, required/optional, show/hide, field type (all 9 types), **Editable / Read-only** per field (read-only fields are shown to coaches and filled by the organisers). Categorisation fields can be renamed but not removed.
### §12 Default player fields — ✅ all 19 listed, plus Player ID (system-given, shown read-only), Emergency Contact and Blood Group. Age group / weight category are computed rather than typed.
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
- ✅ Downloadable error report (Excel or CSV) and Excel/CSV templates matching the tournament's own form.
- ✅ Accepts .xlsx (dates, numbers, formulas) and CSV. "Invalid category" is reported at categorisation rather than at upload.

### §16 Registration status — ✅ all 12 statuses as a transition table.
### §17 Verification — ✅ view, edit, approve (incl. bulk "approve all pending"), reject (reason required), request correction, change category, history (audit log), upload and view documents (photo, ID proof) — private to registration staff and the uploading team.
### §18 Payments — ✅ fee per event (kata, kumite, both, team) computed per player; amount, status (PENDING/PAID/FAILED/REFUNDED), method, transaction ID, date, receipt no. 🟡 team fee configured but not yet charged per team; no gateway (PRD: separate integration).
### §19 Weigh-in — ✅ kumite only; registered vs actual weight, time, officer, result, notes; PENDING/PASSED/FAILED/RECHECK_REQUIRED; moves to the fitting category when the tournament allows it (audited), otherwise flags a recheck.
### §20 Automatic categorization — ✅ gender + age + event + weight → "Boys 12-13 / Kumite / -35 KG"; issues listed per player (no group, overlapping groups, missing weight).
### §21 Category lock — ✅ Lock entries: coaches read-only, no new entries, category-deciding fields frozen, config frozen; unlock needs a reason and is audited.
### §22 Pool generation — ✅ per category, default 8, configurable, even split (20 → 7/7/6) or fewest pools (17 → 9 + 8); straight knockout as an alternative system, seeds first, byes as needed.
### §23 Pool options — ✅ random, seeded (snake by seed), manual move (logged, reason asked). Extra: clubmates kept apart where numbers allow; every draw reproducible from its stored seed.
### §24 Draw lock — ✅ needs entries locked and pools; blocks moves/redraws; unlock needs a reason.
### §25 Match generation — ✅ tournament, category, pool, round, match number (M-001…), mat, scheduled time, AKA, AO, status. Round robin per pool.
### §26 Red/Blue — ✅ AKA/AO stored on the match (`redId`/`blueId` + `akaPlayerId`/`aoPlayerId`), corners balanced per player; admin can swap corners before a bout starts (audited).
### §27 Match status — ✅ scheduled / open / live / completed / cancelled, plus result type COMPLETED / WALKOVER / DISQUALIFIED / CANCELLED (console kiken → walkover, shikkaku → disqualified). A cancelled bout counts for nobody. See D2 for naming.
### §28 Match screen — ✅ existing kumite console; admins open it from the match queue.
### §29 Kumite scoring config — ✅ match duration, winning point gap and score values (yuko / waza-ari / ippon, default 1/2/3) per tournament or per category, applied by the console to each bout before it starts (never mid-bout). Ruleset name per tournament/category.
### §30 Match event log — ✅ every live command stored per bout (who, when, score before/after) and viewable from the match queue ("Live score log"); a score that goes down (undo, −1, penalty taken back) or a cleared decision is also written to the audit log, e.g. "AKA 2 – AO 0 → AKA 0 – AO 0".
### §31 Undo / correction — ✅ console undo; result corrections after completion need a reason and are audited (Rule 6).
### §32–33 Kata — ✅ panel of 3–7 judges, scores 5.0–10.0 in 0.1 steps; calculation configurable (drop high/low then average or total, plain average or total); round 1 everyone in a drawn order, later rounds the top N in reverse order, last round the final; ties broken by total then best score; judges score from their own seat, admin can type a paper sheet; changed scores audited; medals from the final. Kata as bouts stays available (setting "Kata is decided by").
### §34 Pool results — ✅ played, wins, losses, score, points, penalties, rank, qualified; tie-breakers configurable (points, wins, head-to-head between two, score difference, score for, penalties).
### §35 Master pool / final — ✅ top N per pool (configurable) cross-seeded into a knockout (A1 v B2, B1 v A2).
### §36 Bracket — ✅ visual bracket, byes, fills itself as results arrive.
### §37 Scheduling — ✅ mat, date/time, referee and judges per match through main's match API (refuses double-booking anyone, checks judge count and roles); per-mat queue filter.
### §38 Live display — ✅ `/display` hall screen shows category, round, match number, result and the next bout on the mat; `/live` board shows every mat (bout on it, live score, next three, called bouts), latest results and rotating brackets / kata results; updates by push.
### §39 Public tournament page — ✅ `/tournament/{slug}` with info, categories, teams, players, draw (after draw lock), live matches, results and medal tally (after publish). Drafts are hidden.
### §40 Search — ✅ player name/ID, team, club, category, match number, district (public and admin).
### §41 Filters — ✅ gender, event, team, registration status, payment status, weigh-in status, age group, weight category, district, state, category, mat, match status, stage. Every list also exports as Excel, CSV or PDF.
### §42 Medals — ✅ stored on publish: player, team, club, category, event, rank, medal, tournament. Gold, silver, two bronzes (configurable). Admin can set a category's medals by hand (reason required, audited, reversible).
### §43 Medal tally — ✅ by club, district, state, country.
### §44 Certificates — ✅ every listed field incl. logo, unique certificate IDs; downloadable server-generated PDF, plus a printable page. Signature is a line, not an uploaded image.
### §45 Reports — ✅ all 11 reports (registration, player, team, category, weigh-in, pool, match, result, medal, payment, attendance) plus a club report (players, Kata, Kumite, both, medals per club) as Excel (.xlsx), CSV and server-generated PDF.
### §46 Dashboard — ✅ all listed counts per tournament, next matches; an admin **Dashboard** with totals across every tournament, what needs attention, and quick actions (new tournament, accounts, live board, public site).
### §47 Notifications — ✅ in-app and email: registration submitted/approved/rejected/correction, payment, weigh-in reminder, draw published, matches scheduled, results published (teams); new registration, bulk upload, payment received (organisers). Email via `SMTP_URL`; switchable per tournament. SMS/WhatsApp are Phase 3.
### §48 Audit log — ✅ user, role, action, entity, old → new, timestamp, IP and device, reason; screen with search, paged on the server. Covers status changes, locks/unlocks, DOB/weight edits, category overrides, pool moves, result corrections, approvals, payments, weigh-ins, publishing.
### §49 Data security
| Item | Status |
|---|---|
| Role-based authorization | ✅ |
| Validate all API inputs | ✅ unknown fields rejected, sizes bounded |
| Protect sensitive player info | ✅ public allow-list (Rule 8) |
| Hash passwords | ✅ |
| Secure authentication | ✅ |
| Prevent unauthorized tournament access | ✅ assigned tournaments enforced per request; coaches scoped |
| Validate uploaded files, types/sizes | ✅ spreadsheets ≤ 2 MB; photo/ID/logo: PNG/JPEG/PDF ≤ 2 MB checked by content on the server, served sandboxed |
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
### §52 Coach panel — ✅ team, players, registration, bulk upload (Excel/CSV), document uploads, payment and weigh-in status, notifications (also emailed), link to draw/results. 🟡 certificates download for coaches pending.
### §53 Referee panel — ✅ "Assigned to me" list, categories → matches → console; judges see only their own bouts (main's officials filtering); a tournament can show referees and judges only their assigned bouts (setting, enforced by the API).
### §54 Public website — ✅ home (`/tournaments`), details, categories, players, draw, live, results, tally.
### §55 Database entities — 🟡 implemented as collections: tournaments, ageGroups, weightCategories, teams, players (with event entries, payment and weigh-in embedded), pools, brackets, matches/competitors/categories (existing), medals, certificates, registrationLinks, notifications, auditLog, files, passwordResets, users, plus kataRounds, kataScores, medalOverrides, matchEvents and organizations. Indexed per tournament in Mongo. Embedded rather than separate tables for player_entries/payments/weigh_ins (D8).
### §56 API — ✅ modular `/api/v1/tournaments/{id}/settings|age-groups|weight-categories|teams|players|registrations|weigh-ins|pools|matches|results|certificates|...`; public APIs separate under `/api/v1/public`.
### §57 Real-time — ✅ scoring socket; a sign-in-free `/public` namespace pushes change notices (no data) to public pages and the scoreboard row to hall screens, and syncs server time for every screen. A connection chip shows live / reconnecting / offline.
### §58 Mobile — ✅ responsive layouts, scrolling tables, scrollable tabs; checked at 390 px.
### §59 UX — ✅ large action buttons, status badges with text + symbol (colour-independent), confirmations, search everywhere, filters, clear error messages, loading and empty states.
### §60 Confirmations — ✅ delete player/team/category, lock/unlock entries and draw, generate/regenerate pools, generate matches, publish results, change a final result. 🟡 delete tournament uses the existing screen's confirm.
### §61 MVP scope — Phase 1 ✅. Phase 2 ✅. Phase 3 ⬜ (out of scope), except multiple organisations, done at your request.
### §62 Non-functional — ✅ server-side paging for players and the audit log (the audit log pages in the database); Mongo indexes on every collection, scoped by tournament; Excel library loaded only when used. Scoring reliability from the server-authoritative match room. 🟡 player search still filters a tournament's players in memory before paging (fine for thousands, not millions).
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

Verified three ways: shared service test, HTTP test, and a browser run of every step against the API.

### §65 Future enhancements — ⬜ not started (by design).
### §66 Product vision — n/a.

---

## Discrepancies

| ID | PRD says | What is built | Status |
|---|---|---|---|
| D1 | Kata workflow and kata judge panel with configurable calculation (§32–33) | Built: panel rounds, judge screen, configurable calculation | ✅ Resolved |
| D12 | (new) Kata judged by a panel | Panel is now the default, so kata categories are no longer drawn into pools and bouts. Set "Kata is decided by: bouts" in Settings for the old flow | ⚠️ Changes the existing kata flow by default |
| D13 | (new) Multiple organisations (your spec, PRD Phase 3) | Accounts and tournaments carry an organisation; accounts with none (all existing ones) still see everything | ⚠️ Kept backwards compatible on purpose |
| D2 | Match statuses SCHEDULED…DISQUALIFIED (§27) | Bouts keep the scoring app's lowercase statuses (plus `cancelled`); walkover/disqualification are recorded as the result type | ✅ Resolved in behaviour; names differ so the existing console is untouched |
| D3 | Excel upload and export (§15, §45) | Native .xlsx in and out, CSV too | ✅ Resolved |
| D4 | Downloadable PDF certificates (§44) | Server-generated PDF, plus a printable page | ✅ Resolved |
| D5 | File uploads (§5, §12, §17) | Stored with the tournament, checked by content, private except logos | ✅ Resolved. Files sit in the database (≤ 2 MB each); move to object storage if volumes grow |
| D6 | Configurable kumite rules feeding scoring (§29) | Duration and point gap applied by the console per bout | ✅ Resolved |
| D7 | Real-time public updates (§57) | Pushed over the `/public` socket namespace | ✅ Resolved |
| D8 | Separate tables with foreign keys (§55) | Document collections; entries, payment and weigh-in embedded in the player; ownership checked in code; indexes added | ⚠️ By design for MongoDB |
| D9 | Changing a completed match result | Requires a reason everywhere (Rule 6). In API mode the old kata "reopen round" on a completed match also needs one | ⚠️ Intended by Rule 6; flagged because it changes an existing flow |
| D10 | Kumite scores on match records | PRD bouts allow scores above 10; older matches keep the 0–10 judge-average limit | ⚠️ Kept so existing kata matches stay validated |
| D11 | Offline use | Main removed offline mode; the app always needs the API server | ⚠️ Main's decision, followed here |

## Fixed along the way
- MUI v9 dropped `InputLabelProps`/`InputProps` and Stack/Box layout props. The new screens use `slotProps`/`sx`; the console's two Stacks, the accounts page, the app's loading box and one Stack on the login page were fixed too (they were silently ignored). The login role chips are unchanged.
- Hall screens opened with `?portal` now use the server clock offset like every other screen.
- Merging main: both branches had added an `array` validator type and `scheduledAt`/`refereeId` to the match schema; my duplicates would have silently disabled main's stricter checks, and were removed. Main's table search box used the `InputProps` MUI v9 ignores; fixed. Other screens from main still pass a few `inputProps`/`InputLabelProps` (console time fields, the tournament and schedule forms) that MUI v9 ignores — left as they are, outside this merge.

## Configuration (API)
| Variable | Purpose |
|---|---|
| `SMTP_URL` | e.g. `smtps://user:pass@smtp.example.com` — sends email. Unset: mail goes to an in-process outbox and the server log |
| `MAIL_FROM` | Sender address |
| `APP_URL` | Public web address, used in reset links and email links (never taken from the request) |
| `ADMIN_NOTIFY_EMAIL` | Organiser address when a tournament has no contact email |

## Your 33-point spec (gap list)

| Point | Status | Where |
|---|---|---|
| Admin dashboard + quick actions | ✅ | Dashboard (admin menu) |
| Tournament rules, terms & conditions | ✅ | Settings → Tournament details; public page; coach accepts terms |
| Per-category settings (pool size, system, duration, rounds, ruleset, qualifiers) | ✅ | Categories → ⚙ on an age group or weight category |
| Form fields Editable / Read-only; Emergency Contact, Blood Group, Player ID | ✅ | Settings → Registration form |
| 17 players → 9 + 8 | ✅ | Settings → "Splitting entries into pools: Fewest pools" (or per category) |
| Knockout system | ✅ | Settings / category → "Competition system: Straight knockout" |
| Timeout | ✅ | Console, per side |
| Configurable points (default 1/2/3) | ✅ | Settings → Yuko / Waza-ari / Ippon points |
| Swap / choose AKA–AO | ✅ | Matches → ⇄ before the bout |
| Announcer and Viewer roles | ✅ | `announcer@kata.local`, `viewer@kata.local` (password `test123` in memory mode; `test12345` from the sample seed) |
| Referees see only their matches | ✅ | Settings → "Referees and judges see only the matches they are assigned to" |
| Kata judging panel | ✅ | Kata panel tab (admin), Kata scoring (judges) |
| Manual medal override with audit | ✅ | Results → Override medals |
| `/live` board with next matches and brackets | ✅ | `/live?t=<slug>` |
| Public search by district | ✅ | Public page → Teams / Players |
| Club report with Kata/Kumite counts | ✅ | Reports → Club |
| District / state / age group / weight filters | ✅ | Registrations; drop-down filters on other lists |
| Export Excel / CSV / PDF on every list | ✅ | Export button on every tournament list (PDF through the browser's print) |
| Live score changes audited | ✅ | Matches → Live score log; Audit log |
| Multiple organisations (SaaS) | ✅ | Organisations (super admin); Accounts → Organisation; `/tournaments?org=<short-name>` |

## Pending
1. Small follow-ups (partial items above): certificate download for coaches (§52), team fee charged per team (§18), the PRD-style confirmation on deleting a tournament (§60).
2. The older screens from main (tournament list, accounts, referee match list) keep their own tables, so they do not have the new Export button yet.
