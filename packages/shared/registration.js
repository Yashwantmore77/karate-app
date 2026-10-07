// PRD sections 11-12 and 15: the per-tournament registration form, checking a
// player against it, and reading a bulk upload. Shared so the coach's browser
// and the server reject exactly the same rows.

import { findCountry, findState } from './geography.js'

// PRD v1 §8 field types: text, textarea, number, date, dropdown, radio,
// checkbox, multi-select, file upload, country/state/district selectors,
// calculated field and read-only system field (plus phone and email).
export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'multiselect', 'file', 'phone', 'email', 'country', 'state', 'district', 'calculated', 'system']

/** What a calculated field shows (worked out by the system, never typed). */
export const CALCULATED_FORMULAS = { age: 'Age on the master date', ageGroup: 'Age group', category: 'Final category', weightCategory: 'Weight category' }
/** What a read-only system field shows. */
export const SYSTEM_SOURCES = { playerNumber: 'Player ID', registrationStatus: 'Registration status', paymentStatus: 'Payment status', weighInStatus: 'Weigh-in status', teamNumber: 'Team reference number' }

/** Fields whose value the system supplies. */
export const isComputedField = (f) => f.generated || f.type === 'calculated' || f.type === 'system'

export const GENDERS = ['M', 'F']
export const EVENT_CHOICES = ['kata', 'kumite']

/**
 * Section 12's defaults. `key` is where the value lives on a player; built-in
 * keys are first-class player fields, anything an admin adds lands in
 * `player.extra`. `system` fields drive categorisation and cannot be removed
 * or made optional, only relabelled.
 */
export const DEFAULT_FIELDS = [
  { key: 'name', label: 'Player Name', type: 'text', required: true, system: true },
  // PRD point 4: the number the system gives every player, shown, never typed.
  { key: 'playerNumber', label: 'Player ID', type: 'text', readOnly: true, generated: true },
  { key: 'fatherName', label: 'Father Name', type: 'text' },
  { key: 'motherName', label: 'Mother Name', type: 'text' },
  { key: 'mobile', label: 'Mobile Number', type: 'phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'dob', label: 'DOB', type: 'date', required: true, system: true },
  { key: 'gender', label: 'Gender', type: 'radio', required: true, system: true, options: ['M', 'F'] },
  { key: 'photo', label: 'Player Photo', type: 'file' },
  { key: 'idProof', label: 'ID Proof', type: 'file' },
  // PRD v1 §7: club and country are required; the team supplies them when left blank.
  { key: 'club', label: 'Club/School/Dojo', type: 'text', required: true },
  { key: 'coachName', label: 'Coach Name', type: 'text' },
  { key: 'district', label: 'District', type: 'district' },
  { key: 'division', label: 'Division', type: 'text', helpText: 'Players are grouped by division as well as age and weight' },
  { key: 'state', label: 'State', type: 'state' },
  { key: 'country', label: 'Country', type: 'country', required: true },
  { key: 'federationId', label: 'Federation ID', type: 'text' },
  { key: 'belt', label: 'Belt', type: 'dropdown', options: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'] },
  { key: 'events', label: 'Event', type: 'checkbox', required: true, system: true, options: ['kata', 'kumite'] },
  { key: 'weight', label: 'Weight (kg)', type: 'number', system: true },
  { key: 'emergencyContact', label: 'Emergency Contact', type: 'phone' },
  { key: 'bloodGroup', label: 'Blood Group', type: 'dropdown', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  // PRD v1 §8: system-derived values, shown but never coach-editable.
  { key: 'calcAge', label: 'Age (on master date)', type: 'calculated', formula: 'age', readOnly: true },
  { key: 'calcCategory', label: 'Category', type: 'calculated', formula: 'category', readOnly: true },
].map((field, order) => ({ required: false, visible: true, system: false, readOnly: false, builtIn: true, ...field, order }))

export const BUILT_IN_KEYS = new Set(DEFAULT_FIELDS.map((f) => f.key))

/** The form a tournament uses: its own if configured, the defaults otherwise. */
export function formFields(tournament) {
  const fields = tournament?.registrationForm?.length ? tournament.registrationForm : DEFAULT_FIELDS
  return [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * Keeps an admin's form edits inside what the system can live with: system
 * fields stay present, visible and required.
 */
export function normalizeForm(fields) {
  const byKey = new Map()
  fields.forEach((field, order) => {
    const key = String(field.key || '').trim()
    if (!key || byKey.has(key)) return
    const builtIn = DEFAULT_FIELDS.find((f) => f.key === key)
    const type = FIELD_TYPES.includes(field.type) ? field.type : (builtIn?.type || 'text')
    const next = {
      key,
      label: String(field.label || builtIn?.label || key).slice(0, 80),
      type,
      required: !!field.required,
      visible: field.visible !== false,
      builtIn: !!builtIn,
      system: !!builtIn?.system,
      // PRD point 4: a read-only field is shown to coaches but only the
      // organisers fill it in (a federation number checked at the desk).
      readOnly: !!field.readOnly,
      ...(builtIn?.generated ? { generated: true, readOnly: true, required: false } : {}),
      order,
      ...(Array.isArray(field.options) ? { options: field.options.map(String).slice(0, 50) } : builtIn?.options ? { options: builtIn.options } : {}),
      ...fieldProperties(field, builtIn),
    }
    if (isComputedField(next)) Object.assign(next, { readOnly: true, required: false })
    if (next.system) Object.assign(next, { visible: true, required: builtIn.required ?? next.required, type: builtIn.type, readOnly: false })
    byKey.set(key, next)
  })
  for (const field of DEFAULT_FIELDS.filter((f) => f.system)) {
    if (!byKey.has(field.key)) byKey.set(field.key, { ...field, order: byKey.size })
  }
  return [...byKey.values()]
}

/** A pattern an admin typed, if it is a usable regular expression. */
// A quantified group that is itself repeated — (a+)+, (\w*)*, (x|y+){2,} —
// can take exponential time on a crafted input. An admin types the pattern
// and a coach types the input, so such patterns are refused outright.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/
// Backreferences are refused for the same reason.
const BACKREFERENCE = /\\[1-9]/

export function safePattern(pattern) {
  if (!pattern || typeof pattern !== 'string' || pattern.length > 200) return null
  if (NESTED_QUANTIFIER.test(pattern) || BACKREFERENCE.test(pattern)) return null
  try {
    return new RegExp(`^(?:${pattern})$`)
  } catch {
    return null
  }
}

/** PRD v1 §8 field properties: help, placeholder, default, pattern, min/max, conditional visibility. */
function fieldProperties(field, builtIn) {
  const out = {}
  const text = (v, max) => (v == null || v === '' ? undefined : String(v).slice(0, max))
  const helpText = text(field.helpText ?? builtIn?.helpText, 200)
  if (helpText) out.helpText = helpText
  const placeholder = text(field.placeholder, 80)
  if (placeholder) out.placeholder = placeholder
  if (field.defaultValue != null && field.defaultValue !== '') out.defaultValue = Array.isArray(field.defaultValue) ? field.defaultValue.map(String).slice(0, 20) : String(field.defaultValue).slice(0, 200)
  if (safePattern(field.pattern)) {
    out.pattern = field.pattern
    if (field.patternMessage) out.patternMessage = String(field.patternMessage).slice(0, 120)
  }
  for (const k of ['min', 'max']) if (field[k] !== undefined && field[k] !== null && field[k] !== '' && Number.isFinite(Number(field[k]))) out[k] = Number(field[k])
  if (field.showIf && typeof field.showIf === 'object' && field.showIf.field) {
    const equals = Array.isArray(field.showIf.equals) ? field.showIf.equals.map(String).slice(0, 20) : String(field.showIf.equals ?? '')
    out.showIf = { field: String(field.showIf.field).slice(0, 60), equals }
  }
  const formula = field.formula ?? builtIn?.formula
  if (formula && CALCULATED_FORMULAS[formula]) out.formula = formula
  if (field.source && SYSTEM_SOURCES[field.source]) out.source = field.source
  return out
}

/** Conditional visibility: shown unless its condition is not met. */
export function fieldShown(field, valueOf) {
  if (!field.showIf) return true
  const v = valueOf(field.showIf.field)
  const wanted = Array.isArray(field.showIf.equals) ? field.showIf.equals : [field.showIf.equals]
  const have = Array.isArray(v) ? v.map(String) : [String(v ?? '')]
  return wanted.some((w) => have.includes(String(w)))
}

const PHONE = /^\+?[0-9][0-9\s-]{6,16}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const normalizeGender = (value) => {
  const v = String(value ?? '').trim().toLowerCase()
  if (['m', 'male', 'boy', 'boys', 'man'].includes(v)) return 'M'
  if (['f', 'female', 'girl', 'girls', 'woman'].includes(v)) return 'F'
  return null
}

export const normalizeEvents = (value) => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,+/&]| and /i)
  const set = new Set()
  for (const part of raw) {
    const v = String(part).trim().toLowerCase()
    if (v === 'kata') set.add('kata')
    else if (v === 'kumite') set.add('kumite')
    else if (v === 'both' || v === 'kata kumite') { set.add('kata'); set.add('kumite') } else if (v) return null
  }
  return [...set]
}

/** Accepts ISO dates and the DD/MM/YYYY format the PRD's examples use. */
export function normalizeDate(value) {
  if (value == null || value === '') return null
  const v = String(value).trim()
  let iso = null
  if (ISO_DATE.test(v)) iso = v
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null
  return iso
}

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * What a coach may send: everything but the read-only fields, which keep the
 * value the organisers gave them.
 */
export function withoutReadOnly(input, fields, before = null) {
  const out = { ...input, extra: { ...(input.extra || {}) } }
  for (const field of fields.filter((f) => f.readOnly)) {
    if (BUILT_IN_KEYS.has(field.key)) {
      if (before && field.key in before) out[field.key] = before[field.key]
      else delete out[field.key]
    } else if (before?.extra && field.key in before.extra) {
      out.extra[field.key] = before.extra[field.key]
    } else {
      delete out.extra[field.key]
      if (!BUILT_IN_KEYS.has(field.key)) delete out[field.key]
    }
  }
  return out
}

/**
 * Checks one player against a form. Returns `{ player, errors }` where
 * `player` is normalised (gender as M/F, events as an array, dates ISO) and
 * `errors` is a list of { field, message }.
 */
export function validatePlayer(input, fields = DEFAULT_FIELDS, { weightPrecision = null } = {}) {
  const errors = []
  const player = { extra: { ...(input.extra || {}) } }
  const get = (key) => (BUILT_IN_KEYS.has(key) ? input[key] : (input.extra?.[key] ?? input[key]))
  const set = (key, value) => {
    if (BUILT_IN_KEYS.has(key)) player[key] = value
    else player.extra[key] = value
  }
  const textLength = (field, value, fallbackMax = 200) => {
    const lo = field.min ?? (['name', 'fatherName', 'motherName'].includes(field.key) ? 2 : null)
    const hi = field.max ?? (['name', 'fatherName', 'motherName'].includes(field.key) ? 100 : fallbackMax)
    if (lo != null && value.length < lo) return `${field.label} must be at least ${lo} characters`
    if (hi != null && value.length > hi) return `${field.label} must be at most ${hi} characters`
    return null
  }

  for (const field of fields) {
    if (field.visible === false && !field.system) continue
    // A value the system assigns or works out is never taken from a form.
    if (isComputedField(field)) continue
    // A field hidden by its condition is neither required nor checked.
    if (!field.system && !fieldShown(field, get)) continue
    let value = get(field.key)
    if (typeof value === 'string') value = value.trim().replace(/\s+/g, field.type === 'textarea' ? ' ' : ' ')

    if (isEmpty(value)) {
      // Organisers fill a read-only field later; it cannot hold up a coach.
      if (field.required && !field.readOnly) errors.push({ field: field.key, message: `${field.label} is required` })
      continue
    }

    let problem = null
    if (field.key === 'gender') {
      const g = normalizeGender(value)
      if (!g) problem = 'Gender must be M or F'
      else set('gender', g)
    } else if (field.key === 'events') {
      const ev = normalizeEvents(value)
      if (!ev || !ev.length) problem = 'Event must be Kata, Kumite or both'
      else set('events', ev)
    } else if (field.type === 'date') {
      const d = normalizeDate(value)
      if (!d) problem = `${field.label} is not a valid date`
      else set(field.key, d)
    } else if (field.type === 'number') {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
      const lo = field.min ?? 0
      const hi = field.max ?? 300
      if (!Number.isFinite(n) || n <= 0 && lo >= 0 || n < lo || n > hi) problem = field.min != null || field.max != null ? `${field.label} must be between ${lo} and ${hi}` : `${field.label} must be a positive number`
      else if (field.key === 'weight' && weightPrecision != null && Math.abs(n * 10 ** weightPrecision - Math.round(n * 10 ** weightPrecision)) > 1e-6) {
        problem = `Weight allows ${weightPrecision} decimal place${weightPrecision === 1 ? '' : 's'}`
      } else set(field.key, n)
    } else if (field.type === 'phone') {
      if (!PHONE.test(String(value))) problem = `${field.label} is not a valid phone number`
      else set(field.key, String(value))
    } else if (field.type === 'email') {
      if (!EMAIL.test(String(value))) problem = `${field.label} is not a valid email`
      else set(field.key, String(value).toLowerCase())
    } else if (field.type === 'country') {
      const c = findCountry(value)
      if (!c) problem = `${field.label}: "${value}" is not a recognised country`
      else set(field.key, c)
    } else if (field.type === 'state') {
      const country = get('country')
      const st = findState(country, value)
      if (!st) problem = `${field.label}: "${value}" is not a state of ${findCountry(country)}`
      else set(field.key, st)
    } else if ((field.type === 'dropdown' || field.type === 'radio') && field.options?.length) {
      if (!field.options.includes(String(value))) problem = `${field.label} must be one of ${field.options.join(', ')}`
      else set(field.key, String(value))
    } else if (field.type === 'multiselect' || (field.type === 'checkbox' && field.options?.length && field.key !== 'events')) {
      const list = (Array.isArray(value) ? value : String(value).split(/[,;|]/)).map((v) => String(v).trim()).filter(Boolean)
      const bad = field.options?.length ? list.filter((v) => !field.options.includes(v)) : []
      if (bad.length) problem = `${field.label}: ${bad.join(', ')} is not an option`
      else if (field.min != null && list.length < field.min) problem = `${field.label}: choose at least ${field.min}`
      else if (field.max != null && list.length > field.max) problem = `${field.label}: choose at most ${field.max}`
      else set(field.key, list)
    } else if (field.type === 'file') {
      // The id of an uploaded file (see files.js), never the bytes themselves.
      if (!/^[A-Za-z0-9_-]{2,80}$/.test(String(value))) problem = `${field.label} must be an uploaded file`
      else set(field.key, String(value))
    } else if (field.type === 'checkbox' && field.key !== 'events') {
      set(field.key, Array.isArray(value) ? value.map(String) : value === true || value === 'true' || value === 'yes')
    } else {
      const str = String(value)
      problem = textLength(field, str, field.type === 'textarea' ? 2000 : 200)
      if (!problem) set(field.key, str)
    }

    if (!problem && field.pattern && typeof value !== 'object') {
      const re = safePattern(field.pattern)
      if (re && !re.test(String(value))) problem = field.patternMessage || `${field.label} is not in the expected format`
    }
    if (problem) errors.push({ field: field.key, message: problem })
  }

  // Kumite is placed by weight (section 19), so a kumite entry needs one.
  if (player.events?.includes('kumite') && player.weight == null && !errors.some((e) => e.field === 'weight')) {
    errors.push({ field: 'weight', message: 'Weight is required for Kumite' })
  }
  if (player.dob && player.dob > new Date().toISOString().slice(0, 10)) {
    errors.push({ field: 'dob', message: 'DOB cannot be in the future' })
  }
  if (!Object.keys(player.extra).length) delete player.extra
  return { player, errors }
}

/** Defaults an admin set on the form, for a field the input left empty. */
export function withDefaults(input, fields) {
  const out = { ...input, extra: { ...(input.extra || {}) } }
  for (const f of fields) {
    if (f.defaultValue == null || isComputedField(f)) continue
    const has = BUILT_IN_KEYS.has(f.key) ? out[f.key] : out.extra[f.key]
    if (has != null && has !== '') continue
    if (BUILT_IN_KEYS.has(f.key)) out[f.key] = f.defaultValue
    else out.extra[f.key] = f.defaultValue
  }
  return out
}

/**
 * Names compared for duplicates without changing the official spelling:
 * case, spacing, punctuation and accents ignored (PRD v1 §21).
 */
export const normalizeName = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim()

/**
 * PRD v1 §21 duplicate detection: name + DOB + club, or the same federation
 * ID. Returns the matching existing players.
 */
export function possibleDuplicates(player, existing) {
  const fed = normalizeName(player.federationId)
  return existing.filter((p) => (
    (normalizeName(p.name) === normalizeName(player.name) && p.dob && p.dob === player.dob
      && (!player.club || !p.club || normalizeName(p.club) === normalizeName(player.club)))
    || (fed && normalizeName(p.federationId) === fed)
  ))
}

/** Same person twice: same name and date of birth, ignoring case and spacing. */
export const playerIdentity = (p) => `${normalizeName(p.name)}|${p.dob || ''}`

// --- bulk upload ------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = String(text).replace(/^﻿/, '')
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1 } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const csvCell = (value) => {
  const s = value == null ? '' : Array.isArray(value) ? value.join('+') : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

/**
 * A cell a spreadsheet would run as a formula ("=HYPERLINK(…)", "@SUM(…)",
 * "-1+1|cmd!A0"), made inert with a leading apostrophe. Coaches type names
 * and clubs, so every exported CSV goes through this. "-35 KG" and "+91 …"
 * are left alone: a sign alone is not a formula.
 */
export const neutralizeFormula = (value) => {
  if (typeof value !== 'string' || !value) return value
  if (/^[=@\t\r]/.test(value)) return `'${value}`
  if (/^[+-]/.test(value) && /[=(|!@;]/.test(value)) return `'${value}`
  return value
}

/** CSV for people to open in a spreadsheet: as toCsv, with formulas neutralised. */
export const toExportCsv = (rows) => toCsv(rows.map((r) => r.map((v) => neutralizeFormula(Array.isArray(v) ? v.join('+') : v))))

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Maps spreadsheet headers to field keys by key or label, forgivingly. */
export function mapHeaders(headers, fields = DEFAULT_FIELDS) {
  const aliases = { team: 'team', teamname: 'team', clubcode: 'team', events: 'events', event: 'events', weightkg: 'weight', dateofbirth: 'dob', birthdate: 'dob', sex: 'gender', fullname: 'name', playername: 'name', name: 'name', phone: 'mobile' }
  return headers.map((header) => {
    const h = squash(header)
    const field = fields.find((f) => squash(f.key) === h || squash(f.label) === h)
    return field?.key || aliases[h] || null
  })
}

/** The template a coach downloads, matching the tournament's own form. */
export function bulkTemplate(fields = DEFAULT_FIELDS) {
  const keys = fields.filter((f) => f.visible !== false && f.type !== 'file' && !isComputedField(f))
  return toCsv([['Team', ...keys.map((f) => f.label)]])
}

/**
 * Section 15: validate and preview before anything is created. `teams` lets a
 * row name its team; `existing` catches a player already registered.
 */
export function validateBulkRows(rows, { fields = DEFAULT_FIELDS, teams = [], existing = [], defaultTeamId = null, defaultCountry = null, weightPrecision = null } = {}) {
  if (!rows.length) return { rows: [], valid: [], errors: [{ row: 0, field: null, message: 'The file is empty' }], warnings: [] }
  const [headers, ...body] = rows
  const keys = mapHeaders(headers, fields)
  const seen = new Set()
  const out = []
  const errors = []
  const warnings = []

  body.forEach((cells, i) => {
    const rowNumber = i + 2 // spreadsheet row, counting the header
    const input = {}
    let teamRef = null
    keys.forEach((key, col) => {
      if (!key) return
      const cell = cells[col] ?? ''
      if (key === 'team') teamRef = cell.trim()
      else if (BUILT_IN_KEYS.has(key)) input[key] = cell
      else (input.extra ||= {})[key] = cell
    })
    let teamId = defaultTeamId
    let team = teams.find((t) => t.id === defaultTeamId) || null
    const teamErrors = []
    if (teamRef) {
      team = teams.find((t) => squash(t.name) === squash(teamRef) || (t.code && squash(t.code) === squash(teamRef)) || (t.teamNumber && squash(t.teamNumber) === squash(teamRef)))
      if (!team) teamErrors.push({ field: 'team', message: `Unknown team "${teamRef}"` })
      else teamId = team.id
    }
    if (!teamId && !teamRef) teamErrors.push({ field: 'team', message: 'Team is required' })
    const filled = withTeamDefaults(withDefaults(input, fields), team, defaultCountry)
    const { player, errors: rowErrors } = validatePlayer(filled, fields, { weightPrecision })
    rowErrors.push(...teamErrors)
    const identity = playerIdentity(player)
    if (player.name && player.dob) {
      if (seen.has(identity)) rowErrors.push({ field: 'name', message: 'Duplicate player in this file (same name and DOB)' })
      seen.add(identity)
    }
    // Already registered: a warning to review, never a silent merge (PRD v1 §28).
    const dupes = player.name ? possibleDuplicates(player, existing) : []
    const rowWarnings = dupes.length ? [{ field: 'name', message: `Possible duplicate of ${dupes.map((d) => `${d.name}${d.playerNumber ? ` (${d.playerNumber})` : ''}`).join(', ')}` }] : []
    rowErrors.forEach((e) => errors.push({ row: rowNumber, ...e }))
    rowWarnings.forEach((w) => warnings.push({ row: rowNumber, ...w }))
    out.push({ row: rowNumber, player: { ...player, teamId, ...(dupes.length ? { duplicateOf: dupes.map((d) => d.id) } : {}) }, errors: rowErrors, warnings: rowWarnings })
  })

  return { rows: out, valid: out.filter((r) => !r.errors.length).map((r) => r.player), errors, warnings }
}

/** Club and country come from the team when a row or form leaves them out. */
export function withTeamDefaults(input, team, defaultCountry = null) {
  const out = { ...input }
  if ((out.club == null || out.club === '') && team) out.club = team.club || team.name
  if ((out.country == null || out.country === '') && (team?.country || defaultCountry)) out.country = team?.country || defaultCountry
  return out
}

export const errorReportCsv = (errors) =>
  toExportCsv([['Row', 'Field', 'Error'], ...errors.map((e) => [e.row, e.field || '', e.message])])

// --- privacy (Rule 8) -------------------------------------------------------

/**
 * What the public may see of a player: an allow-list, so a field added later
 * stays private until someone decides otherwise.
 */
export const PUBLIC_PLAYER_FIELDS = ['id', 'name', 'gender', 'club', 'state', 'country', 'district', 'belt', 'events', 'teamId']

export function publicPlayer(player) {
  const out = {}
  for (const key of PUBLIC_PLAYER_FIELDS) if (player[key] !== undefined) out[key] = player[key]
  return out
}

export const PUBLIC_TEAM_FIELDS = ['id', 'name', 'club', 'code', 'district', 'state', 'country']

export function publicTeam(team) {
  const out = {}
  for (const key of PUBLIC_TEAM_FIELDS) if (team[key] !== undefined) out[key] = team[key]
  return out
}
