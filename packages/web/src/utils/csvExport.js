// Builds a CSV string from column definitions and downloads it via a Blob link.

const escapeCell = (value) => {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export const toCSV = (columns, rows) => {
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
  return [header, ...lines].join('\n')
}

export const downloadCSV = (filename, columns, rows) => {
  const csv = toCSV(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
