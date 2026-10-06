// Server-side paging (PRD section 62): a page of rows plus the total, so a
// screen never has to hold thousands of players to show fifty.

export const MAX_PAGE_SIZE = 200

export function pageOptions({ page, pageSize, sort, dir } = {}) {
  const p = Math.max(0, Number.parseInt(page, 10) || 0)
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || 50))
  return { page: p, pageSize: size, sort: typeof sort === 'string' && /^[A-Za-z0-9_.]{1,40}$/.test(sort) ? sort : null, dir: dir === 'desc' ? 'desc' : 'asc' }
}

const valueAt = (row, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), row)

/** Sorts (by any field, dotted paths allowed) and slices rows already in hand. */
export function paginate(rows, options = {}) {
  const { page, pageSize, sort, dir } = pageOptions(options)
  let out = rows
  if (sort) {
    out = [...rows].sort((a, b) => {
      const x = valueAt(a, sort)
      const y = valueAt(b, sort)
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })
      return dir === 'desc' ? -d : d
    })
  }
  return { rows: out.slice(page * pageSize, page * pageSize + pageSize), total: rows.length, page, pageSize }
}
