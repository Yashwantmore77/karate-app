// PRD section 3: who may do what. One table, read by the API's guards and the
// web's menus, so a button is never shown for an action the server refuses.

export const ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin', // Tournament Admin
  REGISTRATION_OFFICER: 'registration_officer',
  WEIGHIN_OFFICER: 'weighin_officer',
  REFEREE: 'referee',
  JUDGE: 'judge', // Kata Judge
  COACH: 'coach',
  ANNOUNCER: 'announcer',
  VIEWER: 'viewer',
  PUBLIC: 'public',
}

export const ROLE_LABEL = {
  super_admin: 'Super Admin',
  admin: 'Tournament Admin',
  registration_officer: 'Registration Officer',
  weighin_officer: 'Weigh-in Officer',
  referee: 'Referee',
  judge: 'Kata Judge',
  coach: 'Coach / Team Manager',
  announcer: 'Announcer',
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
}

const P = PERMISSION
const ALL = Object.values(P)

const TOURNAMENT_ADMIN = ALL.filter((p) => p !== P.USER_MANAGE)

export const ROLE_PERMISSIONS = {
  super_admin: ALL,
  // Kept at full access: `admin` is the account the app has always shipped
  // with and every existing screen assumes it can do everything.
  admin: ALL,
  registration_officer: [P.REGISTRATION_VIEW, P.REGISTRATION_MANAGE, P.PLAYER_EDIT, P.PUBLIC_VIEW],
  weighin_officer: [P.REGISTRATION_VIEW, P.WEIGHIN_RECORD, P.PUBLIC_VIEW],
  referee: [P.MATCH_SCORE, P.PUBLIC_VIEW],
  judge: [P.KATA_SCORE, P.PUBLIC_VIEW],
  coach: [P.TEAM_REGISTER, P.PUBLIC_VIEW],
  // Calls the next bouts to their mats and reads out results.
  announcer: [P.MATCH_CALL, P.PUBLIC_VIEW],
  // Sees the tournament's lists and reports, changes nothing.
  viewer: [P.REGISTRATION_VIEW, P.REPORT_EXPORT, P.PUBLIC_VIEW],
  public: [P.PUBLIC_VIEW],
}

export const TOURNAMENT_ADMIN_PERMISSIONS = TOURNAMENT_ADMIN

export const can = (role, permission) => !!ROLE_PERMISSIONS[role]?.includes(permission)
