import { toCsv } from '@kumite/shared/registration.js'

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

export const downloadCsv = (filename, rows) => downloadText(filename, toCsv(rows))

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
