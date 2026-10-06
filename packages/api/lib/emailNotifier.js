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
 * PRD section 47's email channel: the in-app notification, mailed to the
 * people it is for. Team notices go to the team's email (one team, or every
 * team for a tournament-wide notice); admin notices to the tournament's
 * contact email, or ADMIN_NOTIFY_EMAIL.
 */
export function emailNotifier(stores) {
  return async (note, tournament) => {
    let recipients = []
    if (note.audience === 'team') {
      const teams = note.teamId
        ? [await stores.teams.get(note.teamId)]
        : await stores.teams.list({ tournamentId: note.tournamentId })
      recipients = teams.map((t) => t?.email).filter(Boolean)
    } else {
      recipients = [tournament?.contactEmail || process.env.ADMIN_NOTIFY_EMAIL].filter(Boolean)
    }
    const link = process.env.APP_URL && tournament ? `\n\n${process.env.APP_URL}/tournament/${tournament.slug || tournament.id}` : ''
    const subject = `${tournament?.name || 'Tournament'}: ${SUBJECT[note.type] || 'Update'}`
    for (const to of [...new Set(recipients)]) {
      await sendMail({ to, subject, text: `${note.message}${link}` })
    }
  }
}
