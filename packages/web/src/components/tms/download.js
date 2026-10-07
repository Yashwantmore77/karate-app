import { toExportCsv } from '@kumite/shared/registration.js'

/** Hands the browser a file to save. CSV opens directly in Excel. */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  // A BOM so Excel reads UTF-8 names (accents, Devanagari) correctly.
  const blob = new Blob([type.startsWith('text/csv') ? `﻿${text}` : text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadCsv = (filename, rows) => downloadText(filename, toExportCsv(rows))

export const readFileText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(file)
})

/** Reads a chosen file as base64 (no data: prefix) for upload. */
export const readFileBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

/** Opens a file the API sent back (as a blob) in a new tab. */
export function openStoredFile(file) {
  const url = URL.createObjectURL(file.blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/**
 * A list as a PDF: a plain, print-ready table in a new window, saved with the
 * browser's "Save as PDF". Nothing leaves the device.
 */
export function printTable(title, rows) {
  const [head = [], ...body] = rows
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 12px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}
tr:nth-child(even) td{background:#fafafa}@page{size:A4 landscape;margin:12mm}</style></head><body>
<h1>${escapeHtml(title)}</h1><p>${body.length} rows · ${escapeHtml(new Date().toLocaleString())}</p>
<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload=()=>{window.print()}</script></body></html>`
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
