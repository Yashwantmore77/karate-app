// PRD section 3: who may do what. One table, read by the API's guards and the
// web's menus, so a button is never shown for an action the server refuses.

export const ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin', // Tournament Admin
  // Runs the tournaments handed to it and nothing else: everything inside an
  // assigned event, no sight of any other event and no system-wide screen.
  TOURNAMENT_OWNER: 'tournament_owner',
  REGISTRATION_OFFICER: 'registration_officer',
  WEIGHIN_OFFICER: 'weighin_officer',
  REFEREE: 'referee',
  JUDGE: 'judge', // Kata Judge
  COACH: 'coach',
  ANNOUNCER: 'announcer',
  SCOREBOARD_OPERATOR: 'scoreboard_operator',
  VIEWER: 'viewer',
  PUBLIC: 'public',
}

export const ROLE_LABEL = {
  super_admin: 'Super Admin',
  // Super Admin and Admin hold the same permissions; the difference is scope,
  // not power (a super admin works across organisations).
  admin: 'Admin',
  // The role key is historical. What it means to the people using it is an
  // administrator whose reach is the tournaments they were given.
  tournament_owner: 'Tournament Admin',
  registration_officer: 'Registration Officer',
  weighin_officer: 'Weigh-in Officer',
  referee: 'Referee',
  judge: 'Kata Judge',
  coach: 'Coach / Team Manager',
  announcer: 'Announcer',
  scoreboard_operator: 'Scoreboard Operator',
  viewer: 'Viewer (read-only)',
  public: 'Public Viewer',
}

export const PERMISSION = {
  TOURNAMENT_MANAGE: 'tournament.manage',
  CATEGORY_CONFIGURE: 'category.configure',
  REGISTRATION_VIEW: 'registration.view',
  REGISTRATION_MANAGE: 'registration.manage',
  PLAYER_EDIT: 'player.edit',
  TEAM_REGISTER: 'team.register',
  WEIGHIN_RECORD: 'weighin.record',
  POOL_MANAGE: 'pool.manage',
  MATCH_GENERATE: 'match.generate',
  MATCH_SCORE: 'match.score',
  MATCH_CALL: 'match.call',
  KATA_SCORE: 'kata.score',
  RESULT_MANAGE: 'result.manage',
  RESULT_PUBLISH: 'result.publish',
  CERTIFICATE_GENERATE: 'certificate.generate',
  REPORT_EXPORT: 'report.export',
  AUDIT_VIEW: 'audit.view',
  USER_MANAGE: 'user.manage',
  PUBLIC_VIEW: 'public.view',
  // PRD v1 §4: the scoreboard operator runs the hall screens, nothing else.
  DISPLAY_CONTROL: 'display.control',
  ATTENDANCE_MARK: 'attendance.mark',
  // PRD v1 §4 "sensitive permissions require explicit privileges".
  RESULT_OVERRIDE: 'result.override',
  DRAW_REGENERATE: 'draw.regenerate',
  SCORE_CORRECT: 'score.correct',
  RECORD_DELETE: 'record.delete',
  TOURNAMENT_REOPEN: 'tournament.reopen',
  WEIGHIN_OVERRIDE: 'weighin.override',
  CATEGORY_OVERRIDE: 'category.override',
  RULESET_MANAGE: 'ruleset.manage',
  BACKUP_MANAGE: 'backup.manage',
}

const P = PERMISSION
const ALL = Object.values(P)

const TOURNAMENT_ADMIN = ALL.filter((p) => p !== P.USER_MANAGE)

export const ROLE_PERMISSIONS = {
  super_admin: ALL,
  // Full system access, backups and rulesets included. An installation's first
  // account is an administrator and may be its only one, so anything an
  // administrator could not do would be out of reach altogether. A super admin
  // is not a wider set of powers, only a wider scope: it works across
  // organisations, where an administrator works inside its own.
  admin: ALL,
  // Everything an admin does inside a tournament, on the tournaments it was
  // given. Accounts, backups and rulesets are system-wide and are not its
  // business; which tournaments it reaches is decided by the assignment, not
  // by this table (see mayAccessTournament).
  tournament_owner: ALL.filter((p) => ![P.USER_MANAGE, P.BACKUP_MANAGE, P.RULESET_MANAGE].includes(p)),
  registration_officer: [P.REGISTRATION_VIEW, P.REGISTRATION_MANAGE, P.PLAYER_EDIT, P.PUBLIC_VIEW],
  weighin_officer: [P.REGISTRATION_VIEW, P.WEIGHIN_RECORD, P.PUBLIC_VIEW],
  referee: [P.MATCH_SCORE, P.PUBLIC_VIEW],
  judge: [P.KATA_SCORE, P.PUBLIC_VIEW],
  coach: [P.TEAM_REGISTER, P.PUBLIC_VIEW],
  // Calls the next bouts to their mats and reads out results.
  announcer: [P.MATCH_CALL, P.ATTENDANCE_MARK, P.PUBLIC_VIEW],
  scoreboard_operator: [P.DISPLAY_CONTROL, P.PUBLIC_VIEW],
  // Sees the tournament's lists and reports, changes nothing.
  viewer: [P.REGISTRATION_VIEW, P.REPORT_EXPORT, P.PUBLIC_VIEW],
  public: [P.PUBLIC_VIEW],
}

export const TOURNAMENT_ADMIN_PERMISSIONS = TOURNAMENT_ADMIN

export const can = (role, permission) => !!ROLE_PERMISSIONS[role]?.includes(permission)

/**
 * Roles whose reach is the list of tournaments they were given, and nothing
 * more. Every other role treats an empty list as "no limit", which is how the
 * app has always behaved; an owner with no tournaments reaches none.
 */
export const ASSIGNED_ONLY_ROLES = [ROLE.TOURNAMENT_OWNER]

export const reachesOnlyAssigned = (role) => ASSIGNED_ONLY_ROLES.includes(role)

/**
 * Who may do an administrator's work inside a tournament. Whether that
 * tournament is theirs is a separate question, answered by
 * mayAccessTournament; this only says the role is allowed the action.
 */
export const actsAsTournamentAdmin = (role) =>
  [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.TOURNAMENT_OWNER].includes(role)

/** Roles an account can hold. Coaches and the public are not accounts. */
export const ACCOUNT_ROLES = Object.values(ROLE).filter((r) => !['coach', 'public'].includes(r))

/**
 * PRD v1 §4: "A user may be an administrator in one tournament and a referee
 * or coach in another." An account's role inside one tournament, falling back
 * to its own role everywhere else.
 */
export const roleIn = (account, tournamentId) =>
  (tournamentId && account?.tournamentRoles?.[tournamentId]) || account?.role || null
