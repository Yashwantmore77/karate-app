// Native Excel (.xlsx) in the browser (PRD sections 15 and 45). exceljs is
// loaded only when a spreadsheet is actually read or written, so nobody pays
// for it on the scoring screens.

const loadExcel = async () => (await import('exceljs')).default

const isoDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return isoDate(v)
  if (typeof v === 'object') {
    if (v.result !== undefined) return v.result instanceof Date ? isoDate(v.result) : String(v.result ?? '') // formula
    if (v.richText) return v.richText.map((r) => r.text).join('')
    if (v.text !== undefined) return String(v.text) // hyperlink
  }
  return String(v)
}

/** The first sheet of an .xlsx file as rows of strings, blank rows dropped. */
export async function readXlsx(file) {
  const ExcelJS = await loadExcel()
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await file.arrayBuffer())
  const sheet = book.worksheets[0]
  if (!sheet) return []
  const rows = []
  const width = sheet.columnCount
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = []
    for (let c = 1; c <= width; c += 1) cells.push(cellText(row.getCell(c)).trim())
    if (cells.some(Boolean)) rows.push(cells)
  })
  return rows
}

/** Writes rows (header first) as a formatted .xlsx and downloads it. */
export async function downloadXlsx(filename, rows, sheetName = 'Report') {
  const ExcelJS = await loadExcel()
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet(sheetName.slice(0, 31))
  rows.forEach((r) => sheet.addRow(r.map((v) => (Array.isArray(v) ? v.join(', ') : v ?? ''))))
  if (rows.length) {
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rows[0].length } }
    sheet.columns.forEach((col, i) => {
      const longest = Math.max(...rows.map((r) => String(r[i] ?? '').length))
      col.width = Math.min(48, Math.max(10, longest + 2))
    })
  }
  const buffer = await book.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
