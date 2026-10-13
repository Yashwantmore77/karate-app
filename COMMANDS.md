# Commands

Every command used to run, test and look after this app, grouped by what you
want to do. Written for **Windows Command Prompt**; Mac and Linux differences
are at the end.

Commands marked 🔴 delete data and cannot be undone.

---

## ⚠️ Read this first: which database a command works on

Every command run from `packages\api` — and the `npm run server…` and
`npm run seed…` commands run from the top folder — reads the settings file
**`packages\api\.env`**.

| In `packages\api\.env` | The command works on |
| --- | --- |
| `MONGODB_URI=…` is set | **That database. If it is your live one, your live data.** |
| `MONGODB_URI` is missing or commented out | Memory only, forgotten when the command stops |

So keep the live address switched off unless you mean to touch live data. Put
a `#` in front of the line to switch it off, remove the `#` to switch it on:

```
# MONGODB_URI=mongodb+srv://…
```

The demo command (section 3) is the exception: with `--url` it talks to the
live site's API, and never reads `MONGODB_URI`.

**Never paste passwords, `MONGODB_URI` or `JWT_SECRET` into a chat, an issue
or a screenshot.** They belong in `packages\api\.env` on your computer, and in
Render's settings.

---

## 1. Get the latest code

Run in the top folder (`kata-app`):

```
git checkout main
git pull
npm install
```

`npm install` is needed only when the packages changed, but it is safe to run
every time.

---

## 2. Run the app on your computer

Open **two** Command Prompt windows in the top folder.

**Window 1 — the API**, at http://localhost:4000

```
npm run server:dev
```

`server:dev` restarts by itself when the code changes. `npm run server` does
the same without restarting.

**Window 2 — the website**, at http://localhost:5173

```
copy packages\web\.env.example packages\web\.env
npm run dev
```

The `copy` line is needed only the first time.

### Signing in on your computer

The app comes with **no accounts**. Choose one of these two:

- **Your own administrator.** Put these lines in `packages\api\.env`, then start the API:
  ```
  BOOTSTRAP_ADMIN_EMAIL=you@example.com
  BOOTSTRAP_ADMIN_PASSWORD=at-least-8-characters
  ```
- **Ten test tournaments and a full set of test accounts.** Start the API like this instead:
  ```
  set "SEED_SCENARIOS=true" && npm run server
  ```
  Then sign in as `admin@kata.local` with the password `test12345`. Other test
  accounts include `referee@kata.local`, `judge1@kata.local`, `owner@kata.local`
  (a Tournament Admin) and `superadmin@kata.local`, all with the same password.

  This works in memory only. It is ignored when `MONGODB_URI` is set, so the
  test accounts can never land in your live database this way. If you also set
  `BOOTSTRAP_ADMIN_…`, you sign in as your own administrator instead, and only
  test referees and judges are added (password `test12345`).

---

## 3. Demo tournaments on your live site

Creates two demo tournaments on the live site:

- **Pune District Karate Championship (Demo)** — fully played: every bout scored, results published, certificates issued.
- **Nashik Open Karate Championship (Demo)** — ready to run: drawn, timetabled with referees, live, with nothing scored yet.

**Once:** put your live administrator's login in `packages\api\.env`

```
DEMO_ADMIN_EMAIL=your-admin-email
DEMO_ADMIN_PASSWORD=your-admin-password
```

Write each line plainly, with no quotes, no spaces around `=`, and nothing
after the password.

**Create them:**

```
cd packages\api
npm run demo -- --url https://karate-app-06ow.onrender.com
```

It takes about 5 minutes. At the end it prints the demo accounts and **one
password for all of them**. Keep that password to yourself. The demo accounts
can reach only the two demo tournaments.

**Just one of the two:**

```
npm run demo -- --url https://karate-app-06ow.onrender.com --only played
npm run demo -- --url https://karate-app-06ow.onrender.com --only ready
```

🔴 **Take them out again.** This deletes the two demo tournaments and every
`@demo.karate.test` account, and nothing else:

```
npm run demo -- --url https://karate-app-06ow.onrender.com --remove
```

**Try it on your computer first.** This runs in memory and saves nothing:

```
npm run demo
```

---

## 4. The database: backup, restore, empty

These work on the database named by `MONGODB_URI` in `packages\api\.env`. Run
them in `packages\api`.

**Back up everything to a file:**

```
cd packages\api
mkdir backups
npm run backup -- backups\day1.json
```

`mkdir backups` is needed only the first time. If the folder already exists,
it says so and nothing breaks.

**Restore a backup into an empty database:**

```
npm run restore -- backups\day1.json
```

It refuses a database that already holds data.

🔴 **Restore over existing data.** This wipes the database, then restores:

```
npm run restore -- backups\day1.json --replace
```

🔴 **Empty the database, leaving one administrator.** This deletes every
tournament, player, result, file, log and account:

```
npm run db:reset -- --yes
```

Before deleting anything, it checks that `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` are in `packages\api\.env`. Those become the one
account left. Without them it refuses, so it cannot lock you out. It prints the
database name before it drops anything.

---

## 5. Test data

These write to the database in `packages\api\.env` when `MONGODB_URI` is set,
and to memory when it is not (see the top of this file).

> ⚠️ `seed:scenarios`, `seed:sample` and `loadtest` create accounts with the
> known password `test12345`. If you run them against your live database,
> delete those accounts afterwards.

**In memory only, on your computer:**

```
set "SEED_SCENARIOS=true" && npm run server
```

**Ten test tournaments into the database in `.env`:**

```
npm run seed:scenarios
```

🔴 **Same, but delete every tournament and match first.** A backup is written to
`packages\api\backups\` before anything is deleted.

```
npm run seed:scenarios -- --wipe --yes
```

**One sample tournament, carried from setup to live results:**

```
cd packages\api
npm run seed:sample
npm run seed:sample -- --reset
```

The second line removes the sample tournament first, then builds it again.

**Rehearse a whole event end to end.** This runs every step with checks, and
leaves a "Mock Open" tournament behind:

```
cd packages\api
npm run mock
npm run mock -- --kata bouts
npm run mock -- --teams 6 --players 8 --mats 3
```

`--kata bouts` decides kata by flags on the mats instead of on the judges'
panel. The last line sets the size of the rehearsal.

**Event-day load test.** Many mats scoring at once while spectators watch:

```
cd packages\api
npm run loadtest
npm run loadtest -- --mats 8 --viewers 300 --seconds 60
```

---

## 6. Tests and build

In the top folder:

```
npm test
npm run test:api
npm run test:web
npm run test:shared
npm run build
```

`npm test` runs every test. The next three run one part each. `npm run build`
builds the website — the same build Vercel runs.

---

## 7. The operator handbook (pictures and PDF)

The pictures are taken from the app running with its test tournaments. First,
start the API with test data (section 2) and the website in a second window.
Then, in the top folder:

```
npm run docs:screenshots
npm run docs:screenshots -- p5-console,p6-results
npm run docs:pdf
```

The first line retakes every picture, the second only the named ones, and the
third rebuilds `docs\operator-handbook\Operator-Handbook.pdf`.

The screenshot run changes the test data as it goes. To run it twice, restart
the API in between.

---

## 8. Live site settings

These are not commands: they are typed into the hosting sites' settings pages.

**Render** (the API) → your service → **Environment**:

| Setting | Value |
| --- | --- |
| `MONGODB_URI` | The Atlas connection string |
| `MONGODB_DB` | `kumite` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 64 random characters (see section 9) |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first administrator, created only when the database has no accounts |
| `CORS_ORIGIN` | `https://karate-app-delta.vercel.app` (no `/` at the end) |
| `APP_URL` | `https://karate-app-delta.vercel.app` |
| `TRUST_PROXY` | `1` |
| `NODE_VERSION` | `22` |
| `SHOW_TEST_CREDENTIALS` | `true` shows the administrator's login on the sign-in page. **Testing only — remove it before real use.** |

Saving restarts the server.

**Vercel** (the website) → **Settings** → **Environment Variables**:

| Setting | Value |
| --- | --- |
| `VITE_SERVER_URL` | `https://karate-app-06ow.onrender.com` |

After changing it, **redeploy**. The value is read when the site is built.

**Never put `MONGODB_URI` or any password in Vercel.** Everything there is
visible to anyone who opens the website.

---

## 9. Fixing problems

**Is the live server up, and on the database?**
Open https://karate-app-06ow.onrender.com/health in a browser. It should say
`"storage":"mongodb"`. If it says `"memory"`, Render's `MONGODB_URI` is wrong.
On the free plan the first visit after a quiet spell can take up to a minute.

**Make a new JWT secret:**

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Which kind of database address is `.env` using?** This shows the start of
the address, never the password:

```
cd packages\api
node --env-file-if-exists=.env -e "console.log(process.env.MONGODB_URI.split('://')[0]+'://')"
```

**Is the demo login in `.env` read correctly?** This shows the email and the
password's length, never the password:

```
cd packages\api
node --env-file-if-exists=.env -e "const e=process.env.DEMO_ADMIN_EMAIL||'',p=process.env.DEMO_ADMIN_PASSWORD||'';console.log('email:',JSON.stringify(e));console.log('password length:',p.length,'| spaces at the ends:',p!==p.trim())"
```

**`querySrv EBADRESP` — your computer cannot look up the database.** This is a
DNS problem. First clear the DNS cache:

```
ipconfig /flushdns
```

To check whether a public DNS server can see the cluster, run the line below
with your cluster's host name in place of `<cluster-host>`:

```
nslookup -type=SRV _mongodb._tcp.<cluster-host> 8.8.8.8
```

To fix it, choose one of these:

- Set Windows to use DNS servers `1.1.1.1` and `8.8.8.8`: Settings → Network & Internet → your connection → DNS server assignment → Edit.
- In Atlas → Connect → Drivers, turn on **Legacy URI String**, and use that `mongodb://` address in `packages\api\.env`. Keep the `mongodb+srv://` one on Render.

**A setting in `.env` is ignored.** An environment variable already set in
Windows wins over `.env`. Check for one, and clear it for this window:

```
if defined MONGODB_URI (echo SET IN WINDOWS) else (echo not set)
set MONGODB_URI=
```

**Common messages:**

| Message | Meaning |
| --- | --- |
| `401 invalid_credentials` | Wrong email or password. Sign in on the website with exactly the same values to check. |
| `429` / `too_many_attempts` | 10 wrong sign-ins in a minute. Wait a minute. |
| `querySrv EBADRESP` | DNS on your computer — see above. |
| `Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD … first` | `db:reset` needs those in `packages\api\.env`. |
| `already there … Run with --remove first` | The demo tournaments exist. Remove them, then create them again. |
| `MONGODB_URI is not set` | That command needs a database, and `.env` names none. |

---

## Mac and Linux

The commands are the same except for these:

| Windows | Mac / Linux |
| --- | --- |
| `cd packages\api` | `cd packages/api` |
| `copy a b` | `cp a b` |
| `set "SEED_SCENARIOS=true" && npm run server` | `SEED_SCENARIOS=true npm run server` |
| `ipconfig /flushdns` | macOS: `sudo dscacheutil -flushcache` |
