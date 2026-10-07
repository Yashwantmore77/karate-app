// A small query language every store understands (PRD section 62: lists are
// filtered, sorted and paged by the store, not in memory). MongoDB runs it as
// a real query; the memory stores run the same rules over their rows, so tests
// and production agree.
//
//   { field: value }                 equal (a dotted path reaches inside; an array field contains it)
//   { field: { $in: [a, b] } }       one of
//   { field: { $ieq: 'text' } }      equal, ignoring case
//   { field: { $contains: 'text' } } contains, ignoring case
//   { field: { $missing: true } }    absent (or null)
//   { $or: [query, query] }          any of
//   { $and: [query, query] }         all of

const valueAt = (row, path) => path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), row)
const fold = (v) => String(v ?? '').toLowerCase()

function matchesCondition(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    if ('$in' in cond) return cond.$in.some((x) => (Array.isArray(value) ? value.includes(x) : value === x))
    if ('$ieq' in cond) return fold(value) === fold(cond.$ieq)
    if ('$contains' in cond) return fold(value).includes(fold(cond.$contains))
    if ('$missing' in cond) return (value == null) === !!cond.$missing
    return false
  }
  return Array.isArray(value) ? value.includes(cond) : value === cond
}

/** Whether a row satisfies a query (the memory stores' implementation). */
export function matchesQuery(row, query = {}) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((q) => matchesQuery(row, q))
    if (key === '$and') return cond.every((q) => matchesQuery(row, q))
    return matchesCondition(valueAt(row, key), cond)
  })
}

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The same query for MongoDB. Text is escaped before it reaches a regex. */
export function toMongo(query = {}) {
  const out = {}
  for (const [key, cond] of Object.entries(query)) {
    if (key === '$or' || key === '$and') { out[key] = cond.map(toMongo); continue }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) out[key] = { $in: cond.$in }
      else if ('$ieq' in cond) out[key] = { $regex: `^${escapeRegex(cond.$ieq)}$`, $options: 'i' }
      else if ('$contains' in cond) out[key] = { $regex: escapeRegex(cond.$contains), $options: 'i' }
      else if ('$missing' in cond) out[key] = cond.$missing ? { $in: [null] } : { $nin: [null] }
      continue
    }
    out[key] = cond
  }
  return out
}

/** Sorts rows by one field, numbers as numbers, text ignoring case, blanks last. */
export function sortRows(rows, sort = null) {
  if (!sort) return rows
  const [[field, dir]] = Object.entries(sort)
  const sign = dir < 0 ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = valueAt(a, field)
    const y = valueAt(b, field)
    if (x == null && y == null) return String(a.id).localeCompare(String(b.id))
    if (x == null) return 1
    if (y == null) return -1
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true })
    return order * sign || String(a.id).localeCompare(String(b.id))
  })
}

/** search() for a store that holds its rows in memory. */
export function searchRows(allRows, query, { sort = null, skip = 0, limit = null } = {}) {
  const found = sortRows(allRows.filter((row) => matchesQuery(row, query)), sort)
  return { rows: limit ? found.slice(skip, skip + limit) : found.slice(skip), total: found.length }
}
