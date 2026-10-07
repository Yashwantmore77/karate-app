# Kumite tournament scoring

WKF-style kumite scoring for a tournament day: an admin sets up tournaments,
categories and competitors; a referee draws and schedules the bouts and runs
each one from a live console; judges watch the same console on their own
devices; a public scoreboard shows the hall what is on.

What it is meant to do, and what is out of scope, is in
[KUMITE-PRD.md](KUMITE-PRD.md).

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
match over Socket.IO. The front end has no offline or local mode; with no API
there is nothing to sign in against.

REST lives under `/api/v1`. `/health` sits outside it for uptime checks.

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything a referee can, plus tournaments, categories, competitors, accounts, the sign-in log, and deleting a match |
| Referee | Draw and create bouts, set time, mat and panel, run the console |
| Judge | Watch the console for bouts they are assigned to (read-only, per the PRD) |
| Scoreboard | `/display`, no sign-in |

There is no signup. Accounts are created by an admin.

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

# Terminal 1 — the API, in memory, with the seeded accounts
npm run server:dev

# Terminal 2 — the front end, at http://localhost:5173
cp packages/web/.env.example packages/web/.env
npm run dev
```

With no `MONGODB_URI` the API keeps everything in memory and forgets it on
restart. Its seeded accounts are listed in `packages/api/auth/users.js`.

### Sample data

```bash
npm run seed:sample -w @kumite/api              # add the sample tournament
npm run seed:sample -w @kumite/api -- --reset   # rebuild it from scratch
npm run mock -w @kumite/api                     # rehearse a whole event end to end (19 checked steps)
npm run loadtest -w @kumite/api                 # mats scoring live while spectators poll
```

Writes to the database in `packages/api/.env` (`MONGODB_URI`): one tournament,
"Sample State Open 2027" (`/tournament/sample-open-2027`), carried from setup to
live — age groups and weight categories, 6 teams, 62 players, pools, scheduled
bouts on 3 mats, results, a final stage, published medals and certificates —
plus the registration and weigh-in officer accounts if they are missing. It
never touches other tournaments, and running it twice does not duplicate
anything.

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
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first super admin of an empty production database (password 12+ characters). Production never seeds the demo accounts. |
| `SEED_DEMO_ACCOUNTS` | `true` to seed the demo accounts (password `test123`) into a database anyway; for staging only. |
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

## Known gaps

The current focus is the MVP, which is complete. Everything deferred is recorded in `FUTURE-BACKLOG.md`:

- what to check before a large event (penetration test, mock tournament, load test against the real server)
- the final phase (payment gateway)
- the Phase 2 features
- smaller improvements, for example a hall scoreboard per mat (`/display` shows one bout; `/live` shows every mat)
- decisions not to do something (other languages, public player photos)
