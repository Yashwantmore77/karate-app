import PDFDocument from 'pdfkit'

// Server-side PDFs (PRD sections 44 and 45), built with pdfkit's standard
// fonts so nothing has to be installed on the venue machine.

const MEDAL_COLOR = { gold: '#B8860B', silver: '#7D7D7D', bronze: '#8C5A2B' }
const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || `${n}th`)
const text = (v) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v))

const toBuffer = (doc) => new Promise((resolve, reject) => {
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  doc.on('error', reject)
  doc.end()
})

/** One A4-landscape page per certificate, each with its unique ID. */
export function certificatesPdf(tournament, certificates, { logo = null } = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: `${tournament.name} certificates` } })
  const date = tournament.endDate || tournament.startDate || tournament.date || ''
  certificates.forEach((c, i) => {
    if (i > 0) doc.addPage()
    const { width, height } = doc.page
    const colour = MEDAL_COLOR[c.medal] || '#333333'
    doc.lineWidth(6).strokeColor(colour).rect(24, 24, width - 48, height - 48).stroke()
    doc.lineWidth(1.5).rect(36, 36, width - 72, height - 72).stroke()
    let y = 70
    if (logo) {
      try { doc.image(logo, width / 2 - 35, y, { fit: [70, 70] }); y += 80 } catch { /* unreadable logo: leave it out */ }
    }
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(28).text(tournament.name, 60, y, { align: 'center', width: width - 120 })
    doc.font('Helvetica').fontSize(12).fillColor('#444444')
      .text([tournament.organizer, tournament.venue || tournament.location, date].filter(Boolean).join('  ·  '), { align: 'center', width: width - 120 })
    doc.moveDown(2.2).fontSize(12).fillColor('#555555').text('CERTIFICATE OF ACHIEVEMENT', { align: 'center', width: width - 120, characterSpacing: 3 })
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(36).fillColor('#111111').text(c.name, { align: 'center', width: width - 120 })
    doc.moveDown(0.6).font('Helvetica').fontSize(15).fillColor('#333333')
      .text(`${c.club ? `of ${c.club}, ` : ''}secured ${ordinal(c.rank)} place and the`, { align: 'center', width: width - 120 })
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(26).fillColor(colour).text(`${String(c.medal).toUpperCase()} MEDAL`, { align: 'center', width: width - 120 })
    doc.moveDown(0.4).font('Helvetica').fontSize(15).fillColor('#333333').text(`in ${c.category}`, { align: 'center', width: width - 120 })
    doc.font('Helvetica').fontSize(10).fillColor('#666666').text('Certificate ID', 70, height - 110)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333').text(c.certificateId, 70, height - 96)
    doc.lineWidth(1).strokeColor('#333333').moveTo(width - 290, height - 100).lineTo(width - 70, height - 100).stroke()
    doc.font('Helvetica').fontSize(11).fillColor('#333333').text('Authorized signature', width - 290, height - 94, { width: 220, align: 'center' })
  })
  if (!certificates.length) doc.fontSize(14).text('No certificates issued yet.')
  return toBuffer(doc)
}

/** A report as a paginated table, header repeated on every page. */
export function tablePdf(title, rows, { subtitle = '' } = {}) {
  const [head = [], ...body] = rows
  const landscape = head.length > 7
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 32, info: { Title: title } })
  const left = doc.page.margins.left
  const usable = doc.page.width - left - doc.page.margins.right
  const colWidth = usable / Math.max(1, head.length)
  const fontSize = head.length > 12 ? 6.5 : head.length > 8 ? 7.5 : 9
  const bottom = () => doc.page.height - doc.page.margins.bottom

  const rowHeight = (cells, font) => {
    doc.font(font).fontSize(fontSize)
    return Math.max(...cells.map((c) => doc.heightOfString(text(c), { width: colWidth - 6 }))) + 6
  }
  const drawRow = (cells, y, font, fill) => {
    const h = rowHeight(cells, font)
    if (fill) doc.rect(left, y, usable, h).fill(fill)
    doc.fillColor('#000000').font(font).fontSize(fontSize)
    cells.forEach((c, i) => doc.text(text(c), left + i * colWidth + 3, y + 3, { width: colWidth - 6 }))
    doc.strokeColor('#BBBBBB').lineWidth(0.5).moveTo(left, y + h).lineTo(left + usable, y + h).stroke()
    return y + h
  }
  const header = () => {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text(title, left, doc.page.margins.top, { width: usable })
    if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555555').text(subtitle, { width: usable })
    return drawRow(head, doc.y + 6, 'Helvetica-Bold', '#EEEEEE')
  }

  let y = header()
  for (const row of body) {
    if (y + rowHeight(row, 'Helvetica') > bottom()) {
      doc.addPage()
      y = header()
    }
    y = drawRow(row, y, 'Helvetica', null)
  }
  if (!body.length) doc.font('Helvetica').fontSize(10).text('No rows.', left, y + 8)
  return toBuffer(doc)
}
