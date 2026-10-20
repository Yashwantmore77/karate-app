# Karate Tournament App

Runs a karate tournament from start to finish: an organiser sets up the
tournament and its categories, coaches register their players through a link,
officials weigh them in, the app draws pools and brackets and schedules the
bouts, referees and kata judges score live from their own devices, hall screens
and the public site show what is on, and results, certificates and reports come
out at the end. Kumite and kata follow WKF-style rules, and several
organisations can each run their own tournaments on one installation.

What it is meant to do, and what is out of scope, is in
[KUMITE-PRD.md](KUMITE-PRD.md).

How to run a tournament in the app, screen by screen, with screenshots, every
validation rule and what each message means, is in the
[user guide](docs/user-guide/README.md).

Someone running a tournament for the first time should start with the
[operator handbook](docs/operator-handbook/README.md): every job in order,
click by click, with checklists to print. It is also a
[PDF](docs/operator-handbook/Operator-Handbook.pdf) to print or send.

## How it fits together

```
packages/
  shared/   @kumite/shared  Clock maths, WKF scoring rules, the command reducer.
                            Pure logic, used by both sides so a device and the
                            server can never disagree on a score or a clock.
  web/      @kumite/web     React + Vite + MUI front end. Deployed to Vercel.
  api/      @kumite/api     Node + Express + Socket.IO. Deployed to Render.
                            MongoDB Atlas when MONGODB_URI is set, otherwise an
                            in-memory store that starts empty on every boot.
```

The API is the source of truth for everything, including a live bout: it
applies each referee command and pushes the result to every device on that
match over Socket.IO. Signing in and nearly every screen need the API. The one
exception is the referee's scoring console: if the connection drops during a
bout, it keeps scoring on the device and sends the commands when the connection
returns (its limits are in `FUTURE-BACKLOG.md`, section 4).

REST lives under `/api/v1`. `/health` sits outside it for uptime checks.

## Roles

| Role | Does |
| --- | --- |
| Super Admin | Everything an Admin does, plus organisations, Super Admin accounts and the full backup |
| Admin | Every tournament and tab, staff accounts, sign-ins, analytics and rulesets |
| Tournament Admin | Runs the tournaments it was given, every tab; no accounts or system screens |
| Registration Officer | Checks and approves the players coaches register |
| Weigh-in Officer | Records weights on the day; check-in and passes |
| Announcer | Calls the bouts to the mats |
| Referee | Scores bouts on the live console |
| Kata Judge | Scores a seat on a kata panel, and judges kumite bouts |
| Scoreboard Operator | Chooses what the hall screens show |
| Viewer (read-only) | Follows tournaments and analytics; changes nothing |
| Coach / Team Manager | Registers their own team and players through the registration link |

The hall scoreboard (`/display`), the live board (`/live`) and the public site
need no sign-in. What each role sees, screen by screen, is in the
[user guide](docs/user-guide/README.md), section 1.

There is no signup. An admin creates every account; the first Super Admin of a
new installation comes from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

## Help inside the app

- **ⓘ icons** next to page titles, section headings and key buttons explain what each one does. Hover on a computer; tap on a phone or tablet.
- **Guide** (top bar, every signed-in page) opens "How to run a tournament — step by step", plus what the signed-in role does.
- On the tournament screen, the **guide bar** under the tabs shows the current page, what comes before and after it, and the next step still to do for this tournament, with a **Go** button for each. **Full guide** lists all the steps and ticks the ones that are done.
- All help text lives in `packages/web/src/help/guide.js`, so it can be updated in one place. A test checks that every ⓘ icon has text.

## Scheduling rules

- A tournament sets the **slot length** (default 15 min) and **panel size**
  (default 4 judges).
- A bout can be given a time and a mat. Its slot runs from that time for the
  slot length.
- **Nobody can be in two overlapping bouts** — referee, judge or competitor —
  and **a mat holds one bout at a time**. The API refuses the write with
  `409 schedule_conflict` and names who or what clashes. Back-to-back slots are
  fine, unscheduled bouts hold nobody, and a completed bout releases everyone.
- **Draw Round Robin** creates a bout for every pair in a category that does not
  have one yet (up to 32 competitors). It can be pressed again after a late
  entry and only adds what is missing.

## Running it locally

Needs Node 22.9 or later (the API reads its `.env` with `--env-file-if-exists`).

```bash
npm install

# Terminal 1 — the API (in memory unless packages/api/.env names a database;
# sign in as BOOTSTRAP_ADMIN_EMAIL, or start it with SEED_SCENARIOS=true for test accounts)
npm run server:dev

# Terminal 2 — the front end, at http://localhost:5173
cp packages/web/.env.example packages/web/.env
npm run dev
```

With no `MONGODB_URI` the API keeps everything in memory and forgets it on
restart.

All application data (tournaments, players, results, accounts) is created,
changed and deleted in the app, through its screens and API, under its rules and
permissions. No script writes to or empties the database. The one record the
app makes by itself is the first Super Admin, from `BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD`, when the database has no accounts. `npm run backup`
and `npm run restore` are kept for recovery (see [COMMANDS.md](COMMANDS.md)).

### Test tournaments (in memory only)

```bash
SEED_SCENARIOS=true npm run server         # no database: load the 12 test tournaments into memory at start
```

They exist only in that server's memory and are never written to a database;
with `MONGODB_URI` set the setting is ignored. If there are no accounts, a test
roster is created (`admin@kata.local`, `referee@kata.local`, `judge1@kata.local`
… password `test12345`); if there are accounts but no referees or judges, test
officials are created instead (`test.referee1@test.local`, `test.judge1@test.local`
… same password), so every match has a panel. Dates are counted from the day the
server starts, so "open" is really open and "live" is today. The handbook's
screenshots are taken from these tournaments.

| # | Tournament | Stage | What it shows |
| --- | --- | --- | --- |
| 01 | Draft Cup | Draft | Details missing; registration cannot open yet |
| 02 | Monsoon Open | Registration open | Coach window starts next week |
| 03 | District Open | Registration open | Every registration status (approved, paid, unpaid, pending, submitted by coach, rejected, sent back), payments paid / pending / failed / refunded, a possible duplicate, a player with no category, an inactive team. Coach link password `coach123` |
| 04 | Coastal Cup | Verification | Window closed by date, link switched off, soft lock, entries still to verify |
| 05 | Western Zone Championship | Weigh-in | Passed, moved up a category, failed, recheck, not weighed; reminder sent |
| 06 | Senior Nationals Trials | Draw generated | Pools drawn but draw not locked; single entry awaiting a decision; 2 and 3 players; 17 split 9 + 8; knockout pool system; a pool move with a reason |
| 07 | Cadet Cup | Ready | Matches scheduled with mats, times and officials; corners swapped; passes printed, some checked in |
| 08 | State Championship | Live | Bouts scheduled, called, called twice, ready, open, live, paused, cancelled; results by points, senshu, hantei, 8-point gap, walkover, no-show, kiken, disqualification, manual override; an official correction; a withdrawal after the draw; single entries awarded / no competition; category results provisional (medals set by hand), verified, published, locked; knockout in progress; kata final half scored; 70% checked in |
| 09 | Diwali Karate Cup | Completed | Everything fought, published and locked; medal, participation and special-award certificates |
| 10 | Winter Open 2025 | Archived | Read-only history |
| 11 | School Kata Championship | Registration open | Kata-only tournament; SGFI categories loaded in one step; approved, rejected and waiting entries; an age group with no entries and one with a single entry |
| 12 | Junior Kumite League | Live | Kumite-only tournament; knockout brackets arranged by hand on the bracket board; quarter-finals done, byes, a walkover, a finished category with a third-place bout, one category still in pools |

### Rehearsal and load test (in memory only)

```bash
npm run mock -w @kumite/api                     # rehearse a whole Kata + Kumite event end to end (22 checked steps)
npm run mock -w @kumite/api -- --kata bouts     # the same, with kata fought as bouts (flags) on the mats
npm run loadtest -w @kumite/api                 # mats scoring live while spectators poll
```

Both start the API inside their own process, in memory, and keep nothing: a
database named in `.env` is never touched.

## Configuration

**Front end** (`packages/web/.env`, or Vercel project settings):

| Variable | Meaning |
| --- | --- |
| `VITE_SERVER_URL` | The API's origin, e.g. `http://localhost:4000`. Read at **build** time, so changing it on Vercel needs a redeploy. |

**API** (`packages/api/.env`, or Render environment). See
`packages/api/.env.example` for the full list with notes. The ones that matter in
production:

| Variable | Meaning |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | Atlas connection. Unset means in-memory. |
| `NODE_ENV` | Set to `production` on the live server. It turns on the production safety checks below. |
| `JWT_SECRET` | Token signing secret, **32+ characters; required in production** (the server will not start without it). In development, leaving it unset means a random secret per boot. |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | **The only account the app ever creates by itself**: the first Super Admin of an empty database (password 8+ characters, the same rule every account is held to). Leave them unset and the database stays empty, with nothing to sign in as. |
| `SHOW_TEST_CREDENTIALS` | `true` prints the pair above on the sign-in screen, with a button that fills the form. **Testing only** — it hands a working administrator password to anyone who can reach the API. |
| `CORS_ORIGIN` | The front end's origin, exactly — no trailing slash. |
| `TRUST_PROXY` | Set only when a proxy sits in front (Render does). |
| `APP_URL` | The front end's address, for certificate QR codes and email links. |
| `SMS_WEBHOOK_URL`, `WHATSAPP_WEBHOOK_URL` | Optional gateways for SMS / WhatsApp notices. |

Security review notes, and what to check before going live, are in `SECURITY-REVIEW.md`.

## Deploying

- **Front end — Vercel.** Builds from the repo root using `vercel.json`
  (`npm run build`, output `packages/web/dist`, every path rewritten to
  `index.html` so deep links survive a refresh).
- **API — Render**, as a persistent web service, not serverless: the live
  console needs a long-lived WebSocket and in-memory match rooms, neither of
  which survives on Vercel functions.
- **Database — MongoDB Atlas.**

Both deploy from `main`.

## Tests

```bash
npm test             # every package
npm run test:api
npm run test:web
npm run test:shared
```

The web tests never call a real API. Pages are tested against an in-memory
stand-in for the data layer (`packages/web/src/test/fakeDomain.js`), and the
live console against an in-memory match channel that runs the real shared
scoring engine (`packages/web/src/test/memoryMatchChannel.js`).

GitHub Actions runs `npm ci`, `npm test` and `npm run build` on every pull
request and on `main` (`.github/workflows/ci.yml`).

## Known gaps

The current focus is the MVP, which is complete. Everything deferred is recorded in `FUTURE-BACKLOG.md`:

- what to check before a large event (penetration test, mock tournament, load test against the real server)
- the final phase (payment gateway)
- the Phase 2 features
- smaller improvements, for example a hall scoreboard per mat (`/display` shows one bout; `/live` shows every mat)
- decisions not to do something (other languages, public player photos)
