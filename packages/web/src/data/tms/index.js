import * as api from './api'

/**
 * Tournament management (the PRD), over the API. The rules themselves live in
 * @kumite/shared/tms.js and run on the server.
 */
export const { tms } = api

/** A refusal from the service or the API, as something a person can read. */
export function describeError(err) {
  const code = err?.code || err?.message || 'error'
  const details = err?.details
  if (details?.errors?.length) return details.errors.map((e) => (e.row ? `Row ${e.row}: ${e.message}` : e.message)).join('; ')
  return ERROR_TEXT[code] || code.replace(/_/g, ' ')
}
const ERROR_TEXT = {
  entries_locked: 'Entries are locked. Unlock entries (with a reason) to change this.',
  entries_not_locked: 'Lock entries before generating pools.',
  draw_locked: 'The draw is locked. Unlock it (with a reason) to change pools.',
  draw_not_locked: 'Confirm (lock) the draw before generating matches.',
  registration_closed: 'Registration is not open for this tournament.',
  reason_required: 'A reason is required for this action.',
  rejection_reason_required: 'Give a reason for the rejection.',
  correction_reason_required: 'Changing a completed result needs a reason (Rule 6).',
  master_age_date_required: 'Set the Master Age Calculation Date first.',
  invalid_transition: 'That status change is not allowed from the current status.',
  duplicate_player: 'This player (same name and DOB) is already registered.',
  matches_already_played: 'Matches in this division have results; the draw can no longer change.',
  pools_incomplete: 'Every pool match must be finished first.',
  single_pool_no_bracket: 'A single pool is decided by its standings; no bracket is needed.',
  results_not_published: 'Publish the results first.',
  invalid_password: 'Wrong password.',
  link_disabled: 'This registration link has been disabled.',
  link_expired: 'This registration link has expired.',
  link_not_found: 'This registration link does not exist.',
  not_your_team: 'That player belongs to another team.',
  team_exists: 'A team with that name is already registered.',
  team_already_registered: 'Your team is already registered.',
  no_pools: 'Generate pools first.',
  forbidden: 'You do not have permission to do that.',
  schedule_conflict: 'Someone on this bout is already booked at that time.',
  referee_also_judge: 'The referee cannot also sit on the judging panel.',
  too_many_judges: 'More judges than this tournament seats on a panel.',
  invalid_judgeIds: 'Only judge accounts can sit on the panel.',
  invalid_refereeId: 'Only a referee (or admin) can referee a bout.',
  tournament_forbidden: 'Your account is not assigned to this tournament.',
  match_finished: 'This bout is already decided.',
  match_in_progress: 'This bout has started; corners can no longer be swapped.',
  round_open: 'Finish the current round first.',
  final_done: 'The final has been completed.',
  round_closed: 'This round is closed.',
  scores_missing: 'Every judge must score every performer first.',
  invalid_score: 'A kata score is 5.0 to 10.0, in steps of 0.1.',
  invalid_seat: 'Your account has no judge seat on this panel. Ask the admin to set one.',
  division_not_found: 'That category no longer exists.',
  organization_forbidden: 'That account belongs to another organisation.',
  organization_in_use: 'This organisation still has tournaments or accounts.',
  slug_taken: 'That short name is already used.',
  role_forbidden: 'Only a super admin can create that role.',
  terms_not_accepted: 'Accept the terms and conditions to register.',
}
