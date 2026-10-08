// The printed draw sheet a mat table works from: the association's name on
// top, the event, a knockout tree with AKA / AO boxes, 1st / 2nd / 3rd, the
// 3rd/4th place bout, and signature lines for four judges and the referee.
// Drawn as SVG on an A4 page, so it prints the same in every browser, and
// can be printed blank for writing in by hand.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** The smallest sheet (4, 8 or 16 first-round places) that holds `count` players. */
export const sheetSize = (count) => (count <= 4 ? 4 : count <= 8 ? 8 : 16)

/**
 * Players to first-round places: the first half take AKA in each bout, the
 * rest AO, so with fewer players than places every bye is a single one and
 * byes are spread over the sheet rather than bunched at the end.
 */
export function placesFromPlayers(names, size = sheetSize(names.length)) {
  const bouts = size / 2
  const places = Array(size).fill('')
  names.slice(0, size).forEach((name, i) => {
    const bout = i % bouts
    places[bout * 2 + (i < bouts ? 0 : 1)] = name
  })
  return places
}

/** First-round (and later) places from a generated bracket: rounds[r].matches[m].aka / ao. */
export function placesFromBracket(rounds) {
  const main = (rounds || []).map((r) => r.matches.filter((m) => !m.thirdPlace))
  const size = sheetSize((main[0]?.length || 1) * 2)
  const columns = []
  for (let r = 0; (size >> r) >= 2; r += 1) {
    const slots = size >> r
    const names = Array(slots).fill('')
    ;(main[r] || []).forEach((m, i) => {
      if (i * 2 + 1 < slots) { names[i * 2] = m.aka?.name || ''; names[i * 2 + 1] = m.ao?.name || '' }
    })
    columns.push(names)
  }
  const third = (rounds || []).flatMap((r) => r.matches).find((m) => m.thirdPlace)
  return { size, columns, third: third ? [third.aka?.name || '', third.ao?.name || ''] : ['', ''] }
}

/**
 * One A4 sheet as SVG. `columns[0]` are the first-round names (AKA, AO, AKA,
 * AO …); later columns, when given, are who went through.
 */
export function bracketSvg({ title, event, size = 16, columns = [], third = ['', ''], sheet = null }) {
  const W = 1000
  const H = 1414
  const boxW = 165
  const boxH = 34
  const left = 50
  const top = 165
  const bottom = size === 16 ? 1190 : 1100
  const step = (bottom - top) / size
  const rounds = Math.log2(size)
  const out = []
  const text = (x, y, s, attrs = '') => out.push(`<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`)
  const box = (x, y, label, name) => {
    out.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="none" stroke="#000" stroke-width="1.6"/>`)
    if (label) text(x + 3, y + 10, label, 'font-size="9"')
    if (name) text(x + 6, y + 26, name.length > 24 ? `${name.slice(0, 23)}…` : name, 'font-size="13" font-weight="600"')
  }

  // Header.
  text(W / 2, 62, title, 'font-size="27" font-weight="700" text-anchor="middle"')
  out.push(`<line x1="60" y1="92" x2="${W - 60}" y2="92" stroke="#999" stroke-width="1"/>`)
  text(W - 60, 140, `Event  ${event || '................................'}`, 'font-size="16" text-anchor="end"')
  if (sheet) text(60, 140, sheet, 'font-size="13" fill="#555"')

  // The tree: each column's boxes sit at the middle of the two they come from.
  let centres = Array.from({ length: size }, (_, i) => top + step * (i + 0.5))
  for (let r = 0; r < rounds; r += 1) {
    const x = left + r * boxW
    centres.forEach((c, i) => box(x, c - boxH / 2, i % 2 === 0 ? 'Aka' : 'Ao', columns[r]?.[i]))
    const next = []
    for (let i = 0; i < centres.length; i += 2) {
      const a = centres[i]
      const b = centres[i + 1]
      out.push(`<line x1="${x + boxW}" y1="${a}" x2="${x + boxW}" y2="${b}" stroke="#000" stroke-width="1.6"/>`)
      next.push((a + b) / 2)
    }
    centres = next
  }
  // The final: the two finalists' line, then 1st / 2nd / 3rd.
  const medalX = left + rounds * boxW + 60
  ;['1st', '2nd', '3rd'].forEach((place, i) => {
    const y = H / 2 - 160 + i * 105
    out.push(`<rect x="${medalX}" y="${y}" width="${boxW + 20}" height="66" fill="none" stroke="#000" stroke-width="1.6"/>`)
    text(medalX + 4, y + 20, place, 'font-size="17"')
  })

  // 3rd / 4th place bout.
  const tx = left + Math.max(0, rounds - 1) * boxW
  const ty = bottom + 40
  text(tx, ty - 8, '3rd/4th Place', 'font-size="17"')
  box(tx, ty, 'Aka', third[0])
  box(tx, ty + 68, 'Ao', third[1])
  out.push(`<line x1="${tx + boxW}" y1="${ty + 17}" x2="${tx + boxW}" y2="${ty + 85}" stroke="#000" stroke-width="1.6"/>`)
  out.push(`<rect x="${tx + boxW}" y="${ty + 34}" width="${boxW + 20}" height="${boxH}" fill="none" stroke="#000" stroke-width="1.6"/>`)
  text(tx + 2 * boxW + 26, ty + 56, '3rd', 'font-size="17"')

  // Signatures: four judges and the referee.
  const sign = ['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Referee']
  sign.forEach((who, i) => text(60 + i * 182, H - 60, `${who} ....................`, 'font-size="14"'))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="Arial, Helvetica, sans-serif">${out.join('')}</svg>`
}

/** Opens the sheets in a new window and prints them (one A4 page each). */
export function printBracketSheets(sheets, docTitle = 'Draw sheet') {
  const pages = sheets.map((s) => `<div class="page">${bracketSvg(s)}</div>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>@page{size:A4 portrait;margin:8mm}body{margin:0;background:#fff;color:#000}.page{width:194mm;height:281mm;margin:0 auto;page-break-after:always}.page:last-child{page-break-after:auto}svg{width:100%;height:100%}</style>
</head><body>${pages}<script>window.onload=()=>{window.print()}</script></body></html>`
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}

/**
 * The sheets for one category's players: one sheet of up to 16, or several
 * for a bigger category (each sheet then feeds a final between the winners).
 */
export function sheetsForPlayers({ title, event, names, groups = null }) {
  if (!names?.length && !groups?.length) return [{ title, event, size: 16, columns: [] }]
  // One sheet per pool when the category is drawn into pools; otherwise the
  // players are shared evenly over as few sheets as hold them (17 → 9 + 8).
  let chunks = (groups || []).filter((g) => g.names.length).map((g) => ({ label: g.label, names: g.names }))
  if (!chunks.length || chunks.some((c) => c.names.length > 16)) {
    const all = groups ? groups.flatMap((g) => g.names) : names
    const count = Math.ceil(all.length / 16)
    const per = Math.ceil(all.length / count)
    chunks = Array.from({ length: count }, (_, i) => ({ label: null, names: all.slice(i * per, (i + 1) * per) }))
  }
  return chunks.map((chunk, i) => {
    const size = sheetSize(chunk.names.length)
    const sheet = chunks.length > 1 ? `${chunk.label ? `${chunk.label} · ` : ''}Sheet ${i + 1} of ${chunks.length}` : chunk.label
    return { title, event, size, columns: [placesFromPlayers(chunk.names, size)], sheet }
  })
}
