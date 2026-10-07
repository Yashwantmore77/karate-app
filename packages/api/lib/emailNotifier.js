import { sendMail } from './mailer.js'

const SUBJECT = {
  new_registration: 'New registration',
  bulk_upload_completed: 'Bulk upload completed',
  payment_received: 'Payment received',
  registration_approved: 'Registration approved',
  registration_rejected: 'Registration rejected',
  registration_correction: 'Registration needs a correction',
  payment_confirmed: 'Payment confirmed',
  weighin_reminder: 'Weigh-in reminder',
  draw_published: 'Draw published',
  match_scheduled: 'Matches scheduled',
  result_published: 'Results published',
}

/**
 * Posts a text notice to an SMS or WhatsApp gateway (PRD v1 §19: "SMS and
 * WhatsApp later"). The gateway is whatever the installation points the
 * webhook at; this side only sends { to, text, channel } and never fails the
 * action that caused the notice.
 */
async function postWebhook(url, body) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch (err) {
    console.warn(`[notify] ${body.channel} webhook failed: ${err.message}`)
  }
}

/**
 * PRD section 47's delivery channels: the in-app notification, sent to the
 * people it is for over each channel the tournament has switched on. Team
 * notices go to the team (one team, or every team for a tournament-wide
 * notice); admin notices to the tournament's contact, or ADMIN_NOTIFY_EMAIL.
 * Text channels only send when SMS_WEBHOOK_URL / WHATSAPP_WEBHOOK_URL is set.
 */
export function emailNotifier(stores, { env = process.env, post = postWebhook } = {}) {
  return async (note, tournament, channels = { email: true }) => {
    let teams = []
    if (note.audience === 'team') {
      teams = (note.teamId
        ? [await stores.teams.get(note.teamId)]
        : await stores.teams.list({ tournamentId: note.tournamentId })).filter(Boolean)
    }
    const emails = note.audience === 'team'
      ? teams.map((t) => t.email)
      : [tournament?.contactEmail || env.ADMIN_NOTIFY_EMAIL]
    const mobiles = note.audience === 'team'
      ? teams.map((t) => t.mobile)
      : [tournament?.contactMobile || env.ADMIN_NOTIFY_MOBILE]

    const link = env.APP_URL && tournament ? `\n\n${env.APP_URL}/tournament/${tournament.slug || tournament.id}` : ''
    const subject = `${tournament?.name || 'Tournament'}: ${SUBJECT[note.type] || 'Update'}`
    const text = `${note.message}${link}`

    if (channels.email) {
      for (const to of [...new Set(emails.filter(Boolean))]) await sendMail({ to, subject, text })
    }
    for (const [channel, url] of [['sms', env.SMS_WEBHOOK_URL], ['whatsapp', env.WHATSAPP_WEBHOOK_URL]]) {
      if (!channels[channel] || !url) continue
      for (const to of [...new Set(mobiles.filter(Boolean))]) await post(url, { channel, to, text: `${subject}. ${text}` })
    }
  }
}
