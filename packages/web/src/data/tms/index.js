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
  // A refused schedule names who (or which mat) is already busy, and where.
  if (code === 'schedule_conflict' && details?.clashes?.length) {
    const who = details.clashes.map((c) => (c.role === 'mat' ? `mat ${c.mat} is taken` : c.otherEvent ? `the player has a bout in their other event${c.mat ? ` (mat ${c.mat})` : ''}` : `the ${c.role || 'person'} is already on another bout${c.mat ? ` (mat ${c.mat})` : ''}`))
    return `Time clash: ${[...new Set(who)].join('; ')}${details.clashes[0]?.scheduledAt ? ` at ${new Date(details.clashes[0].scheduledAt).toLocaleString()}` : ''}. Pick another time or mat.`
  }
  if (code === 'overlapping_age_group' && details?.with) return details.preset
    ? `${details.preset} overlaps your age group "${details.with}". Delete or change "${details.with}" first, then load the set.`
    : `These ages overlap the age group "${details.with}" for the same gender. Change the ages, or switch on "Allow overlap" if that is intended.`
  if (code === 'overlapping_weight_category' && details?.with) return `These weights overlap "${details.with}" in the same age group. Change the weights, or switch on "Allow overlap" if that is intended.`
  if (code === 'type_has_entries' && details?.events?.length) return `${details.players} player${details.players === 1 ? ' has' : 's have'} entered ${details.events.map((e) => (e === 'kata' ? 'Kata' : 'Kumite')).join(' and ')}, which this type would drop. Keep Kata + Kumite, or change those entries first.`
  if (typeof details?.matches === 'number' && COUNTED[code]) return COUNTED[code](details.matches)
  if (typeof details?.players === 'number' && COUNTED[code]) return COUNTED[code](details.players)
  // PRD v1 §6: what is still missing before registration can open, or what is wrong.
  const listed = details?.missing || details?.problems
  if (Array.isArray(listed) && listed.length) return `${ERROR_TEXT[code] || code.replace(/_/g, ' ')}: ${listed.map((m) => m.message || m.field || m).join(', ')}`
  return ERROR_TEXT[code] || code.replace(/_/g, ' ')
}
// Messages that carry a number the server sent with the refusal.
const COUNTED = {
  official_assigned: (n) => `This official is still on ${n} unfinished bout${n === 1 ? '' : 's'}. Put someone else on ${n === 1 ? 'it' : 'them'} first (Matches tab).`,
  category_has_results: (n) => `${n} bout${n === 1 ? ' has' : 's have'} results in this category, so it cannot be deleted.`,
  competitor_has_results: (n) => `This competitor has ${n} bout${n === 1 ? '' : 's'} with results, so they cannot be removed.`,
  team_has_players: (n) => `This team has ${n} player${n === 1 ? '' : 's'}. Remove the players first, or ask the organiser.`,
  reason_required: (n) => `This team has ${n} player${n === 1 ? '' : 's'}, who will be deleted too. Give a reason.`,
}

const ERROR_TEXT = {
  overlapping_age_group: 'This age group overlaps another one for the same gender.',
  overlapping_weight_category: 'This weight class overlaps another one in the same age group.',
  unknown_preset: 'That category set is not available.',
  tournament_not_open: 'The organiser has not opened registration yet.',
  member_exists: 'Someone with that name is already listed for this team.',
  invalid_roles: 'Pick at least one role: Team Manager, Coach, Judge or Referee.',
  bracket_started: 'The first bout of this bracket has started, so the draw can no longer be rearranged.',
  empty_bout: 'Every first-round bout needs at least one player. Move a player into the empty bout.',
  invalid_layout: 'Every player must be placed exactly once.',
  bracket_not_found: 'This category has no bracket yet.',
  type_has_entries: 'Players have already entered an event this type would drop. Move or remove those entries first, or keep Kata + Kumite.',
  managed_by_draw: 'This category is run by the tournament draw. Change it from the tournament screen (Draw / Pools), not here.',
  tournament_archived: 'This tournament is archived and read-only.',
  tournament_completed: 'This tournament is completed. Nothing new can be added to it.',
  tournament_closed: 'This tournament is completed or archived, so no more scoring is accepted.',
  tournament_live: 'This tournament is live. Complete it before deleting it.',
  category_has_results: 'Bouts in this category have results, so it cannot be deleted.',
  competitor_has_results: 'This competitor has bouts with results, so they cannot be removed.',
  official_assigned: 'This official is still on unfinished bouts. Put someone else on them first.',
  cannot_change_own_role: 'You cannot change your own role. Ask another administrator.',
  team_has_players: 'This team still has players. Remove them first.',
  invalid_email: 'Enter a valid email address.',
  invalid_mobile: 'Enter a valid mobile number (digits, spaces or dashes, optionally starting with +).',
  score_correction_forbidden: 'Only someone with the score-correction privilege can change or remove a finished bout.',
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
  // PRD v1
  already_in_pool: 'That player is already in this pool.',
  attendance_disabled: 'Attendance is switched off for this tournament (Settings).',
  bracket_exists: 'The final stage has already been generated.',
  builtin_ruleset: 'A standard ruleset cannot be switched off. Edit it, or restore it as shipped.',
  bulk_has_errors: 'The file has errors. Fix them and upload again; nothing was imported.',
  byes_not_allowed: 'This bracket would need byes, which are switched off in Settings.',
  certificate_not_found: 'No certificate with this ID was issued.',
  certificates_not_public: 'Certificates are not published for this tournament.',
  different_division: 'Players can only move between pools of the same category.',
  email_taken: 'An account with that email already exists.',
  finish_reason_required: 'Give a finish reason for a walkover, no-show, kiken, disqualification or override.',
  invalid_credentials: 'Wrong email or password.',
  invalid_two_factor: 'That code did not match.',
  two_factor_required: 'Enter the code from your authenticator app.',
  judge_on_two_seats: 'One judge cannot sit in two seats.',
  master_date_change_needs_confirmation: 'Changing the Master Age Date re-ages players. Review the preview and confirm.',
  matches_not_generated: 'Generate matches first.',
  not_a_kumite_player: 'Only kumite players are weighed in.',
  not_age_eligible: 'This player’s age does not fit any age group.',
  not_assigned_to_round: 'You are not assigned to a seat on this kata round.',
  not_enough_competitors: 'At least two players are needed.',
  not_enough_qualifiers: 'Not enough qualifiers for a final stage.',
  not_single_entry: 'This category has more than one player.',
  player_in_pool: 'The player is already drawn into a pool; unlock the draw to change their category.',
  player_withdrawn: 'This player has withdrawn.',
  pool_full: 'That pool is full.',
  possible_duplicate: 'This looks like a player already registered (same name and date of birth).',
  qualifiers_not_set: 'Choose the qualifiers of every pool first.',
  regenerate_forbidden: 'Redrawing needs the draw-regeneration privilege.',
  regeneration_requires_confirmation: 'Redrawing replaces existing pools and unplayed matches. Confirm to continue.',
  reopen_forbidden: 'Only an administrator with the reopen privilege can move the tournament back.',
  result_override_forbidden: 'Overriding a result needs the result-override privilege.',
  results_locked: 'Results are locked. Move the tournament back to Live (with a reason) to change them.',
  results_not_decided: 'This category has no decided result yet.',
  results_published: 'These results are published; corrections need the result-override privilege.',
  round_not_pending: 'This round has already started.',
  round_not_started: 'The round has not started yet. The admin starts it once judges are assigned.',
  round_still_open: 'Finish the current round first.',
  ruleset_inactive: 'That ruleset is switched off.',
  ruleset_superseded: 'A newer version of this ruleset exists; edit that one, or restore the standard first.',
  score_correction_forbidden: 'Correcting a decided bout needs the score-correction privilege.',
  seat_already_scored: 'That seat has already scored; its judge cannot be changed.',
  seeding_disabled: 'Seeded draws are switched off in Settings.',
  session_revoked: 'This session was signed out. Sign in again.',
  team_inactive: 'This team is inactive and cannot add players.',
  team_required: 'Register your team first.',
  tournament_archived: 'This tournament is archived and read-only.',
  tournament_incomplete: 'Fill in the required tournament details first (Settings).',
  tournament_not_found: 'Tournament not found.',
  weighin_closed: 'Weigh-in is closed. An override needs the privilege and a reason in Notes.',
  invalid_api_key: 'That API key is not valid.',
  invalid_tournament: 'Some tournament details are not valid.',
  too_many_for_round_robin: 'Too many players for one round robin.',
}
