import { apiUrl, setToken } from './session'
import { impersonate } from './users'

// KAN-429: an admin's lens into another account is a second tab, open and
// signed in on its own — never a swap of the tab the admin is already using.
// `openImpersonationTab` starts it; `adoptImpersonationTicket` is what that
// new tab runs, once, before the app itself ever renders.

const PARAM = 'impersonate_ticket'

/**
 * Opens a lens into `account` in a new tab. Call from the Accounts page, in
 * direct response to the click: the blank tab is opened synchronously,
 * before the server round trip for the ticket, because most browsers
 * (Safari strictly) treat a `window.open` after an `await` as a popup and
 * block it — it no longer looks triggered by the click that led to it.
 */
export async function openImpersonationTab(account) {
  const tab = window.open('', '_blank', 'noopener')
  try {
    const { ticket } = await impersonate(account.uid)
    const url = new URL(`/${account.role}`, window.location.origin)
    url.searchParams.set(PARAM, ticket)
    if (tab) tab.location.href = url.toString()
    else window.open(url, '_blank', 'noopener') // the browser allowed this one instead
  } catch (err) {
    tab?.close()
    throw err
  }
}

/**
 * If this tab was opened as a lens, trades the one-time ticket in its URL
 * for the real session and adopts it — then the URL is cleaned up so the
 * ticket (already spent, but still worth not leaving lying around) is not
 * left sitting in the address bar or browser history. Does nothing, and
 * resolves at once, for an ordinary tab with no ticket.
 */
export async function adoptImpersonationTicket() {
  const url = new URL(window.location.href)
  const ticket = url.searchParams.get(PARAM)
  if (!ticket) return
  url.searchParams.delete(PARAM)
  window.history.replaceState(null, '', url)

  const base = apiUrl('/users/impersonate/exchange')
  if (!base) return
  try {
    const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket }) })
    if (!res.ok) return // expired or already used: the app simply opens signed out
    const { token } = await res.json()
    setToken(token)
  } catch {
    // Offline or unreachable: same as above, falls through to signed out.
  }
}
