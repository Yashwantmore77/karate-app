# Commands

Every command used to run, test and look after this app, grouped by what you
want to do. Written for **Windows Command Prompt**; Mac and Linux differences
are at the end.

Commands marked 🔴 delete data and cannot be undone.

All application data (tournaments, players, results, accounts) is created,
changed and deleted **in the app**, through its screens. No command here adds
records to the database or empties it; only backup and restore touch it, for
recovery.

---

## ⚠️ Read this first: which database a command works on

The server (`npm run server…`) and the backup and restore commands read the
settings file **`packages\api\.env`**.

| In `packages\api\.env` | The command works on |
| --- | --- |
| `MONGODB_URI=…` is set | **That database. If it is your live one, your live data.** |
| `MONGODB_URI` is missing or commented out | Memory only, forgotten when the command stops |

So keep the live address switched off unless you mean to touch live data. Put
a `#` in front of the line to switch it off, remove the `#` to switch it on:

```
# MONGODB_URI=mongodb+srv://…
```

The test tools in section 4 never use `MONGODB_URI`: they always run in memory.

**Never paste passwords, `MONGODB_URI` or `JWT_SECRET` into a chat, an issue
or a screenshot.** They belong in `packages\api\.env` on your computer, and in
Render's settings.

---

## 1. Get the latest code

Run in the top folder (`karate-app`):

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
- **Twelve test tournaments and a full set of test accounts.** Start the API like this instead:
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

## 3. The database: backup and restore

These work on the database named by `MONGODB_URI` in `packages\api\.env`. Run
them in `packages\api`.

**Back up everything to a file:**

```
cd packages\api
mkdir backups
npm run backup -- backups\day1.json
```

`mkdir backups` is needed only the first time. If the folder already exists,
it says so and nothing breaks. `npm run backup` with no file name prints the
backup to the screen instead.

**Restore a backup into an empty database:**

```
npm run restore -- backups\day1.json
```

It refuses a database that already holds data.

🔴 **Restore over existing data.** This wipes the database, then restores:

```
npm run restore -- backups\day1.json --replace
```

---

## 4. Test data and test tools (in memory only)

None of these put test data in a database. With `MONGODB_URI` set,
`SEED_SCENARIOS` is ignored, and `mock` and `loadtest` run in memory anyway
and keep nothing.

**Twelve test tournaments on your computer** (see section 2 for the test accounts):

```
set "SEED_SCENARIOS=true" && npm run server
```

**Rehearse a whole event end to end.** This runs every step with checks:

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

## 5. Tests and build

In the top folder:

```
npm test
npm run test:api
npm run test:web
npm run test:shared
npm run lint
npm run build
```

`npm test` runs every test. The next three run one part each. `npm run lint`
lists likely mistakes (unused code, hook dependencies) as warnings; it does not
fail on them yet. `npm run build` builds the website — the same build Vercel runs.

---

## 6. The operator handbook (pictures and PDF)

In the top folder:

```
npm run docs:screenshots
npm run docs:screenshots -- p5-console,p6-results
npm run docs:pdf
```

The first line retakes every picture, the second only the named ones, and the
third rebuilds `docs\operator-handbook\Operator-Handbook.pdf`.

The picture run starts a throwaway copy of the app by itself (on ports 4100 and
5273), with the test tournaments, in memory, and stops it at the end. It never
reads `.env`, so it never touches your live database, and each run starts from
fresh test data. A development server already running on 4000 / 5173 is left
alone.

To use servers you started yourself instead, set `APP_URL` and `API_URL`
(for example `set "APP_URL=http://localhost:5173" && set "API_URL=http://localhost:4000"`).
Start that API with `SEED_SCENARIOS=true` and `API_RATE_LIMIT=100000`, and
restart it between runs: a run changes the test data.

---

## 7. Live site settings

These are not commands: they are typed into the hosting sites' settings pages.

**Render** (the API) → your service → **Environment**:

| Setting | Value |
| --- | --- |
| `MONGODB_URI` | The Atlas connection string |
| `MONGODB_DB` | `kumite` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 64 random characters (see section 8) |
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

## 8. Fixing problems

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
| `401 invalid_credentials` | Wrong email or password. |
| `429` / `too_many_attempts` | 10 wrong sign-ins in a minute. Wait a minute. |
| `querySrv EBADRESP` | DNS on your computer — see above. |
| `MONGODB_URI is not set` | A warning from backup or restore: `.env` names no database, so the command is working on an empty memory store, not your live data. |

---

## Mac and Linux

The commands are the same except for these:

| Windows | Mac / Linux |
| --- | --- |
| `cd packages\api` | `cd packages/api` |
| `copy a b` | `cp a b` |
| `set "SEED_SCENARIOS=true" && npm run server` | `SEED_SCENARIOS=true npm run server` |
| `set "SEED_SCENARIOS=true" && set "API_RATE_LIMIT=100000" && node index.js` | `SEED_SCENARIOS=true API_RATE_LIMIT=100000 node index.js` |
| `ipconfig /flushdns` | macOS: `sudo dscacheutil -flushcache` |
