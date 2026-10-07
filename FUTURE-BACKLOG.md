# Future backlog

The current focus is the **MVP**: everything the PRD lists as MVP is built (see `PRD-V1-CHECKLIST.md`).
This file records everything deliberately left for later, so nothing is lost.

Each entry says what it is, what the app does instead today, and where the work would start.
Items are grouped by when they are needed, not by size.

## 1. Before the first large public event

These are not features; they are checks to run once the MVP is in use.

| Item | Today | Notes |
| --- | --- | --- |
| External penetration test | An internal security review was done and its findings fixed (`SECURITY-REVIEW.md`) | Test a staging copy, never a live event |
| Full mock tournament | `npm run seed:sample` builds a complete sample event | Real officials, real devices, the venue network |
| Load test against the real server | `npm run loadtest` passes in-process (10 mats, 600 spectators) | Run `npm run loadtest -- --url <staging> --email … --password …` from a machine the rate limit allows |
| Production settings | Documented in `README.md` and `packages/api/.env.example` | `NODE_ENV`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_*`, `CORS_ORIGIN`, `TRUST_PROXY`, `APP_URL` |
| Old demo accounts | Production no longer creates them, and warns at startup about any left | Any database created before the fix: change or delete the `@kata.local` accounts |

## 2. Final phase (by decision: free MVP first)

| Item | Today | Where the work would start |
| --- | --- | --- |
| **Payment gateway** (e.g. Razorpay, or UPI QR with proof upload) | Organisers record payments by hand: status, amount, method, transaction ID, receipt | `player.payment` already holds the fields; add a payment-intent route, a gateway webhook (use the idempotency middleware), and a "Pay" button in the coach portal |
| Team fee charged per team | The team fee is configured but only player fees are calculated | Fee calculation in `shared/tms.js`; payments report |

## 3. Phase 2 features (from PRD §29)

| Item | Today | Where the work would start |
| --- | --- | --- |
| **Offline scoring** | If the connection drops, the bout resumes where it was on reconnect; scoring itself needs the server | Queue commands in the browser (each already carries a `clientEventId`, so replays apply once) and sync on reconnect; needs conflict rules for two devices on one mat |
| Native mobile apps | Responsive web app, usable on phones | — |
| QR check-in | The announcer marks attendance by hand on the Call tab | A QR per player (on a pass); scanning calls the existing attendance route |
| Digital accreditation | — | Printable passes (photo, role, QR) for players, coaches and officials; reuse the certificate PDF code |
| Scale hardware integration | Weights are typed in at weigh-in | Read the scale over Web Serial or Bluetooth in the Weigh-in tab |
| Multi-venue optimisation | One schedule per tournament, mats numbered within it | Venues as a level above mats; scheduling across them |
| Advanced analytics | Reports and medal tally | Trends across tournaments, club and athlete history |
| More federation rulesets | Three standard rulesets (WKF, WKF kata technical/athletic, Youth). All are editable as new versions, and custom ones can be added | Enter each federation's rules in Admin → Rulesets when they are known; no code needed |

Phase 2 items already built early: SMS/WhatsApp notices (through a webhook), QR certificate verification, and partner entry import.

## 4. Smaller improvements noticed along the way

| Item | Today | Notes |
| --- | --- | --- |
| Hall scoreboard for several mats | `/display` shows one bout, the last one published; `/live` shows every mat | Give `/display` a mat parameter (`/display?mat=2`) and store one display document per mat |
| Coach certificate download | Players can find certificates on the public page when enabled; the coach portal has no certificates list | Add a certificates view to the coach portal |
| Player search at very large scale | Search filters a tournament's players in memory before paging | Fine for thousands of players; move to a database text index if events reach tens of thousands |
| Front-end bundle size | The main bundle is about 1.25 MB (Vite warns) | Split by route with `import()`; the Excel library is already loaded only when used |
| Several API servers at once | Rate limits, idempotency and the session cache are per process; one server per venue is fine | Put Redis behind those three interfaces |

## 5. Decided against (recorded so they are not reopened by accident)

| Item | Decision |
| --- | --- |
| Other languages (i18n) | The app is English only. The translation layer was removed. |
| Player photos on public pages | Not shown (Rule 8: photos are private files) |
| Payment required before approval | Not required; payment is tracked and reported separately |
| Laravel / MySQL (PRD §30 suggestion) | Kept Node.js, Express, MongoDB and React. The reasons are in `PRD-V1-CHECKLIST.md` §30 |
