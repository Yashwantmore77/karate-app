# Future backlog

The current focus is the **MVP**: everything the PRD lists as MVP is built (see `PRD-V1-CHECKLIST.md`).
Several Phase 2 items have since been built as well (listed at the end).
This file records everything deliberately left for later, so nothing is lost.

Each entry says what it is, what the app does instead today, and where the work would start.

## 1. Before the first large public event

These are not features; they are checks to run once the MVP is in use.

| Item | Today | Notes |
| --- | --- | --- |
| External penetration test | An internal security review was done and its findings fixed (`SECURITY-REVIEW.md`) | Test a staging copy, never a live event |
| Mock tournament on the venue setup | `npm run mock` rehearses a whole event end to end and passes all 19 steps in-process | Run `npm run mock -- --url <staging> --email … --password … --cleanup` against staging; then a day with real officials, devices and the venue network |
| Load test against the real server | `npm run loadtest` passes in-process (10 mats, 600 spectators) | Run `npm run loadtest -- --url <staging> --email … --password …` from a machine the rate limit allows |
| Production settings | Documented in `README.md` and `packages/api/.env.example` | `NODE_ENV`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_*`, `CORS_ORIGIN`, `TRUST_PROXY`, `APP_URL` |
| Old demo accounts | Production no longer creates them, and warns at startup about any left | Any database created before the fix: change or delete the `@kata.local` accounts |

## 2. Final phase (by decision: free MVP first)

| Item | Today | Where the work would start |
| --- | --- | --- |
| **Payment gateway** (e.g. Razorpay, or UPI QR with proof upload) | Organisers record payments by hand: status, amount, method, transaction ID, receipt | `player.payment` already holds the fields; add a payment-intent route, a gateway webhook (use the idempotency middleware), and a "Pay" button in the coach portal |
| Team fee charged per team (not needed now) | The team fee can be set, but only player fees are calculated | Fee calculation in `shared/tms.js`; payments report |

## 3. Not built yet (decided: not now)

| Item | Today | Where the work would start |
| --- | --- | --- |
| Native mobile apps | Installable web app (home-screen icon, full screen, opens offline) | Wrap the web app (e.g. Capacitor) if store presence is needed |
| Scale hardware integration | Weights are typed in at weigh-in | Read the scale over Web Serial or Bluetooth in the Weigh-in tab |
| Multi-venue optimisation | One schedule per tournament, mats numbered within it | Venues as a level above mats; scheduling across them |
| Front-end bundle size | The main bundle is about 1.25 MB (Vite warns); the service worker keeps it on the device after the first visit | Split by route with `import()` |
| Several API servers at once (Redis) | Rate limits, idempotency, the session cache and live match rooms are per process; one server per venue is fine | Put Redis behind those interfaces (and a Socket.IO adapter for match rooms) |
| More federation rulesets | Three standard rulesets (WKF, WKF kata technical/athletic, Youth), all editable as new versions; custom ones can be added | Enter each federation's rules in Admin → Rulesets when they are known; no code needed |

## 4. Known limits of what is built

| Item | Notes |
| --- | --- |
| Offline scoring: undo | While offline, *Undo* reaches back only through actions made offline, not to actions the server already had before the connection dropped |
| Offline scoring: confirming the result | Scoring continues offline, but *Confirm result* (saving the final result) needs the connection back |
| QR scanning | Uses the browser's camera: Chrome, Edge and Safari on phones and tablets. The code can always be typed instead |
| Passes | Photos appear when a PNG or JPEG photo was uploaded at registration; otherwise there is a frame to stick one on |

## 5. Decided against (recorded so they are not reopened by accident)

| Item | Decision |
| --- | --- |
| Other languages (i18n) | English only. The translation layer was removed. |
| Player photos on public pages | Not shown (Rule 8: photos are private files) |
| Payment required before approval | Not required; payment is tracked and reported separately |
| Laravel / MySQL (PRD §30 suggestion) | The current stack stays: Node.js, Express, MongoDB, React. The reasons are in `PRD-V1-CHECKLIST.md` §30 |

## Built beyond the MVP

These items were on the earlier versions of this list:

- Offline scoring (with conflict handling)
- Installable app (PWA)
- QR check-in
- Accreditation passes
- Analytics across tournaments
- One hall scoreboard per mat
- Certificates in the coach portal
- Database player search
- The automated mock tournament
- SMS/WhatsApp notices, QR certificate verification and partner entry import
