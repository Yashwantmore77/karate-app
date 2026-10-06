import nodemailer from 'nodemailer'

/**
 * Outgoing email (PRD sections 4 and 47).
 *
 * SMTP_URL (e.g. smtps://user:pass@smtp.example.com) sends for real. Without
 * it, mail lands in an in-process outbox and the server log, so password
 * resets and notifications work end to end in development and tests without
 * a mail server, and nothing is silently dropped.
 */
const outbox = []
const OUTBOX_LIMIT = 200
let transport = null

const from = () => process.env.MAIL_FROM || 'Kumite Tournaments <no-reply@kumite.local>'

function getTransport() {
  if (transport) return transport
  if (process.env.SMTP_URL) transport = nodemailer.createTransport(process.env.SMTP_URL)
  return transport
}

export async function sendMail({ to, subject, text }) {
  if (!to) return { skipped: true }
  const message = { from: from(), to, subject, text }
  const smtp = getTransport()
  if (smtp) {
    try {
      await smtp.sendMail(message)
      return { sent: true }
    } catch (err) {
      // A mail server being down must never fail the action that triggered
      // the mail; the in-app notification is still there.
      console.error('[mail] send failed', err?.message)
      return { sent: false }
    }
  }
  outbox.push({ ...message, at: new Date().toISOString() })
  if (outbox.length > OUTBOX_LIMIT) outbox.shift()
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) console.info(`[mail:outbox] to=${to} subject="${subject}"\n${text}`)
  return { queued: true }
}

/** Development and test only: what would have been sent. */
export const readOutbox = () => [...outbox]
export const clearOutbox = () => { outbox.length = 0 }
export const isMailConfigured = () => !!process.env.SMTP_URL
