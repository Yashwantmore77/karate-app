// Retakes the handbook's screenshots (docs/operator-handbook/images/*.webp).
// Each one marks where to click with a numbered yellow box.
//
// It drives the app running with its test tournaments, which it changes as it
// goes (it opens kata rounds and adds a fifth judge), so use a server you can
// throw away:
//
//   cd packages/api && SEED_SCENARIOS=true API_RATE_LIMIT=100000 node index.js
//   cd packages/web && VITE_SERVER_URL=http://localhost:4000 npx vite --port 5173
//   npm run docs:screenshots              # every picture
//   npm run docs:screenshots -- p5-console,p6-results   # just these
//
// APP_URL and API_URL point it at another server, IMAGES_DIR saves the pictures
// somewhere else. Then rebuild the PDF: npm run docs:pdf
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from './browser.mjs'

const OUT = process.env.IMAGES_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'images')
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const BASE = process.env.APP_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:4000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (method, url, body, token) => {
  const r = await fetch(`${API}/api/v1${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const tokens = {}
const accounts = { admin: 'admin@kata.local', referee: 'referee@kata.local', judge: 'judge1@kata.local', announcer: 'announcer@kata.local', scoreboard: 'scoreboard@kata.local' }
for (const [role, email] of Object.entries(accounts)) tokens[role] = (await api('POST', '/auth/login', { email, password: 'test123' })).body.token
// The test tournaments load in the background after the server starts.
let ts = []
for (let i = 0; i < 120 && ts.length < 12; i += 1) {
  ts = (await api('GET', '/tournaments?limit=50', null, tokens.admin)).body.tournaments || []
  if (ts.length < 12) await sleep(1000)
}
const t = Object.fromEntries(ts.map((x) => [x.slug.replace(/^test-/, ''), x]))
// A kata panel has 5 seats; the test accounts fill seats 1 to 4.
const fifthJudge = () => api('POST', '/users', { email: 'judge5@kata.local', password: 'test12345', role: 'judge', seat: 5 }, tokens.admin)

const browser = await launchChromium({ args: ['--lang=en-IN'] })
const pageAs = async (role, { width = 1280, height = 860 } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Kolkata', locale: 'en-IN' })
  await ctx.addInitScript(([tok]) => {
    if (tok) sessionStorage.setItem('kt:v1:token', tok)
    try { localStorage.setItem('kt:v1:guide-hidden', '1') } catch { /* private mode */ }
  }, [role ? tokens[role] : null])
  return ctx.newPage()
}
const manage = (slug, tab) => `${BASE}/admin/tournament/${t[slug].id}/manage?tab=${tab}`

// Draw a numbered box around each element. A mark is [locator or {box}, number, {at, pad}];
// `at` puts the number top-left (tl), top-right (tr), left (l), right (r) or bottom-left (bl).
const COLOR = '#FFC107'
const mark = async (page, marks) => {
  const boxes = []
  for (const [loc, n, opts = {}] of marks) {
    let b = loc.box
    if (!b) {
      await loc.waitFor({ state: 'visible', timeout: 15000 })
      b = await loc.boundingBox()
    }
    boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height, n, pad: opts.pad ?? 4, at: opts.at || 'tl' })
  }
  await page.evaluate(({ boxes, COLOR }) => {
    document.getElementById('hb-layer')?.remove()
    const layer = document.createElement('div')
    layer.id = 'hb-layer'
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    const S = 30
    for (const b of boxes) {
      const r = document.createElement('div')
      r.style.cssText = `position:fixed;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${b.w + 2 * b.pad}px;height:${b.h + 2 * b.pad}px;border:3px solid ${COLOR};border-radius:8px;box-shadow:0 0 0 2px rgba(0,0,0,.6), inset 0 0 0 1px rgba(0,0,0,.4);box-sizing:border-box`
      layer.appendChild(r)
      let bx = b.x - b.pad - S / 2, by = b.y - b.pad - S / 2
      if (b.at === 'tr') bx = b.x + b.w + b.pad - S / 2
      if (b.at === 'l') { bx = b.x - b.pad - S - 6; by = b.y + b.h / 2 - S / 2 }
      if (b.at === 'r') { bx = b.x + b.w + b.pad + 6; by = b.y + b.h / 2 - S / 2 }
      if (b.at === 'bl') by = b.y + b.h + b.pad - S / 2
      bx = Math.max(2, Math.min(window.innerWidth - S - 2, bx))
      by = Math.max(2, Math.min(window.innerHeight - S - 2, by))
      const d = document.createElement('div')
      d.textContent = b.n
      d.style.cssText = `position:fixed;left:${bx}px;top:${by}px;width:${S}px;height:${S}px;border-radius:50%;background:${COLOR};color:#111;font:800 17px/${S}px Arial,Helvetica,sans-serif;text-align:center;box-shadow:0 0 0 2px #111, 0 2px 6px rgba(0,0,0,.6)`
      layer.appendChild(d)
    }
    document.body.appendChild(layer)
  }, { boxes, COLOR })
  return boxes
}
// The area to keep: the marked boxes plus a margin, at least minW x minH, inside the window.
const around = (page, boxes, { pad = 60, minW = 720, minH = 380, x0, y0, x1, y1 } = {}) => {
  const vp = page.viewportSize()
  let l = Math.min(...boxes.map((b) => b.x)) - pad, tp = Math.min(...boxes.map((b) => b.y)) - pad
  let r = Math.max(...boxes.map((b) => b.x + b.w)) + pad, bt = Math.max(...boxes.map((b) => b.y + b.h)) + pad
  if (x0 !== undefined) l = x0
  if (y0 !== undefined) tp = y0
  if (x1 !== undefined) r = x1
  if (y1 !== undefined) bt = y1
  if (r - l < minW) { const c = (l + r) / 2; l = c - minW / 2; r = c + minW / 2 }
  if (bt - tp < minH) { const c = (tp + bt) / 2; tp = c - minH / 2; bt = c + minH / 2 }
  if (l < 0) { r -= l; l = 0 }
  if (tp < 0) { bt -= tp; tp = 0 }
  if (r > vp.width) { l -= r - vp.width; r = vp.width }
  if (bt > vp.height) { tp -= bt - vp.height; bt = vp.height }
  l = Math.max(0, l); tp = Math.max(0, tp)
  return { x: Math.round(l), y: Math.round(tp), width: Math.round(r - l), height: Math.round(bt - tp) }
}
const shot = async (name, fn) => {
  if (ONLY && !ONLY.has(name)) return
  try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); process.exitCode = 1 }
}
const open = async (role, url, { wait, settle = 1500, ...opts } = {}) => {
  const page = await pageAs(role, opts)
  await page.goto(url)
  if (wait) await (typeof wait === 'string' ? page.getByText(wait).first() : wait(page)).waitFor({ timeout: 25000 })
  await page.waitForTimeout(settle)
  return page
}
// Scroll an element to a given fraction of the way down the window.
const bring = async (page, loc, frac = 0.3) => {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const vh = page.viewportSize().height
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), b.y - vh * frac)
  await page.waitForTimeout(900)
}
// Screenshots are saved as WebP, which the browser itself encodes.
let encoder
const toWebp = async (png) => {
  encoder ??= await browser.newPage()
  const url = await encoder.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    return canvas.toDataURL('image/webp', 0.9)
  }, png.toString('base64'))
  return Buffer.from(url.split(',')[1], 'base64')
}
const save = async (page, name, clip, { keep = false } = {}) => {
  fs.writeFileSync(path.join(OUT, `${name}.webp`), await toWebp(await page.screenshot(clip ? { clip } : {})))
  if (!keep) await page.context().close()
}
const btn = (page, name, exact = true) => page.getByRole('button', { name, exact }).first()
// One box around several elements.
const union = async (locs) => {
  const bs = []
  for (const l of locs) { await l.waitFor({ state: 'visible', timeout: 15000 }); bs.push(await l.boundingBox()) }
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y))
  return { box: { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y } }
}
const dialogBox = async (dialog) => { const d = await dialog.boundingBox(); return [{ x: d.x, y: d.y, w: d.width, h: d.height }] }
const formControl = (loc) => loc.locator('xpath=ancestor::div[contains(@class,"MuiFormControl")][1]')

// --- 2. Sign in and find your way around ------------------------------------------------
await shot('signin', async () => {
  const page = await open(null, `${BASE}/login`, { wait: 'Sign in as' })
  await page.getByLabel('Email').fill('you@yourclub.in')
  await page.getByLabel('Password').fill('your-password')
  const boxes = await mark(page, [[page.getByLabel('Email'), 1], [page.getByLabel('Password'), 2], [btn(page, 'Sign in'), 3]])
  await save(page, 'signin', around(page, boxes, { pad: 50, minW: 640, y0: 120, y1: 760 }))
})
await shot('topbar', async () => {
  const page = await open('admin', `${BASE}/admin`, { wait: 'Test 08', height: 520, width: 1440 })
  const boxes = await mark(page, [[btn(page, 'Tournaments'), 1], [btn(page, 'Matches'), 2], [btn(page, 'Accounts'), 3], [btn(page, 'Guide'), 4], [btn(page, 'My account'), 5], [btn(page, 'Sign out'), 6]])
  await save(page, 'topbar', around(page, boxes, { x0: 0, x1: 1440, y0: 0, y1: 360 }))
})
await shot('tournament-screen', async () => {
  const page = await open('admin', manage('district-open', 'overview'), { wait: 'Needs attention', height: 860 })
  await mark(page, [
    [btn(page, 'Back'), 1],
    [page.locator('.MuiChip-root').filter({ hasText: 'Registration open' }).first(), 2],
    [page.getByRole('tablist').first(), 3, { at: 'l' }],
    [page.getByText(/needs attention/i).first().locator('xpath=ancestor::div[contains(@class,"MuiPaper") or contains(@class,"MuiBox")][2]'), 4],
    [btn(page, 'Full guide'), 5],
    [await union([btn(page, '→ Registration closed'), btn(page, '← Draft')]), 6, { at: 'l' }],
  ])
  await save(page, 'tournament-screen')
})

// --- 4. Part 1: set up the tournament ------------------------------------------------------
await shot('p1-new', async () => {
  const page = await open('admin', `${BASE}/admin`, { wait: 'Test 08', height: 600 })
  const boxes = await mark(page, [[btn(page, 'New Tournament'), 1]])
  await save(page, 'p1-new', around(page, boxes, { x0: 380, x1: 1280, y0: 0, y1: 470 }))
})
await shot('p1-create', async () => {
  const page = await open('admin', `${BASE}/admin?create=1`, { wait: (p) => p.getByRole('dialog') })
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Tournament Name').fill('Pune District Open 2026')
  await dialog.getByLabel('Location').fill('Pune')
  // The date box reads month/day/year; 11/15 cannot be mistaken for a day/month date.
  await dialog.getByLabel('Tournament Date').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.type('11152026', { delay: 120 })
  await page.waitForTimeout(400)
  await mark(page, [
    [dialog.getByLabel('Tournament Name'), 1], [dialog.getByLabel('Location'), 2],
    [formControl(dialog.getByLabel('Tournament Date').first()), 3],
    [formControl(dialog.getByRole('combobox').first()), 4],
    [dialog.getByRole('button', { name: 'Create Tournament' }), 5],
  ])
  await save(page, 'p1-create', around(page, await dialogBox(dialog), { pad: 30 }))
})
await shot('p1-open', async () => {
  const page = await open('admin', `${BASE}/admin`, { wait: 'Test 08', height: 600 })
  const row = page.getByRole('row').filter({ hasText: 'Test 01' }).first()
  const boxes = await mark(page, [[row.getByRole('button', { name: 'View' }), 1]])
  await save(page, 'p1-open', around(page, boxes, { x0: 380, x1: 1280, minH: 300 }))
})
await shot('p1-settings', async () => {
  const page = await open('admin', manage('draft-cup', 'setup'), { wait: 'Tournament type', height: 1000 })
  await mark(page, [
    [page.getByRole('tab', { name: 'Settings' }), 1],
    [formControl(page.getByLabel('Master Age Calculation Date *')), 2],
    [formControl(page.getByLabel('Registration opens')), 3],
    [formControl(page.getByLabel('Registration closes')), 4],
  ])
  await save(page, 'p1-settings')
})
await shot('p1-save', async () => {
  const page = await open('admin', manage('draft-cup', 'setup'), { wait: 'Tournament type', height: 700 })
  const b = btn(page, 'Save details')
  await bring(page, b, 0.6)
  const boxes = await mark(page, [[b, 1]])
  await save(page, 'p1-save', around(page, boxes, { x0: 0, x1: 1280, minH: 420 }))
})
await shot('p1-cats', async () => {
  const page = await open('admin', manage('draft-cup', 'categories'), { wait: 'Age groups', height: 900 })
  await mark(page, [[btn(page, 'Load standard categories'), 1], [btn(page, 'Add age group'), 2], [btn(page, 'Add weight category'), 3]])
  await save(page, 'p1-cats')
})
await shot('p1-agegroup', async () => {
  const page = await open('admin', manage('draft-cup', 'categories'), { wait: 'Age groups' })
  await btn(page, 'Add age group').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByLabel('Name').fill('Boys 12-13')
  await dialog.getByLabel('Minimum age').fill('12')
  await dialog.getByLabel('Maximum age').fill('13')
  await mark(page, [
    [dialog.getByLabel('Name'), 1], [formControl(dialog.getByRole('combobox').first()), 2],
    [dialog.getByLabel('Minimum age'), 3], [dialog.getByLabel('Maximum age'), 4], [dialog.getByRole('button', { name: 'Save' }), 5],
  ])
  await save(page, 'p1-agegroup', around(page, await dialogBox(dialog), { pad: 30 }))
})
await shot('p1-accounts', async () => {
  const page = await open('admin', `${BASE}/admin/accounts`, { wait: 'admin@kata.local', height: 600 })
  const boxes = await mark(page, [[btn(page, 'Accounts'), 1], [btn(page, 'New account'), 2]])
  await save(page, 'p1-accounts', around(page, boxes, { x0: 0, x1: 1280, y0: 0, y1: 460 }))
})
await shot('p1-account-form', async () => {
  const page = await open('admin', `${BASE}/admin/accounts`, { wait: 'admin@kata.local' })
  await btn(page, 'New account').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByLabel('Email').fill('referee.mat1@yourclub.in')
  await dialog.getByLabel('Password').fill('a-long-password')
  await dialog.getByLabel('Role').click()
  await page.getByRole('option', { name: /^Referee$/ }).first().click()
  await page.waitForTimeout(300)
  await mark(page, [
    [dialog.getByLabel('Email'), 1], [dialog.getByLabel('Password'), 2],
    [formControl(dialog.getByLabel('Role')), 3],
    [dialog.getByLabel('Seat (judges only)'), 4],
    [dialog.getByRole('button', { name: 'Create account' }), 5],
  ])
  await save(page, 'p1-account-form', around(page, await dialogBox(dialog), { pad: 30 }))
})

// --- 5. Part 2: registration ------------------------------------------------------------------
await shot('p2-open', async () => {
  const page = await open('admin', manage('draft-cup', 'overview'), { wait: 'Needs attention', height: 760 })
  await mark(page, [[btn(page, 'Fill in the details'), 1], [btn(page, '→ Registration open'), 2]])
  await save(page, 'p2-open')
})
await shot('p2-link', async () => {
  const page = await open('admin', manage('district-open', 'setup'), { wait: 'Registration link', height: 760 })
  const copy = btn(page, 'Copy link')
  await bring(page, copy, 0.3)
  const boxes = await mark(page, [
    [copy, 1],
    [page.getByLabel('New password (leave blank to keep)'), 2], [btn(page, 'Set password'), 3],
    [formControl(page.getByLabel('Expires on')), 4], [btn(page, 'Save expiry'), 5],
    [page.getByLabel('Enabled').locator('xpath=ancestor::label[1]'), 6],
  ])
  await save(page, 'p2-link', around(page, boxes, { x0: 0, x1: 1280, pad: 70 }))
})
await shot('p2-coach', async () => {
  const link = (await api('GET', `/tournaments/${t['district-open'].id}/registration-link`, null, tokens.admin)).body.link
  const page = await open(null, `${BASE}/register/${link.token}`, { settle: 2500, height: 600 })
  await mark(page, [[page.getByLabel(/password/i).first(), 1], [btn(page, 'Continue'), 2]])
  await save(page, 'p2-coach', { x: 330, y: 0, width: 620, height: 300 })
})
await shot('p2-approve', async () => {
  const page = await open('admin', manage('district-open', 'registrations'), { wait: 'Needs attention', height: 900 })
  const pending = page.getByRole('row').filter({ hasText: /Pending/ }).filter({ has: page.getByRole('button', { name: 'Approve', exact: true }) }).first()
  await bring(page, pending, 0.75)
  const icons = await union([pending.getByRole('button', { name: 'Approve', exact: true }), pending.getByRole('button', { name: 'Request correction', exact: true })])
  await mark(page, [
    [pending.getByText('Pending verification'), 1, { at: 'l' }],
    [icons, 2],
    [btn(page, 'Approve all pending'), 3, { at: 'l' }],
  ])
  await save(page, 'p2-approve')
})
await shot('p2-close', async () => {
  const page = await open('admin', manage('district-open', 'overview'), { wait: 'Needs attention', height: 760 })
  await mark(page, [[btn(page, '→ Registration closed'), 1]])
  await save(page, 'p2-close')
})

// --- 6. Part 3: weigh-in, lock and draw ------------------------------------------------------
await shot('p3-weigh', async () => {
  const page = await open('admin', manage('western-zone', 'weighin'), { wait: 'Weigh-in', height: 900 })
  const kg = page.getByLabel('kg').first()
  await bring(page, kg, 0.6)
  const row = page.getByRole('row').filter({ has: kg }).first()
  await mark(page, [[kg, 1], [row.getByRole('combobox').first(), 2], [row.getByRole('button', { name: 'Save' }), 3], [btn(page, 'Close weigh-in'), 4]])
  await save(page, 'p3-weigh')
})
await shot('p3-categorise', async () => {
  // Before entries are locked: the button turns grey after.
  const page = await open('admin', manage('western-zone', 'draw'), { wait: 'Run categorisation', height: 760 })
  await mark(page, [[btn(page, 'Run categorisation'), 1]])
  await save(page, 'p3-categorise')
})
await shot('p3-lock', async () => {
  const page = await open('admin', manage('western-zone', 'overview'), { wait: 'Needs attention', height: 900 })
  const b = btn(page, '→ Entries locked')
  await bring(page, b, 0.5)
  await mark(page, [[b, 1]])
  await save(page, 'p3-lock')
})
await shot('p3-draw', async () => {
  const page = await open('admin', manage('senior-trials', 'draw'), { wait: 'Run categorisation', height: 900 })
  await mark(page, [[btn(page, 'Draw all categories'), 1, { at: 'l' }]])
  await save(page, 'p3-draw')
})
await shot('p3-lockdraw', async () => {
  const page = await open('admin', manage('senior-trials', 'overview'), { wait: 'Tournament status', height: 760 })
  await mark(page, [[btn(page, 'Lock draw'), 1]])
  await save(page, 'p3-lockdraw')
})
await shot('p3-generate', async () => {
  const page = await open('admin', manage('cadet-cup', 'draw'), { wait: 'Run categorisation', height: 700 })
  const g = btn(page, 'Generate matches')
  await bring(page, g, 0.6)
  const boxes = await mark(page, [[g, 1]])
  await save(page, 'p3-generate', around(page, boxes, { x0: 0, x1: 1280, minH: 360 }))
})

// --- 7. Part 4: prepare the day ------------------------------------------------------------------
await shot('p4-matches', async () => {
  const page = await open('admin', manage('cadet-cup', 'matches'), { wait: 'Queue', height: 760 })
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Schedule' }) }).first()
  await mark(page, [[row.getByRole('button', { name: 'Schedule' }), 1, { at: 'tr' }], [row.getByRole('button', { name: 'Open scoring console' }), 2, { at: 'l' }]])
  await save(page, 'p4-matches')
})
await shot('p4-schedule', async () => {
  const page = await open('admin', manage('cadet-cup', 'matches'), { wait: 'Queue' })
  await btn(page, 'Schedule').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(600)
  const combos = dialog.getByRole('combobox')
  await mark(page, [
    [formControl(combos.nth(0)), 1], [formControl(combos.nth(1)), 2], [formControl(combos.nth(2)), 3],
    [formControl(dialog.getByLabel('Time')), 4], [dialog.getByRole('button', { name: 'Save' }), 5],
  ])
  await save(page, 'p4-schedule', around(page, await dialogBox(dialog), { pad: 30 }))
})
await shot('p4-passes', async () => {
  const page = await open('admin', manage('cadet-cup', 'checkin'), { wait: 'Generate passes', height: 940 })
  await mark(page, [
    [page.getByLabel('Athletes').locator('xpath=ancestor::label[1]'), 1],
    [btn(page, 'Generate passes'), 2], [btn(page, 'Download PDF'), 3],
  ])
  await save(page, 'p4-passes')
})
await shot('p4-checkin', async () => {
  const page = await open('admin', manage('cadet-cup', 'checkin'), { wait: 'Generate passes', height: 760 })
  await mark(page, [
    [btn(page, 'At the door (arrival)'), 1], [btn(page, 'Scan with camera'), 2],
    [page.getByLabel('Or type the pass code'), 3], [btn(page, 'Check in'), 4],
  ])
  await save(page, 'p4-checkin')
})
await shot('p4-screens', async () => {
  const page = await open('scoreboard', `${BASE}/scoreboard_operator`, { wait: 'Screens', height: 860 })
  await mark(page, [
    [page.getByRole('link', { name: 'Mat 1', exact: true }), 1],
    [page.getByRole('link', { name: 'Live board (every mat)' }), 2],
    [page.getByLabel('Message for the hall (e.g. Mat 2: finals start at 3 pm)'), 3],
    [btn(page, 'Show'), 4],
  ])
  await save(page, 'p4-screens')
})

// --- 8. Part 5: competition day ---------------------------------------------------------------------
await shot('p5-live', async () => {
  const page = await open('admin', manage('cadet-cup', 'overview'), { wait: 'Tournament status', height: 760 })
  await mark(page, [[btn(page, '→ Live'), 1], [btn(page, 'Switch to Kumite'), 2, { at: 'l' }]])
  await save(page, 'p5-live')
})
await shot('p5-call', async () => {
  const page = await open('announcer', `${BASE}/announcer/tournament/${t['state-championship'].id}?tab=call`, { wait: 'Mat 1', settle: 2500, height: 860 })
  await mark(page, [
    [btn(page, 'Call again'), 1, { at: 'r' }],
    [await union([btn(page, 'Present'), btn(page, 'Absent')]), 2, { at: 'l' }],
  ])
  await save(page, 'p5-call')
})
await shot('p5-console', async () => {
  const bouts = (await api('GET', `/tournaments/${t['state-championship'].id}/matches`, null, tokens.admin)).body.matches
  const bout = bouts.find((m) => String(m.divisionKey).startsWith('kumite') && m.redId && m.blueId && ['scheduled', 'called', 'ready'].includes(m.status))
  const page = await open('admin', `${BASE}/admin/match/${bout.id}`, { wait: 'Senshu', settle: 2500, height: 1000 })
  const points = await union([page.getByText('Ippon (+3)').first(), page.getByText('Yuko (+1)').first()])
  const penalties = await union([page.getByText('Category 1').first().locator('xpath=..'), page.getByText('Category 2').first().locator('xpath=..')])
  await mark(page, [
    [btn(page, 'Start'), 1, { at: 'l' }],
    [points, 2],
    [penalties, 3],
    [btn(page, 'Undo'), 4, { at: 'r' }],
    [formControl(page.getByLabel('Mat')), 5, { at: 'l' }],
    [btn(page, 'Start scoreboard'), 6, { at: 'l' }],
    [btn(page, 'Decision'), 7, { at: 'l' }],
    [btn(page, 'Close'), 8, { at: 'l' }],
  ])
  await save(page, 'p5-console', { x: 60, y: 100, width: 1160, height: 820 })
})
await shot('p5-display', async () => {
  await api('PUT', '/display?mat=1', { status: 'open', matchId: 'hb-demo', fieldNumber: '1', akaName: 'Aarav Patil', aoName: 'Rohan Kulkarni', akaClub: 'Pune Karate Academy', aoClub: 'Nashik Dojo', akaScore: 3, aoScore: 1, senshu: 'aka', clock: { running: false, remainingMs: 74000, startedAt: null, durationMs: 180000 }, heartbeatAt: Date.now(), category: 'Boys 12-13 -35 KG', matchNumber: 'M-014', round: 'Semi-final', next: { matchNumber: 'M-015', akaName: 'Vihaan Shah', aoName: 'Kabir Rao', category: 'Boys 12-13 -35 KG', round: 'Semi-final' } }, tokens.referee)
  const page = await open(null, `${BASE}/display?mat=1`, { wait: 'Aarav Patil', width: 1280, height: 720 })
  await save(page, 'p5-display')
})
// Kata, in Test 06: open round 1, seat the judges, then a judge scores.
await shot('p5-kata-open', async () => {
  const page = await open('admin', manage('senior-trials', 'kata'), { wait: (p) => p.getByRole('button', { name: 'Open round 1' }).first(), height: 760 })
  await mark(page, [[btn(page, 'Open round 1'), 1, { at: 'l' }]])
  await save(page, 'p5-kata-open')
})
await shot('p5-kata-seats', async () => {
  await fifthJudge()
  const page = await open('admin', manage('senior-trials', 'kata'), { wait: (p) => p.getByRole('button', { name: 'Open round 1' }).first(), height: 1000 })
  await btn(page, 'Open round 1').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await btn(page, 'Start round').waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const seats = page.getByRole('combobox').filter({ hasText: /^Judge \d+$/ })
  await mark(page, [[await union([seats.first(), seats.last()]), 1], [btn(page, 'Save judges'), 2, { at: 'r' }], [btn(page, 'Start round'), 3, { at: 'l' }]])
  await save(page, 'p5-kata-seats')
})
await shot('p5-kata-judge', async () => {
  // Every kata category gets an open round, so the judge first picks one from a list.
  await fifthJudge()
  const tid = t['senior-trials'].id
  const divisions = async () => (await api('GET', `/tournaments/${tid}/kata/divisions`, null, tokens.admin)).body.divisions
  for (const d of await divisions()) if (!d.rounds.length) await api('POST', `/tournaments/${tid}/kata/rounds`, { divisionKey: d.key }, tokens.admin)
  for (const d of await divisions()) for (const r of d.rounds) if (r.status === 'pending') await api('POST', `/tournaments/${tid}/kata/rounds/${r.id}/start`, {}, tokens.admin)
  const page = await open('judge', `${BASE}/judge/kata/${tid}`, { wait: (p) => p.getByText(/ \/ Kata — /).first(), settle: 2000, height: 860 })
  const entry = page.getByText(/ \/ Kata — /).first()
  await mark(page, [[entry.locator('xpath=ancestor::*[self::button or @role="button" or self::a][1]'), 1, { at: 'l' }]])
  await save(page, 'p5-kata-list', { x: 150, y: 0, width: 980, height: 330 }, { keep: true })
  await page.evaluate(() => document.getElementById('hb-layer')?.remove())
  await entry.click()
  await page.getByRole('spinbutton').first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(1200)
  await mark(page, [[page.getByRole('spinbutton').first(), 1, { at: 'l' }], [page.getByRole('button', { name: 'Submit' }).first(), 2, { at: 'r' }]])
  await save(page, 'p5-kata-judge', { x: 150, y: 0, width: 980, height: 690 })
})

// --- 9. Part 6: results and finishing ------------------------------------------------------------------
await shot('p6-results', async () => {
  const page = await open('admin', manage('junior-kumite', 'results'), { wait: 'Publish results', height: 860 })
  await mark(page, [[btn(page, 'Verify result'), 1], [btn(page, 'Publish results'), 2]])
  await save(page, 'p6-results')
})
await shot('p6-certs', async () => {
  const page = await open('admin', manage('diwali-cup', 'certificates'), { wait: 'Generate', height: 760 })
  await mark(page, [
    [page.getByLabel('Medal winners').locator('xpath=ancestor::label[1]'), 1],
    [btn(page, 'Generate'), 2], [btn(page, 'Download PDF'), 3], [btn(page, 'Print / save as PDF'), 4],
  ])
  await save(page, 'p6-certs')
})
await shot('p6-reports', async () => {
  const page = await open('admin', manage('diwali-cup', 'reports'), { wait: 'Reports', height: 760 })
  await mark(page, [[btn(page, 'Excel'), 1], [btn(page, 'CSV'), 2], [btn(page, 'PDF'), 3]])
  await save(page, 'p6-reports')
})
await shot('p6-complete', async () => {
  const page = await open('admin', manage('state-championship', 'overview'), { wait: 'Tournament status', height: 760 })
  await mark(page, [[btn(page, '→ Completed'), 1]])
  await save(page, 'p6-complete')
})

await browser.close()
