import { randomUUID } from 'node:crypto'

/**
 * One-time tickets for an admin's impersonation lens (KAN-429): the new tab
 * that opens a lens carries a ticket in its URL, not the session token
 * itself — a real bearer token sitting in a URL ends up in browser history
 * and in anything that logs full request URLs, for as long as the session
 * lasts (up to 30 minutes here). A ticket is worthless the moment it is
 * read: good for one redemption, within a minute of being issued, and void
 * either way after that.
 *
 * In-process, like the rate limiter and the in-memory session store: this
 * app runs one instance per venue, and a ticket's whole life is the time it
 * takes a browser to open a new tab.
 */
const TICKET_TTL_MS = 60_000
const tickets = new Map()

export function issueImpersonationTicket(payload) {
  const id = randomUUID()
  tickets.set(id, { payload, expiresAt: Date.now() + TICKET_TTL_MS })
  return id
}

/** Redeems a ticket, or returns null for one that is unknown, spent or expired. */
export function redeemImpersonationTicket(id) {
  const row = tickets.get(id)
  tickets.delete(id) // single use regardless of outcome
  if (!row || row.expiresAt < Date.now()) return null
  return row.payload
}
