import { describe, it, expect, beforeEach, vi } from 'vitest'

// The rest of the suite runs with no server, so displayRepo resolves to local
// storage. This file pins the other branch: what a hall screen does when the
// API is the source of truth.
vi.mock('./session', () => ({
  apiUrl: (path) => `http://api.test/api/v1${path}`,
  getToken: () => null,
  clearSession: vi.fn(),
  serverUrl: () => 'http://api.test',
}))

const { displayRepo } = await import('./repo')

let calls, board

beforeEach(() => {
  calls = []
  board = { status: 'open', aoScore: 0, akaScore: 0 }
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined })
    if ((init.method || 'GET') === 'PUT') board = JSON.parse(init.body)
    return { ok: true, status: 200, json: async () => ({ display: board }) }
  })
})

describe('displayRepo against the API', () => {
  it('reads the live board from the public endpoint', async () => {
    expect(await displayRepo.get()).toMatchObject({ status: 'open' })
    expect(calls[0]).toMatchObject({ url: 'http://api.test/api/v1/display', method: 'GET' })
  })

  it('reads with no authorization header, because a hall screen has no session', async () => {
    await displayRepo.get()
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(init.headers.authorization).toBeUndefined()
  })

  it('publishes the console snapshot with PUT', async () => {
    const snapshot = {
      status: 'open', matchId: 'm1', fieldNumber: '3',
      aoScore: 3, akaScore: 1, senshu: 'ao',
      clock: { running: true, remainingMs: 90000, startedAt: 1700000000000 },
      heartbeatAt: 1700000000000,
    }
    await displayRepo.put(snapshot)
    expect(calls[0]).toMatchObject({
      url: 'http://api.test/api/v1/display', method: 'PUT', body: snapshot,
    })
  })

  it('delivers the board once immediately on subscribe, then keeps polling', async () => {
    vi.useFakeTimers()
    try {
      const seen = []
      const stop = displayRepo.subscribe((row) => seen.push(row))

      // The first read is fired straight away so a screen is never blank for a
      // whole poll interval.
      await vi.advanceTimersByTimeAsync(0)
      expect(seen).toHaveLength(1)

      board = { status: 'open', aoScore: 7, akaScore: 1 }
      await vi.advanceTimersByTimeAsync(1000)
      expect(seen[seen.length - 1]).toMatchObject({ aoScore: 7 })

      stop()
      const settled = seen.length
      await vi.advanceTimersByTimeAsync(3000)
      expect(seen).toHaveLength(settled)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps polling after a failed request rather than going dark', async () => {
    vi.useFakeTimers()
    try {
      globalThis.fetch = vi.fn(async () => { throw new Error('network down') })
      const seen = []
      const stop = displayRepo.subscribe((row) => seen.push(row))

      await vi.advanceTimersByTimeAsync(0)
      expect(seen).toHaveLength(0)

      // Recovered: the next tick must still ask.
      globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ display: board }) }))
      await vi.advanceTimersByTimeAsync(1000)
      expect(seen).toHaveLength(1)

      stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
