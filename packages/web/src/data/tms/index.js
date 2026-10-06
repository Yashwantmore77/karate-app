import { serverUrl } from '../session'
import * as local from './local'
import * as api from './api'

/**
 * Tournament management (the PRD), from whichever side is configured — chosen
 * exactly like the competition data in ../domain: the API when VITE_SERVER_URL
 * is set, this browser's storage otherwise. Both run the same shared rules.
 */
const impl = serverUrl() ? api : local

export const { tms, setActor } = impl
export const isRemote = impl === api

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
}
