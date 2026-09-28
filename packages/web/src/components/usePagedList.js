import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_LIMIT = 25
const SEARCH_DEBOUNCE_MS = 300

/**
 * Drives one paged, searchable table.
 *
 * `fetchPage` takes { page, limit, q } and resolves { rows, total, pages }.
 * Both the API and the local store expose exactly that, so a screen using this
 * works either way without knowing which it is talking to.
 */
export function usePagedList(fetchPage, { limit = DEFAULT_LIMIT, deps = [] } = {}) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  // A new search starts from the first page; staying on page 4 of the old
  // result set would usually land on nothing.
  useEffect(() => { setPage(1) }, [query])

  // Identifies the newest request, so a slow earlier one cannot land on top of
  // a faster later one and show stale rows.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const ticket = latest.current + 1
    latest.current = ticket
    setLoading(true)
    try {
      const result = await fetchPage({ page, limit, q: query })
      if (latest.current !== ticket) return
      setRows(result.rows)
      setTotal(result.total)
      setError(null)
    } catch (err) {
      if (latest.current !== ticket) return
      setError(err)
      setRows([])
      setTotal(0)
    } finally {
      if (latest.current === ticket) setLoading(false)
    }
    // fetchPage is rebuilt every render by most callers, so the caller's own
    // dependencies decide when this reloads rather than the function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, query, ...deps])

  useEffect(() => { load() }, [load])

  return {
    rows,
    total,
    page,
    limit,
    loading,
    error,
    search,
    setSearch,
    setPage,
    /** Re-reads the current page, for use after a write. */
    refresh: load,
    /** Drops to the first page and re-reads, for use after adding a row. */
    reset: () => (page === 1 ? load() : setPage(1)),
  }
}
