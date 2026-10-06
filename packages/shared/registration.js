// PRD sections 11-12 and 15: the per-tournament registration form, checking a
// player against it, and reading a bulk upload. Shared so the coach's browser
// and the server reject exactly the same rows.

export const FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'file', 'phone', 'email']

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
  { key: 'club', label: 'Club/School/Dojo', type: 'text' },
  { key: 'coachName', label: 'Coach Name', type: 'text' },
  { key: 'district', label: 'District', type: 'text' },
  { key: 'division', label: 'Division', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'federationId', label: 'Federation ID', type: 'text' },
  { key: 'belt', label: 'Belt', type: 'dropdown', options: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'] },
  { key: 'events', label: 'Event', type: 'checkbox', required: true, system: true, options: ['kata', 'kumite'] },
  { key: 'weight', label: 'Weight (kg)', type: 'number', system: true },
  { key: 'emergencyContact', label: 'Emergency Contact', type: 'phone' },
  { key: 'bloodGroup', label: 'Blood Group', type: 'dropdown', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
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
    }
    if (next.system) Object.assign(next, { visible: true, required: builtIn.required ?? next.required, type: builtIn.type, readOnly: false })
    byKey.set(key, next)
  })
  for (const field of DEFAULT_FIELDS.filter((f) => f.system)) {
    if (!byKey.has(field.key)) byKey.set(field.key, { ...field, order: byKey.size })
  }
  return [...byKey.values()]
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
export function validatePlayer(input, fields = DEFAULT_FIELDS) {
  const errors = []
  const player = { extra: { ...(input.extra || {}) } }
  const get = (key) => (BUILT_IN_KEYS.has(key) ? input[key] : (input.extra?.[key] ?? input[key]))
  const set = (key, value) => {
    if (BUILT_IN_KEYS.has(key)) player[key] = value
    else player.extra[key] = value
  }

  for (const field of fields) {
    if (field.visible === false && !field.system) continue
    // A number the system assigns is never taken from a form.
    if (field.generated) continue
    let value = get(field.key)
    if (typeof value === 'string') value = value.trim()

    if (isEmpty(value)) {
      // Organisers fill a read-only field later; it cannot hold up a coach.
      if (field.required && !field.readOnly) errors.push({ field: field.key, message: `${field.label} is required` })
      continue
    }

    if (field.key === 'gender') {
      const g = normalizeGender(value)
      if (!g) errors.push({ field: 'gender', message: 'Gender must be M or F' })
      else set('gender', g)
    } else if (field.key === 'events') {
      const ev = normalizeEvents(value)
      if (!ev || !ev.length) errors.push({ field: 'events', message: 'Event must be Kata, Kumite or both' })
      else set('events', ev)
    } else if (field.type === 'date') {
      const d = normalizeDate(value)
      if (!d) errors.push({ field: field.key, message: `${field.label} is not a valid date` })
      else set(field.key, d)
    } else if (field.type === 'number') {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0 || n > 300) errors.push({ field: field.key, message: `${field.label} must be a positive number` })
      else set(field.key, n)
    } else if (field.type === 'phone') {
      if (!PHONE.test(String(value))) errors.push({ field: field.key, message: `${field.label} is not a valid phone number` })
      else set(field.key, String(value))
    } else if (field.type === 'email') {
      if (!EMAIL.test(String(value))) errors.push({ field: field.key, message: `${field.label} is not a valid email` })
      else set(field.key, String(value).toLowerCase())
    } else if ((field.type === 'dropdown' || field.type === 'radio') && field.options?.length) {
      if (!field.options.includes(String(value))) errors.push({ field: field.key, message: `${field.label} must be one of ${field.options.join(', ')}` })
      else set(field.key, String(value))
    } else if (field.type === 'file') {
      // The id of an uploaded file (see files.js), never the bytes themselves.
      if (!/^[A-Za-z0-9_-]{2,80}$/.test(String(value))) errors.push({ field: field.key, message: `${field.label} must be an uploaded file` })
      else set(field.key, String(value))
    } else if (field.type === 'checkbox' && field.key !== 'events') {
      set(field.key, Array.isArray(value) ? value.map(String) : value === true || value === 'true' || value === 'yes')
    } else {
      set(field.key, String(value).slice(0, 200))
    }
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

/** Same person twice: same name and date of birth, ignoring case and spacing. */
export const playerIdentity = (p) =>
  `${String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${p.dob || ''}`

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
  const keys = fields.filter((f) => f.visible !== false && f.type !== 'file' && !f.generated)
  return toCsv([['Team', ...keys.map((f) => f.label)]])
}

/**
 * Section 15: validate and preview before anything is created. `teams` lets a
 * row name its team; `existing` catches a player already registered.
 */
export function validateBulkRows(rows, { fields = DEFAULT_FIELDS, teams = [], existing = [], defaultTeamId = null } = {}) {
  if (!rows.length) return { rows: [], valid: [], errors: [{ row: 0, field: null, message: 'The file is empty' }] }
  const [headers, ...body] = rows
  const keys = mapHeaders(headers, fields)
  const seen = new Set(existing.map(playerIdentity))
  const out = []
  const errors = []

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
    const { player, errors: rowErrors } = validatePlayer(input, fields)
    let teamId = defaultTeamId
    if (teamRef) {
      const team = teams.find((t) => squash(t.name) === squash(teamRef) || (t.code && squash(t.code) === squash(teamRef)))
      if (!team) rowErrors.push({ field: 'team', message: `Unknown team "${teamRef}"` })
      else teamId = team.id
    }
    if (!teamId && !teamRef) rowErrors.push({ field: 'team', message: 'Team is required' })
    const identity = playerIdentity(player)
    if (player.name && player.dob) {
      if (seen.has(identity)) rowErrors.push({ field: 'name', message: 'Duplicate player (same name and DOB)' })
      seen.add(identity)
    }
    rowErrors.forEach((e) => errors.push({ row: rowNumber, ...e }))
    out.push({ row: rowNumber, player: { ...player, teamId }, errors: rowErrors })
  })

  return { rows: out, valid: out.filter((r) => !r.errors.length).map((r) => r.player), errors }
}

export const errorReportCsv = (errors) =>
  toCsv([['Row', 'Field', 'Error'], ...errors.map((e) => [e.row, e.field || '', e.message])])

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
