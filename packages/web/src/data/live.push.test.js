import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hall screens on the venue Wi-Fi: what they ask the server for when told
// something changed, and when a score changes.

const sock = vi.hoisted(() => {
  const handlers = new Map()
  return {
    connected: true,
    handlers,
    on: (event, fn) => { handlers.set(event, [...(handlers.get(event) || []), fn]) },
    off: (event, fn) => { handlers.set(event, (handlers.get(event) || []).filter((f) => f !== fn)) },
    fire: (event, payload) => (handlers.get(event) || []).forEach((fn) => fn(payload)),
  }
})
vi.mock('./channel/socket', () => ({ publicSocket: () => sock }))
const http = vi.hoisted(() => ({ httpGet: vi.fn(), httpPut: vi.fn() }))
vi.mock('./http', () => http)

const { watchPublicChanges } = await import('./live')
const { displayRepo } = await import('./display')

beforeEach(() => {
  vi.useFakeTimers()
  sock.handlers.clear()
  http.httpGet.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('a screen told that something changed', () => {
  it('reloads once for a burst of notices, a moment later, and not again straight away', async () => {
    const reload = vi.fn()
    const stop = watchPublicChanges(reload)
    for (let i = 0; i < 10; i += 1) sock.fire('public:changed')
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reload).toHaveBeenCalledTimes(1)
    // More notices right after: one more reload, no sooner than 3 s after the last.
    sock.fire('public:changed')
    sock.fire('public:changed')
    await vi.advanceTimersByTimeAsync(1900)
    expect(reload).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2200)
    expect(reload).toHaveBeenCalledTimes(2)
    stop()
    sock.fire('public:changed')
    await vi.advanceTimersByTimeAsync(5000)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('a mat screen', () => {
  it('shows its own scoreboard as pushed, without asking for it', async () => {
    http.httpGet.mockResolvedValue({ display: { status: 'closed', mat: 2 } })
    const shown = []
    const stop = displayRepo.subscribe((row) => shown.push(row), { mat: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(http.httpGet).toHaveBeenCalledTimes(1) // the first read

    sock.fire('display:mat', { mat: 1, display: { status: 'open', mat: 1, akaScore: 9 } }) // another mat's
    sock.fire('display:mat', { mat: 2, display: { status: 'open', mat: 2, akaScore: 3 } })
    // The hall's row moves with every score; it is not this screen's.
    sock.fire('display:update', { status: 'open', fieldNumber: '1', akaScore: 9, message: null })
    sock.fire('display:update', { status: 'open', fieldNumber: '1', akaScore: 10, message: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(shown.map((r) => r.akaScore ?? null)).toEqual([null, 3])
    expect(http.httpGet).toHaveBeenCalledTimes(1)
    stop()
  })

  it("asks again when the hall's announcement changes, which it shows when it has none", async () => {
    http.httpGet.mockResolvedValue({ display: { status: 'closed', mat: 2, message: null } })
    const stop = displayRepo.subscribe(() => {}, { mat: 2 })
    await vi.advanceTimersByTimeAsync(0)
    sock.fire('display:update', { status: 'open', message: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(http.httpGet).toHaveBeenCalledTimes(1)
    sock.fire('display:update', { status: 'open', message: 'Lunch break until 13:30' })
    await vi.advanceTimersByTimeAsync(0)
    expect(http.httpGet).toHaveBeenCalledTimes(2)
    stop()
  })
})
