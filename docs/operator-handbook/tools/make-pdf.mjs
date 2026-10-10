// Builds docs/operator-handbook/Operator-Handbook.pdf from the handbook's
// README.md and images, to hand to the person who runs the tournament.
//
//   npm run docs:pdf
//
// Chromium prints it: a cover, a contents page with page numbers, every part
// on a new page, each picture kept with its caption, a footer with the page
// number, and bookmarks.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib'
import { launchChromium } from './browser.mjs'

const HANDBOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(HANDBOOK, 'Operator-Handbook.pdf')

const dataUrl = (file) => `data:image/${path.extname(file).slice(1).replace('svg', 'svg+xml')};base64,${fs.readFileSync(file).toString('base64')}`

function buildHtml() {
  let md = fs.readFileSync(path.join(HANDBOOK, 'README.md'), 'utf8')
  const updated = md.match(/^_Last updated (.+?)\._$/m)[1]
  // The cover and the contents page replace the title, byline, download line and contents list.
  md = md.replace(/^# .+\n+_Last updated .+\n+/, '')
  md = md.replace(/^\*\*Download:\*\*.*\n+/m, '')
  md = md.replace(/^## Contents\n[\s\S]*?(?=^## )/m, '')
  // The user guide is another file in the repo; in a PDF it is just its name.
  md = md.replace(/\[User Guide\]\(\.\.\/user-guide\/README\.md\)/g, 'User Guide')

  let body = new Marked({ gfm: true }).use(gfmHeadingId()).parse(md)
  // Pictures go inside the file, so the PDF can be built from anywhere.
  body = body.replace(/src="(images\/[^"]+)"/g, (_m, src) => `src="${dataUrl(path.join(HANDBOOK, src))}"`)
  // Keep each picture with its caption.
  body = body.replace(/<p><img src="([^"]+)" alt="([^"]*)"><\/p>\s*<p><em>([^<]*)<\/em><\/p>/g,
    (_m, src, alt, cap) => `<figure><img src="${src}" alt="${alt}"><figcaption>${cap}</figcaption></figure>`)
  // "Done when" lines stand out, as the check at the end of a job.
  body = body.replace(/<p><strong>Done when<\/strong>/g, '<p class="done"><strong>Done when</strong>')
  // Tick boxes to fill in with a pen.
  body = body.replace(/<input disabled="" type="checkbox">\s*/g, '<span class="box"></span>')
  body = body.replace(/<li>(?=<span class="box">)/g, '<li class="task">')

  // How to use goes on the contents page, under the list.
  const sections = [...body.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)]
    .map(([, id, title]) => ({ id, title })).filter((s) => s.id !== 'how-to-use-this-handbook')
  const contents = sections.map(({ id, title }) =>
    `<li><a href="#${id}"><span class="t">${title}</span><span class="dots"></span><span class="n" data-for="${title}"></span></a></li>`).join('\n')

  const font = '"Liberation Sans", "DejaVu Sans", Arial, sans-serif'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Karate Tournament App — Operator Handbook</title>
<style>
@page { size: A4; margin: 14mm 14mm 16mm 14mm;
  @bottom-left { content: "Karate Tournament App — Operator Handbook"; font: 7.5pt ${font}; color: #6e7781; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt ${font}; color: #6e7781; } }
@page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${font}; font-size: 10.5pt; line-height: 1.45; color: #1f2328; }
a { color: #0550ae; text-decoration: none; }
strong { color: #111; }

.cover { page: cover; height: 296.5mm; box-sizing: border-box; padding: 26mm 20mm 18mm; display: flex; flex-direction: column; break-after: page;
  background: linear-gradient(180deg, #0b1020 0%, #121a33 58%, #ffffff 58.01%); }
.band { display: flex; height: 6px; width: 64mm; border-radius: 3px; overflow: hidden; margin-bottom: 9mm; }
.band span:first-child { flex: 1; background: #d32f2f; } .band span:last-child { flex: 1; background: #1e63d6; }
.kicker { color: #9fb3d9; font-size: 11pt; letter-spacing: 3px; font-weight: 700; }
.cover .title { color: #fff; font-size: 38pt; font-weight: 700; line-height: 1.1; margin: 4mm 0 5mm; }
.cover .lead { color: #d7e0f2; font-size: 14pt; line-height: 1.4; max-width: 150mm; margin: 0; }
.cover .hero { margin-top: 14mm; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.35); border: 1px solid #2b3555; }
.cover .hero img { display: block; width: 100%; }
.cover .foot { margin-top: auto; color: #57606a; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: flex-end; }
.cover .foot b { color: #1f2328; font-size: 12pt; }

.contents h2 { break-before: auto; }
.contents ol { list-style: none; padding: 0; margin: 6mm 0 0; font-size: 12pt; }
.contents li { margin: 0 0 3.2mm; }
.contents a { display: flex; align-items: baseline; color: #1f2328; }
.contents .dots { flex: 1; border-bottom: 1.5px dotted #a0a8b2; margin: 0 2mm; transform: translateY(-3px); }
.contents .n { font-weight: 700; color: #0550ae; min-width: 8mm; text-align: right; }
#how-to-use-this-handbook { break-before: avoid; margin-top: 10mm; }

h2 { break-before: page; break-after: avoid; font-size: 19pt; line-height: 1.2; margin: 0 0 4mm; padding: 1mm 0 1mm 4mm; border-left: 6px solid #d32f2f; color: #0b1020; }
h3 { break-after: avoid; font-size: 13pt; margin: 7mm 0 2.5mm; padding: 2mm 3.5mm; background: #eef3fb; border-radius: 6px; color: #0b1020; }
h2 + p, h3 + p { margin-top: 0; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1.2mm; }
li > ul, li > ol { margin: 1.2mm 0 0; }

figure { margin: 3mm 0 4.5mm; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; border: 1px solid #c9d1d9; border-radius: 6px; }
figcaption { margin-top: 1.5mm; font-size: 9pt; color: #57606a; font-style: italic; }

.done { break-inside: avoid; background: #edf7ee; border-left: 4px solid #2e7d32; padding: 2mm 3.5mm; border-radius: 0 6px 6px 0; }

table { width: 100%; border-collapse: collapse; margin: 1mm 0 4mm; font-size: 9.6pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #d0d7de; padding: 1.6mm 2.4mm; vertical-align: top; text-align: left; }
th { background: #f0f3f7; }

li.task { list-style: none; margin-left: -5mm; }
.box { display: inline-block; width: 3.6mm; height: 3.6mm; border: 1.4px solid #57606a; border-radius: 1px; margin-right: 2.5mm; vertical-align: -0.7mm; }
</style></head><body>

<section class="cover">
  <div class="band"><span></span><span></span></div>
  <div class="kicker">KARATE TOURNAMENT APP</div>
  <div class="title">Operator Handbook</div>
  <p class="lead">How to run a tournament on the app, step by step, with a picture of every screen.</p>
  <div class="hero"><img src="${dataUrl(path.join(HANDBOOK, 'images', 'p5-display.webp'))}" alt="A mat's TV during a bout"></div>
  <div class="foot"><div><b>For the person who runs the tournament.</b><br>No experience with the app needed.</div><div>Last updated ${updated}</div></div>
</section>

<section class="contents">
  <h2 id="contents">Contents</h2>
  <ol>${contents}</ol>
</section>

${body}
</body></html>`
}

// The page each section starts on, from the bookmarks Chromium wrote for its headings.
async function sectionPages(pdf) {
  const doc = await PDFDocument.load(pdf)
  const pages = doc.getPages().map((p) => p.ref.toString())
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('Dests'), PDFDict)
  const named = (name) => {
    const search = (node) => {
      const list = node.lookupMaybe(PDFName.of('Names'), PDFArray)
      if (list) for (let i = 0; i < list.size(); i += 2) if (list.lookup(i).decodeText() === name) return list.lookup(i + 1)
      const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray)
      if (kids) for (let i = 0; i < kids.size(); i += 1) { const hit = search(kids.lookup(i, PDFDict)); if (hit) return hit }
      return null
    }
    return names ? search(names) : null
  }
  const pageOf = (dest) => {
    if (!dest) return null
    if (!(dest instanceof PDFArray)) dest = dest instanceof PDFDict ? dest.lookup(PDFName.of('D')) : named(dest.decodeText ? dest.decodeText() : dest.asString())
    const ref = dest?.get(0)
    return ref instanceof PDFRef ? pages.indexOf(ref.toString()) + 1 : null
  }
  const found = {}
  const walk = (item) => {
    for (; item; item = item.lookupMaybe(PDFName.of('Next'), PDFDict)) {
      const title = item.lookup(PDFName.of('Title')).decodeText()
      found[title] ??= pageOf(item.lookup(PDFName.of('Dest')) ?? item.lookupMaybe(PDFName.of('A'), PDFDict)?.lookup(PDFName.of('D')))
      walk(item.lookupMaybe(PDFName.of('First'), PDFDict))
    }
  }
  walk(doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict)?.lookupMaybe(PDFName.of('First'), PDFDict))
  return found
}

const browser = await launchChromium()
const page = await browser.newPage()
await page.setContent(buildHtml(), { waitUntil: 'load' })
await page.evaluate(async () => {
  await document.fonts.ready
  for (const img of document.images) {
    await img.decode()
    if (img.src.startsWith('data:image/svg')) { img.style.width = '88%'; continue }
    // One scale for every screenshot: 1100 screen pixels fill the width of the
    // page, so a small crop stays small instead of being blown up.
    if (img.closest('figure')) img.style.width = `${Math.min(100, (img.naturalWidth / 1100) * 100)}%`
    // JPEG keeps the file small; Chromium would store the WebP pictures uncompressed.
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    img.src = canvas.toDataURL('image/jpeg', 0.92)
    await img.decode()
  }
})
const print = () => page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true })
// Print once to learn where each part starts, write the numbers into the
// contents, then print again (the numbers do not move anything).
let pdf = await print()
for (let pass = 0; pass < 3; pass += 1) {
  const found = await sectionPages(pdf)
  const changed = await page.evaluate((found) => {
    let changed = false
    for (const n of document.querySelectorAll('.contents .n')) {
      const value = String(found[n.dataset.for] ?? '')
      if (n.textContent !== value) { n.textContent = value; changed = true }
    }
    return changed
  }, found)
  if (!changed) break
  pdf = await print()
}
await browser.close()
fs.writeFileSync(OUT, pdf)
const doc = await PDFDocument.load(pdf)
console.log(`${path.relative(process.cwd(), OUT)}: ${doc.getPageCount()} pages, ${(pdf.length / 1048576).toFixed(1)} MB`)
