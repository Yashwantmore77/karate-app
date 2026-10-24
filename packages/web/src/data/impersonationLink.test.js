import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openImpersonationTab, adoptImpersonationTicket } from './impersonationLink'
import * as session from './session'

// KAN-429: a lens is a brand new tab, signed in on its own, opened by one
// click with no password step. Two things matter most here:
// - the blank tab must open *before* the server round trip, synchronously
//   in the click handler, or most browsers (Safari strictly) block it as a
//   popup once an `await` has passed;
// - the ticket in that tab's URL is single-use and must never linger: it is
//   exchanged for the real session and then scrubbed from the address bar.

const api = vi.hoisted(() => ({ impersonate: vi.fn() }))
vi.mock('./users', () => ({ impersonate: api.impersonate }))
vi.mock('./session', async (importOriginal) => ({ ...(await importOriginal()), apiUrl: (path) => `http://test${path}` }))

const originalFetch = global.fetch

describe('openImpersonationTab', () => {
  let openSpy

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the blank tab before the server call, then navigates it once the ticket arrives', async () => {
    const tab = { location: {}, close: vi.fn() }
    openSpy = vi.spyOn(window, 'open').mockReturnValue(tab)
    let resolveImpersonate
    api.impersonate.mockReturnValue(new Promise((resolve) => { resolveImpersonate = resolve }))

    const done = openImpersonationTab({ uid: 'ref-1', role: 'referee' })
    // The tab opens synchronously, before impersonate() has even resolved.
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy.mock.calls[0]).toEqual(['', '_blank', 'noopener'])
    expect(tab.location.href).toBeUndefined()

    resolveImpersonate({ ticket: 'tkt-123' })
    await done
    expect(tab.location.href).toMatch(/^http:\/\/.*\/referee\?impersonate_ticket=tkt-123$/)
  })

  it('closes the blank tab and rethrows if the server refuses', async () => {
    const tab = { location: {}, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab)
    api.impersonate.mockRejectedValue(Object.assign(new Error('cannot_impersonate_admin'), { code: 'cannot_impersonate_admin' }))

    await expect(openImpersonationTab({ uid: 'a1', role: 'admin' })).rejects.toMatchObject({ code: 'cannot_impersonate_admin' })
    expect(tab.close).toHaveBeenCalled()
  })

  it("falls back to a plain window.open when the popup blocker ate the blank one", async () => {
    vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValueOnce(undefined)
    api.impersonate.mockResolvedValue({ ticket: 'tkt-999' })

    await openImpersonationTab({ uid: 'ref-2', role: 'referee' })
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(String(window.open.mock.calls[1][0])).toMatch(/\/referee\?impersonate_ticket=tkt-999$/)
  })
})

describe('adoptImpersonationTicket', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    delete window.location
    window.location = new URL('http://localhost/referee?impersonate_ticket=tkt-abc')
    // jsdom's real replaceState validates the URL against its own page
    // origin, which the swapped-out window.location above doesn't match —
    // a jsdom quirk, nothing this test is about, so it's stubbed out.
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  })
  afterEach(() => {
    window.location = originalLocation
    global.fetch = originalFetch
  })

  it('redeems the ticket, stores the token, and scrubs it from the URL', async () => {
    let sentBody = null
    global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      sentBody = JSON.parse(opts.body)
      return { ok: true, json: async () => ({ token: 'lens-token', user: { uid: 'ref-1' } }) }
    })
    const setToken = vi.spyOn(session, 'setToken')

    await adoptImpersonationTicket()

    expect(sentBody).toEqual({ ticket: 'tkt-abc' })
    expect(setToken).toHaveBeenCalledWith('lens-token')
    // The URL this tab is left showing carries no ticket — it was spent,
    // but a credential-shaped string has no business sitting in the address
    // bar or browser history any longer than it has to.
    const [, , url] = window.history.replaceState.mock.calls[0]
    expect(String(url)).not.toContain('impersonate_ticket')
  })

  it('does nothing for an ordinary tab with no ticket in its URL', async () => {
    window.location = new URL('http://localhost/referee')
    global.fetch = vi.fn()
    await adoptImpersonationTicket()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('leaves the tab simply signed out if the ticket was already spent or had expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const setToken = vi.spyOn(session, 'setToken')
    await expect(adoptImpersonationTicket()).resolves.toBeUndefined()
    expect(setToken).not.toHaveBeenCalled()
  })
})
