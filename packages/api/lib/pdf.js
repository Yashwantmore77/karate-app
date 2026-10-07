import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

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

const TEMPLATE = {
  classic: { border: 6, inner: true, titleFont: 'Helvetica-Bold', accent: null },
  modern: { border: 14, inner: false, titleFont: 'Helvetica-Bold', accent: '#0B3D91' },
  minimal: { border: 1, inner: false, titleFont: 'Helvetica', accent: '#222222' },
}

const TYPE_COLOR = { participation: '#2E5E4E', coach: '#0B3D91', official: '#5B2C83', custom: '#9A2A2A' }

/** A QR code drawn as squares, so no image library is needed. */
function drawQr(doc, url, x, y, size) {
  let qr
  try { qr = QRCode.create(url, { errorCorrectionLevel: 'M' }) } catch { return }
  const n = qr.modules.size
  const cell = size / (n + 2)
  doc.save().rect(x, y, size, size).fill('#FFFFFF')
  doc.fillColor('#000000')
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (qr.modules.get(r, c)) doc.rect(x + (c + 1) * cell, y + (r + 1) * cell, cell, cell).fill()
  }
  doc.restore()
}

/**
 * One A4-landscape page per certificate (PRD v1 §18): template-based, with
 * the certificate's type (medal, participation, coach/official, custom
 * award), its unique number and a QR code that opens the verification page.
 */
export function certificatesPdf(tournament, certificates, { logo = null, verifyBase = null, settings = null } = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: `${tournament.name} certificates` } })
  const date = tournament.endDate || tournament.startDate || tournament.date || ''
  const look = TEMPLATE[settings?.template] || TEMPLATE.classic
  const signatories = [settings?.signatory1 || 'Tournament Director', settings?.signatory2 || null].filter(Boolean)
  certificates.forEach((c, i) => {
    if (i > 0) doc.addPage()
    const { width, height } = doc.page
    const type = c.type || c.medal
    const colour = look.accent || MEDAL_COLOR[c.medal] || TYPE_COLOR[type] || '#333333'
    doc.lineWidth(look.border).strokeColor(colour).rect(24, 24, width - 48, height - 48).stroke()
    if (look.inner) doc.lineWidth(1.5).rect(36, 36, width - 72, height - 72).stroke()
    let y = 66
    if (logo) {
      try { doc.image(logo, width / 2 - 35, y, { fit: [70, 70] }); y += 78 } catch { /* unreadable logo: leave it out */ }
    }
    const w = width - 120
    doc.fillColor('#111111').font(look.titleFont).fontSize(26).text(tournament.name, 60, y, { align: 'center', width: w })
    doc.font('Helvetica').fontSize(12).fillColor('#444444')
      .text([tournament.organizer, tournament.venue || tournament.location, date].filter(Boolean).join('  ·  '), { align: 'center', width: w })
    const heading = (c.title || (MEDAL_COLOR[c.medal] ? settings?.title : null) || 'Certificate of Achievement').toUpperCase()
    doc.moveDown(1.8).fontSize(12).fillColor('#555555').text(heading, { align: 'center', width: w, characterSpacing: 3 })
    doc.moveDown(0.7).font('Helvetica-Bold').fontSize(34).fillColor('#111111').text(c.name, { align: 'center', width: w })
    doc.moveDown(0.5).font('Helvetica').fontSize(15).fillColor('#333333')
    if (MEDAL_COLOR[c.medal] && (type === c.medal || !c.type)) {
      doc.text(`${c.club ? `of ${c.club}, ` : ''}secured ${ordinal(c.rank)} place and the`, { align: 'center', width: w })
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(26).fillColor(colour).text(`${String(c.medal).toUpperCase()} MEDAL`, { align: 'center', width: w })
      doc.moveDown(0.3).font('Helvetica').fontSize(15).fillColor('#333333').text(`in ${c.category}`, { align: 'center', width: w })
    } else if (type === 'participation') {
      doc.text(`${c.club ? `of ${c.club} ` : ''}took part in`, { align: 'center', width: w })
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(18).fillColor(colour).text(c.category || 'the tournament', { align: 'center', width: w })
    } else if (type === 'coach' || type === 'official') {
      doc.text('in appreciation of their service as', { align: 'center', width: w })
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(20).fillColor(colour).text(c.category || (type === 'coach' ? 'Coach' : 'Technical Official'), { align: 'center', width: w })
    } else {
      doc.text(`${c.club ? `of ${c.club} ` : ''}is awarded`, { align: 'center', width: w })
      doc.moveDown(0.3).font('Helvetica-Bold').fontSize(24).fillColor(colour).text(c.award || c.title || 'Special Award', { align: 'center', width: w })
      if (c.category) doc.moveDown(0.3).font('Helvetica').fontSize(14).fillColor('#333333').text(c.category, { align: 'center', width: w })
    }
    if (settings?.footer) doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555555').text(settings.footer, 60, height - 140, { align: 'center', width: w })
    doc.font('Helvetica').fontSize(10).fillColor('#666666').text('Certificate No.', 70, height - 112)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333').text(c.certificateId, 70, height - 98)
    if (verifyBase) {
      const url = `${String(verifyBase).replace(/\/$/, '')}/verify/${encodeURIComponent(c.certificateId)}`
      drawQr(doc, url, 70 + 150, height - 128, 62)
      doc.font('Helvetica').fontSize(7).fillColor('#666666').text('Scan to verify', 70 + 150, height - 64, { width: 62, align: 'center' })
    }
    signatories.forEach((name, k) => {
      const x = width - 290 - k * 250
      doc.lineWidth(1).strokeColor('#333333').moveTo(x, height - 100).lineTo(x + 220, height - 100).stroke()
      doc.font('Helvetica').fontSize(11).fillColor('#333333').text(name, x, height - 94, { width: 220, align: 'center' })
    })
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
