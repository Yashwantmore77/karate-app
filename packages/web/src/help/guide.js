import { TOURNAMENT_STATUS as T } from '@kumite/shared/lifecycle.js'
import { registrationReadiness } from '@kumite/shared/tms.js'

// Everything the ⓘ icons and the step-by-step guide say, in one place, so the
// wording stays consistent and is easy to update as the app grows.
//
// HELP entries: { title, text, tips?: [..], before?: '...', next?: '...' }
//   text   – what this is / does, in plain words
//   tips   – short practical points
//   before – what should already be done
//   next   – what to do after this

const ORDER = Object.values(T)
const reached = (t, status) => ORDER.indexOf(t.lifecycleStatus || T.DRAFT) >= ORDER.indexOf(status)

/**
 * The whole event, start to finish, in the order an organiser does it.
 * `tab` is the tournament screen tab that does the step (null: elsewhere).
 * `done(t, s)` uses the tournament and its dashboard numbers:
 *   true = done, false = still to do, 'skip' = not needed for this event.
 */
export const WORKFLOW = [
  {
    id: 'create', title: 'Create the tournament', tab: null, where: 'Admin → Tournaments → New tournament', who: 'Admin',
    what: 'Give the tournament a name, place, date and type (Kata, Kumite or both). Everything else is filled in on the tournament screen.',
    done: () => true,
  },
  {
    id: 'details', title: 'Fill in details and rules', tab: 'setup', where: 'Settings', who: 'Admin',
    what: 'Venue, dates, the Master Age Calculation Date, registration open/close dates, contact details, tournament type (Kata / Kumite) and competition rules.',
    done: (t) => registrationReadiness(t).length === 0,
  },
  {
    id: 'categories', title: 'Set up categories', tab: 'categories', where: 'Categories', who: 'Admin',
    what: 'Add the age groups (and for Kumite, the weight categories inside each age group). Players are sorted into these later.',
    done: (_t, s) => s.ageGroups > 0,
  },
  {
    id: 'open', title: 'Open registration and share the coach link', tab: 'overview', where: 'Dashboard (status) and Settings → Registration link', who: 'Admin',
    what: 'Move the tournament to "Registration open", then generate the registration link in Settings and send it to coaches.',
    done: (t) => reached(t, T.REGISTRATION_OPEN),
  },
  {
    id: 'approve', title: 'Check and approve registrations', tab: 'registrations', where: 'Registrations', who: 'Registration officer / Admin',
    what: 'Coaches add their players through the link. Check each player (age, documents) and approve or reject them.',
    done: (_t, s) => s.players > 0 && s.pendingVerification === 0,
  },
  {
    id: 'close', title: 'Close registration', tab: 'overview', where: 'Dashboard (status)', who: 'Admin',
    what: 'Move the tournament to "Registration closed" so no new players come in. Registration also stops by itself at the closing date.',
    done: (t) => reached(t, T.REGISTRATION_CLOSED),
  },
  {
    id: 'weighin', title: 'Weigh-in (Kumite)', tab: 'weighin', where: 'Weigh-in', who: 'Weigh-in officer',
    what: 'Record each Kumite player\'s weight. Players outside their weight category can be moved or marked as failed.',
    done: (t, s) => (s.kumitePlayers === 0 ? 'skip' : !!t.weighInClosed || s.pendingWeighIn === 0),
  },
  {
    id: 'lock', title: 'Lock entries', tab: 'overview', where: 'Dashboard → Lock entries (or Draw / Pools step 2)', who: 'Admin',
    what: 'Freezes the player list and categories so the draw can be made. Unlocking later needs a reason.',
    done: (t) => !!t.entriesLocked,
  },
  {
    id: 'draw', title: 'Categorise players and draw pools', tab: 'draw', where: 'Draw / Pools', who: 'Admin',
    what: 'Run categorisation (puts every player in the right category), then draw the pools for each category.',
    done: (_t, s) => s.pools > 0,
  },
  {
    id: 'matches', title: 'Lock the draw and generate matches', tab: 'draw', where: 'Draw / Pools → step 3', who: 'Admin',
    what: 'Lock the draw so pools cannot change, then press "Generate matches" to create every bout.',
    done: (t, s) => !!t.drawLocked && s.matches > 0,
  },
  {
    id: 'assign', title: 'Schedule matches and assign officials', tab: 'matches', where: 'Matches', who: 'Admin',
    what: 'Give each match a mat and time, and choose the referee and judges. Referees and judges then see their matches on their own screens.',
    done: (_t, s) => s.matches > 0 && s.scheduledMatches > 0,
  },
  {
    id: 'kata', title: 'Set up kata rounds', tab: 'kata', where: 'Kata panel', who: 'Admin',
    what: 'For Kata categories: open round 1, seat the judges, and enter or collect the scores.',
    done: (_t, s) => (s.kataPlayers === 0 ? 'skip' : s.kataRounds > 0),
  },
  {
    id: 'passes', title: 'Passes and check-in (optional)', tab: 'checkin', where: 'Check-in & passes', who: 'Admin / door staff',
    what: 'Print accreditation passes with QR codes, then scan them at the door to check people in.',
    optional: true,
    done: (_t, s) => s.passes > 0,
  },
  {
    id: 'live', title: 'Go live', tab: 'overview', where: 'Dashboard (status)', who: 'Admin',
    what: 'Move the tournament to "Live" on competition day. The public page and hall screens follow the matches.',
    done: (t) => reached(t, T.LIVE),
  },
  {
    id: 'score', title: 'Call matches and score them', tab: 'call', where: 'Call matches + the referee console', who: 'Announcer, referees, judges',
    what: 'The announcer calls each bout to its mat. The referee opens the match and scores it on the console; the result is confirmed at the end. A Kata + Kumite tournament runs one event at a time: finish the first session, then switch the mats to the other (top of the page).',
    done: (_t, s) => s.matches > 0 && s.pendingMatches === 0,
  },
  {
    id: 'results', title: 'Check and publish results', tab: 'results', where: 'Results', who: 'Admin',
    what: 'Check the medals for each category, verify them, then publish. Published results show on the public page.',
    done: (t) => !!t.resultsPublished,
  },
  {
    id: 'certificates', title: 'Issue certificates', tab: 'certificates', where: 'Certificates', who: 'Admin',
    what: 'Create medal and participation certificates, then print them or save as PDF. Coaches can also download them.',
    done: (_t, s) => s.certificates > 0,
  },
  {
    id: 'complete', title: 'Complete the tournament', tab: 'overview', where: 'Dashboard (status)', who: 'Admin',
    what: 'Move the tournament to "Completed". Results are locked. Later you can archive it.',
    done: (t) => reached(t, T.COMPLETED),
  },
]

/** Each step with its state for this tournament: 'done' | 'todo' | 'skip'. */
export function workflowState(tournament, stats) {
  const s = stats || {}
  const steps = WORKFLOW.map((step) => {
    let value = false
    try { value = step.done(tournament, s) } catch { value = false }
    return { ...step, state: value === 'skip' ? 'skip' : value ? 'done' : 'todo' }
  })
  // The next thing to do: the first required step still open.
  const next = steps.find((st) => st.state === 'todo' && !st.optional) || null
  const doneCount = steps.filter((st) => st.state === 'done').length
  const total = steps.filter((st) => st.state !== 'skip').length
  return { steps, next, doneCount, total }
}

/**
 * What each tournament tab is for, and what comes before and after it.
 * before / after name another tab (so the guide can offer a "Go" button).
 */
export const TAB_GUIDE = {
  overview: {
    text: 'The home of the tournament: its status, the main locks, the numbers at a glance and notifications. Move the tournament along its stages here (Draft → Registration open → … → Live → Completed).',
    after: null, // the next step depends on how far the event has got
  },
  setup: {
    text: 'Tournament details, competition rules, the coach registration link, the registration form and the partner API.',
    before: { tab: 'overview', text: 'Tournament created' },
    after: { tab: 'categories', text: 'Set up age groups and weight categories' },
  },
  categories: {
    text: 'Age groups, and the weight categories inside them for Kumite. Every player is sorted into these.',
    before: { tab: 'setup', text: 'Details and rules filled in' },
    after: { tab: 'registrations', text: 'Open registration and approve players' },
  },
  registrations: {
    text: 'Teams and players. Coaches add players through the link; here you check them and approve or reject them.',
    before: { tab: 'categories', text: 'Categories set up and registration opened' },
    after: { tab: 'weighin', text: 'Weigh the Kumite players' },
  },
  weighin: {
    text: 'Record the weight of each Kumite player on the day. A player outside their category can be moved to the right one.',
    before: { tab: 'registrations', text: 'Players approved, registration closed' },
    after: { tab: 'draw', text: 'Lock entries and draw the pools' },
  },
  draw: {
    text: 'Three steps in order: 1. put players into categories, 2. lock entries and draw pools, 3. lock the draw and generate matches.',
    before: { tab: 'weighin', text: 'Weigh-in done' },
    after: { tab: 'matches', text: 'Schedule matches and assign officials' },
  },
  matches: {
    text: 'Every bout, by mat. Set the mat and time, assign the referee and judges, and correct a result if needed.',
    before: { tab: 'draw', text: 'Matches generated' },
    after: { tab: 'call', text: 'Call the matches on competition day' },
  },
  bracket: {
    text: 'The draw sheet on screen. Before the first bout, drag players between places to arrange the draw (or give byes), then save. During the event, drag each winner into the next box to record the result; 1st, 2nd and 3rd fill in by themselves.',
    before: { tab: 'draw', text: 'Matches generated (knockout categories)' },
    after: { tab: 'results', text: 'Check and publish results' },
  },
  kata: {
    text: 'Kata rounds per category: open a round, seat the judges, enter scores and choose who goes through.',
    before: { tab: 'draw', text: 'Kata pools drawn' },
    after: { tab: 'results', text: 'Check and publish results' },
  },
  call: {
    text: 'For the announcer: call the next bout to each mat. Players and coaches are told to come to the mat. With Kata and Kumite, only the event on the mats now is listed; switch the session when it is done.',
    before: { tab: 'matches', text: 'Matches scheduled, tournament Live' },
    after: { tab: 'results', text: 'Check and publish results' },
  },
  checkin: {
    text: 'Optional. Print accreditation passes with QR codes, then scan them at the door, weigh-in or mat to check people in.',
    before: { tab: 'registrations', text: 'Players approved' },
    after: { tab: 'call', text: 'Start calling matches' },
  },
  results: {
    text: 'Medals per category. Choose the final stage when needed, verify, publish, and lock. The medal tally is at the bottom.',
    before: { tab: 'call', text: 'Matches scored' },
    after: { tab: 'certificates', text: 'Issue certificates' },
  },
  certificates: {
    text: 'Medal and participation certificates, plus special awards. Print them or save as PDF; each has a QR code to verify it.',
    before: { tab: 'results', text: 'Results published' },
    after: { tab: 'overview', text: 'Mark the tournament Completed' },
  },
  reports: {
    text: 'Download lists and reports (players, teams, results and more) as Excel, CSV or PDF. Can be used at any time.',
  },
  audit: {
    text: 'Every important change: who did it, when, and why. Use it to check what happened. Nothing here can be edited.',
  },
}

/** What each signed-in role does, for the "How it works" guide. */
export const ROLE_GUIDE = {
  admin: [
    'Create a tournament in Tournaments, then open it (eye icon) to reach every step.',
    'The bar under the tabs always shows where you are and what comes next.',
    'Add staff accounts in Accounts and give each the right role.',
  ],
  super_admin: [
    'Everything an admin does, plus Organisations and Rulesets.',
    'Create a tournament in Tournaments, then open it (eye icon) to reach every step.',
  ],
  tournament_owner: [
    'My tournaments lists the events you have been given: open one (eye icon) to run it.',
    'Inside a tournament you can do everything: details, categories, entries, weigh-in, draw, scoring, results, certificates and reports.',
    'You will not see other people\'s tournaments, staff accounts, backups or rulesets. Ask the super admin for those.',
  ],
  registration_officer: [
    'Choose the tournament, then go to Registrations.',
    'Check each player\'s details and documents, then approve or reject.',
  ],
  weighin_officer: [
    'Choose the tournament, then go to Weigh-in.',
    'Type in each Kumite player\'s weight. The app tells you if it fits the category.',
  ],
  referee: [
    'Open Matches, choose the category, then your match.',
    'Press "Open" on the match to start the scoring console. Score, then confirm the result at the end.',
    'If the connection drops, keep scoring: the actions are sent when it is back.',
  ],
  judge: [
    'Kumite: open Matches and choose your bout to score it from your seat.',
    'Kata: open Kata scoring, choose the tournament, and enter your score when the round is open.',
  ],
  announcer: [
    'Choose the tournament, then Call matches.',
    'Call the next bout on each mat; players and coaches get the message.',
  ],
  scoreboard_operator: [
    'Scoreboard control sets what the hall screens show (one screen per mat, or the whole hall).',
    'Open Scoreboard on the display device and add ?mat=N to show one mat.',
  ],
  coach: [
    'Add your team\'s players while registration is open, and your team members (manager, coaches, judges, referees).',
    'Check their status (approved, weigh-in) and download certificates after the event.',
  ],
  viewer: [
    'Read-only: open a tournament to see its progress, or Analytics to compare tournaments.',
  ],
}

export const HELP = {
  // --- tournament screen -------------------------------------------------
  'overview.status': {
    title: 'Tournament status',
    text: 'The stage the tournament is in. Each stage unlocks the next jobs: registration, weigh-in, draw, live scoring, completion.',
    tips: ['Use the → buttons to move forward.', 'Moving back (←) needs a reason and is recorded.'],
  },
  'overview.locks': {
    title: 'Locks',
    text: 'Soft-lock stops coaches changing players while organisers still can. Lock entries freezes players and categories (needed before the draw). Lock draw freezes the pools (needed before generating matches).',
    before: 'Registrations approved and weigh-in done.',
    next: 'Go to Draw / Pools.',
  },
  'overview.stats': {
    title: 'Numbers at a glance',
    text: 'Live counts for this tournament. Orange numbers are jobs still waiting (verification, weigh-in).',
  },
  'overview.next': { title: 'Next matches', text: 'The next bouts still to be fought, in order.' },
  'overview.notifications': { title: 'Notifications', text: 'Messages for organisers: new registrations, results, reminders and system notices.' },

  'setup.details': {
    title: 'Tournament details',
    text: 'The basic facts: name, organiser, venue, dates, contact, and the Master Age Calculation Date (every player\'s age is worked out on this date).',
    tips: ['All starred fields are needed before registration can open.'],
    next: 'Competition rules, then Categories.',
  },
  'setup.rules': {
    title: 'Competition rules',
    text: 'How bouts are run: ruleset, match duration, pool system, kata scoring method and so on. Choose a standard ruleset or set your own values.',
    tips: ['Rules cannot change after the draw is locked.'],
  },
  'setup.link': {
    title: 'Registration link',
    text: 'The private link coaches use to register their players. Generate it, optionally add a password and an expiry date, and share it.',
    tips: ['"Regenerate" makes the old link stop working.'],
    before: 'Tournament moved to "Registration open".',
  },
  'setup.form': {
    title: 'Registration form',
    text: 'The fields coaches fill in for each player. Add your own fields, mark them required, or hide them.',
  },
  'setup.partner': {
    title: 'Partner API',
    text: 'Keys that let another system (for example a federation database) send entries straight into this tournament. Only needed if you use such a system.',
  },

  'categories.age': {
    title: 'Age groups',
    text: 'Age bands such as U-14 or Cadet, worked out on the Master Age Calculation Date. Each player goes into the age group that fits.',
    tips: ['"Load standard categories" adds a complete set in one step (for example SGFI: U-14, U-17 and U-19 with their weight classes). Everything stays editable.', 'Two age groups for the same gender may not share an age unless you switch on "Allow overlap".'],
    next: 'Add weight categories (Kumite).',
  },
  'categories.weight': {
    title: 'Weight categories',
    text: 'Weight bands inside each age group, for Kumite. Players are checked against them at weigh-in.',
    before: 'Age groups added.',
  },

  'registrations.teams': { title: 'Teams', text: 'Clubs or schools taking part. Each player belongs to one team. Coaches create their own team when they register.' },
  'registrations.views': {
    title: 'Lists on this page',
    text: 'Players: everyone registered, with their status. Teams: the clubs taking part. Team members: each team\'s team managers, coaches, judges and referees (one person can hold several roles). Possible duplicates: players who may have been entered twice. Bulk upload: add many players at once from an Excel file.',
  },
  'registrations.approveAll': {
    title: 'Approve all pending',
    text: 'Approves every player who is waiting for a check, in one go. Use it only when you have already checked them.',
  },
  'registrations.players': {
    title: 'Players',
    text: 'Every registered player. Open a player to check details and documents, then approve or reject.',
    tips: ['"Approve all pending" approves every waiting player at once.', 'Only approved players go into the draw.'],
    next: 'Weigh-in, then lock entries.',
  },

  'weighin.record': {
    title: 'Weigh-in',
    text: 'Type each Kumite player\'s weight. The app says whether it fits the category. Close weigh-in when everyone has been weighed.',
    before: 'Players approved.',
    next: 'Lock entries and draw pools.',
  },

  'weighin.reminder': {
    title: 'Send weigh-in reminder',
    text: 'Sends every team a message listing their Kumite players who still need to be weighed.',
  },
  'weighin.close': {
    title: 'Close weigh-in',
    text: 'Stops new weights being recorded. Players not weighed are left out of the draw if it needs verified weights. Reopening needs a reason.',
    next: 'Lock entries and draw the pools.',
  },
  'draw.categorise': {
    title: 'Step 1: Categorise players',
    text: 'Puts every approved player into the right category from their age, gender, event and weight. Run it again after any change to players.',
    before: 'Registrations approved and weigh-in done.',
    next: 'Step 2: lock entries and draw pools.',
  },
  'draw.pools': {
    title: 'Step 2: Lock entries and draw pools',
    text: 'Entries must be locked first. Then draw the pools for each category: players are placed at random, keeping team-mates apart where possible.',
    tips: ['You can move a player between pools with a reason, until the draw is locked.', '"Print draw sheet" prints the paper bracket for the mat table (one sheet per pool, signed by four judges and the referee). "Blank draw sheet" prints an empty one.'],
    next: 'Step 3: lock the draw and generate matches.',
  },
  'draw.matches': {
    title: 'Step 3: Generate matches',
    text: 'Lock the draw (Dashboard or here), then generate the matches. Every bout of every pool is created.',
    next: 'Matches tab: give each match a mat, time and officials.',
  },

  'matches.list': {
    title: 'Matches',
    text: 'All bouts. Use the clock icon to set mat and time, the referee and judges; the pencil to correct a result (needs a reason); the history icon to see every scoring action.',
    before: 'Matches generated in Draw / Pools.',
    next: 'On the day: Call matches, then score on the console.',
  },

  'bracket.board': {
    title: 'Bracket',
    text: 'Pick a category. "Arrange draw": drag a player onto another place to swap them, or onto an empty place for a bye, then Save draw. "Record results": drag the winner into the next box (or tap the bout) and say how it ended.',
    tips: ['On a phone or tablet, tap one place and then another to swap.', 'The draw is fixed once the first bout of the bracket starts.', 'Bouts scored on the referee console show here too.', 'Print gives the paper sheet for the mat table.'],
    before: 'Matches generated for a knockout category, or the final stage generated in Results.',
    next: 'Results: verify and publish the medals.',
  },
  'kata.rounds': {
    title: 'Kata rounds',
    text: 'For each Kata category: open round 1, choose the judges for each seat, enter or collect scores, then finish the round and open the next one.',
    tips: ['Judges can also score from their own device in Kata scoring.'],
    next: 'Results.',
  },

  'call.mats': {
    title: 'Call matches',
    text: 'One card per mat. Press call to tell players and coaches to come to that mat now. The first call is the main one; later calls are reminders.',
    before: 'Tournament Live and matches scheduled.',
    next: 'The referee scores the bout on the console.',
  },
  'call.latest': { title: 'Latest results', text: 'The most recent finished bouts, newest first.' },

  'checkin.scan': {
    title: 'Scan a pass',
    text: 'Point the camera at a pass QR code (or type the code). The person is checked in and their details are shown.',
  },
  'checkin.scans': { title: 'Scans', text: 'Who has been checked in on this device, newest first.' },
  'checkin.passes': {
    title: 'Accreditation passes',
    text: 'Create passes for players, coaches and officials, then download them as a PDF to print. Each pass has a QR code for check-in.',
    before: 'Players approved.',
  },

  'results.publish': {
    title: 'Publish results',
    text: 'Makes the medal list visible on the public page and to coaches. You can unpublish if something is wrong.',
    before: 'Every category verified.',
    next: 'Certificates.',
  },
  'results.category': {
    title: 'Category results',
    text: 'Medals for one category, worked out from the bouts. Verify when correct, publish, and lock to stop further changes. Override medals only with a reason.',
  },
  'results.tally': { title: 'Medal tally', text: 'Gold, silver and bronze per team across the whole tournament.' },

  'certificates.issue': {
    title: 'Issue certificates',
    text: 'Creates certificates for medal winners and participants. Existing ones are kept. Add special awards (best fighter, etc.) by hand.',
    before: 'Results published.',
    next: 'Print / save as PDF, then mark the tournament Completed.',
  },

  'reports.list': { title: 'Reports', text: 'Each report can be filtered and downloaded as Excel, CSV or PDF. Every download is recorded in the audit log.' },
  'audit.list': { title: 'Audit log', text: 'A permanent record of every important change: who, when, what changed and why.' },

  // --- admin -------------------------------------------------------------
  'admin.tournaments': {
    title: 'Tournaments',
    text: 'All tournaments you can manage. Create a new one here (name, place, date and type), then open it with the eye icon to run it step by step.',
    next: 'Open the tournament → Settings.',
  },
  'admin.tournamentDetail': {
    title: 'Tournament page',
    text: 'A quick view of one tournament and its categories. Press "Manage" for the full tournament screen with every step.',
  },
  'admin.category': { title: 'Category', text: 'One category\'s players, pools and matches.' },
  'admin.dashboard': { title: 'Dashboard', text: 'Totals across every tournament: players, matches and what is live right now.' },
  'admin.accounts': {
    title: 'Accounts',
    text: 'Staff sign-ins. Create an account for each person and give them a role (referee, judge, registration officer…). A role can also be set for one tournament only.',
  },
  'admin.signins': { title: 'Sign-ins', text: 'Every sign-in attempt, successful or not, for security checks.' },
  'admin.system': { title: 'System', text: 'Backups, health and system-wide settings.' },
  'admin.backup': { title: 'Backup', text: 'Download a copy of all the data, to keep safe or to restore later.' },
  'admin.systemAudit': { title: 'Audit trail', text: 'Changes made outside any one tournament: accounts, organisations, rulesets and settings.' },
  'admin.rulesets': {
    title: 'Rulesets',
    text: 'Standard and custom rule sets (match duration, scoring, pool system…). Editing creates a new version; tournaments keep the version they started with. Standard rulesets can be restored.',
  },
  'admin.organizations': { title: 'Organisations', text: 'Federations or associations. Each has its own tournaments and staff.' },
  'analytics': { title: 'Analytics', text: 'Compare tournaments: entries, teams, medals and trends over time.' },

  // --- staff -------------------------------------------------------------
  'referee.categories': {
    title: 'Choose a category',
    text: 'Pick the category, then the match you are officiating.',
    next: 'Open the match to start the scoring console.',
  },
  'referee.matches': {
    title: 'Matches',
    text: 'The bouts in this category. Open one to start scoring; finished bouts show their result. Standings and the draw are in the other views.',
  },
  'console': {
    title: 'Scoring console',
    text: 'Score the bout: points, penalties, Senshu, the clock. Undo reverses the last action. At the end, confirm the result to save it.',
    tips: ['If the connection drops, keep scoring — actions are sent when it returns.', 'Only one device controls a mat at a time; others can take over.', 'Mat decides which screens show this bout: that mat\'s screen, "Mat N" on the hall screen, and the live board. It starts on the mat the bout is scheduled on.'],
  },
  'judge.matches': { title: 'Your matches', text: 'The Kumite bouts you judge. Open one to score from your seat.' },
  'judge.kata': { title: 'Kata scoring', text: 'When a round is open, enter your score for each performer. Your score is locked once sent.' },
  'scoreboard.operator': {
    title: 'Scoreboard control',
    text: 'Sets the message and what the hall screens show. Choose a mat to control that mat\'s screen, or leave it empty for the whole hall.',
  },
  'scoreboard.now': { title: 'On the scoreboard now', text: 'What the hall screen is showing at this moment.' },
  'scoreboard.screens': { title: 'Screens', text: 'Links to open on each display: the whole hall, or one screen per mat.' },
  'referee.standings': { title: 'Standings', text: 'Wins, points and ranking of each player in this category, updated after every bout.' },
  'tournament.select': { title: 'Choose a tournament', text: 'The tournaments you work on. Pick one to start.' },

  // --- coach portal ------------------------------------------------------
  'coach.register': {
    title: 'Register your team',
    text: 'First create your team (club name, coach, contact). Then add each player. Read the tournament rules and accept the terms before you send.',
    next: 'Add players, then wait for the organiser to approve them.',
  },
  'coach.portal': {
    title: 'Team registration',
    text: 'Register your team and add players while registration is open. Under Team members, list your team managers, coaches and any judges or referees you bring; tick every role a person holds. Check each player\'s status, and download certificates after the event.',
  },
}
