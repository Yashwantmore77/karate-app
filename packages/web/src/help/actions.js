// What every button does, in plain words: the hover tooltip on each action
// (components/help/ActionTips.jsx). Keyed by the label the button shows — its
// text, or its aria-label for an icon button. `needs` is shown when the button
// is disabled: what has to happen first.
//
// A button whose label is built at run time (names, counts) is matched by the
// patterns below, or carries its own `data-tip` where it is drawn. The test
// in actions.test.js fails when a button has neither.

/** @type {Record<string, string | { tip: string, needs?: string }>} */
export const ACTIONS = {
  // --- everywhere ---------------------------------------------------------------
  Back: 'Goes back to the previous screen.',
  Cancel: 'Closes this without saving anything.',
  Close: 'Closes this window.',
  Save: 'Saves your changes.',
  'Save Changes': 'Saves your changes.',
  'Saving…': 'Saving your changes; wait a moment.',
  Apply: 'Applies what you chose here.',
  Clear: 'Clears what you chose, back to the start.',
  'Clear search': 'Empties the search box and shows everything again.',
  Edit: 'Opens this to change it.',
  Delete: { tip: 'Deletes this. You are asked to confirm first.', needs: 'It cannot be deleted at this stage (for example after entries are locked).' },
  Remove: 'Removes this.',
  View: 'Opens this to look at it.',
  Download: 'Downloads the file.',
  'Download PDF': 'Downloads a PDF you can print.',
  Refresh: 'Loads the latest information.',
  Continue: 'Goes on to the next step.',
  Submit: 'Sends what you entered.',
  Confirm: 'Goes ahead with the action you chose.',
  Show: 'Shows this.',
  'Show help': 'Shows the help for this page again. Problems that need attention are always shown.',
  'Hide help': 'Hides the help for this page. Problems that need attention stay visible.',
  'Full guide': 'Every step of the tournament in order, with a tick for what is done and what is next.',
  Guide: 'The step-by-step guide: what to do, in what order, and who does it.',
  'Open menu': 'Opens the menu of pages.',
  'Install app': 'Installs this app on the device: it opens full screen and keeps working without a connection.',
  'Sign out': 'Signs you out on this device.',
  'Sign in': 'Signs you in.',
  'Officials sign in': 'Sign-in for staff: organisers, referees, judges and officers.',
  'Staff sign-in': 'Sign-in for staff: organisers, referees, judges and officers.',
  'Go to next page': 'Shows the next page of the list.',
  'Go to previous page': 'Shows the previous page of the list.',
  'Go to first page': 'Shows the first page of the list.',
  'Go to last page': 'Shows the last page of the list.',

  // --- exports and printing ------------------------------------------------------
  Export: 'Downloads this list as Excel, CSV or a printable PDF.',
  'Exporting…': 'Preparing the file; wait a moment.',
  'Excel (.xlsx)': 'Downloads this list as an Excel file.',
  Excel: 'Downloads this as an Excel file.',
  CSV: 'Downloads this as a CSV file (opens in Excel too).',
  'PDF (print)': 'Opens this list ready to print or save as PDF.',
  PDF: 'Opens this as a PDF to print or keep.',
  'Export CSV': 'Downloads this list as a CSV file.',
  'Export Results': 'Downloads the results as a file.',
  Print: 'Prints this (or saves it as PDF from the print window).',
  'Print / save as PDF': 'Opens the print view; choose "Save as PDF" there to keep a file.',
  'Print / Save as PDF': 'Opens the print window; choose "Save as PDF" there to keep a file.',
  'Print draw sheet': 'Prints this category\'s draw sheet, in the association\'s format.',
  'Print bracket sheet': 'Prints this category\'s bracket sheet.',
  'Blank draw sheet': 'Prints an empty draw sheet to fill in by hand.',

  // --- tournaments and dashboard ----------------------------------------------------
  'New Tournament': 'Creates a new tournament. Fill in the rest on its Settings tab.',
  'Create Tournament': 'Creates the tournament. Fill in the rest on its Settings tab.',
  'Update Tournament': 'Saves the tournament\'s changes.',
  Manage: 'Opens this tournament to manage it.',
  Matches: 'Opens the bouts.',
  Results: 'Opens the results.',
  'Mark all read': 'Marks every message as read.',
  'Lock entries': { tip: 'Freezes the player list and their categories so the draw can be made. Coaches can no longer change entries. Unlocking later needs a reason.', needs: 'This is not possible at the tournament\'s current stage.' },
  'Unlock entries': { tip: 'Lets players and categories change again. You are asked for a reason (kept in the audit log).', needs: 'Unlock the draw first.' },
  'Lock draw': { tip: 'Confirms the pools so nobody can change them; then the bouts can be generated.', needs: 'Lock entries and draw the pools first.' },
  'Unlock draw': { tip: 'Lets the pools change again. You are asked for a reason.', needs: 'Not possible once bouts have results.' },
  'Soft-lock coach entries': 'Stops coaches adding or changing players. Organisers can still make changes.',
  'Reopen coach entries': 'Lets coaches add and change players again.',

  // --- settings ---------------------------------------------------------------------
  'Save details': 'Saves the tournament\'s details (dates, venue, contacts, rules).',
  'Upload logo': 'Uploads the tournament logo (PNG or JPEG, up to 2 MB) for the public page and certificates.',
  'Save rules': 'Saves these competition rules.',
  'Generate link': 'Creates the registration link to send to coaches.',
  'Copy link': 'Copies the registration link, ready to paste into a message to coaches.',
  'Set password': 'Puts a password on the registration link; coaches need it to register.',
  'Remove password': 'Takes the password off the link: anyone with the link can register.',
  'Save expiry': 'Saves the date the registration link stops working.',
  'Regenerate link': 'Replaces the link with a new one. The old link stops working, so coaches need the new one.',
  'Add field': 'Adds a question to the coaches\' registration form.',
  'Save form': 'Saves the registration form coaches fill in.',
  'Move up': 'Moves this field up the form.',
  'Move down': 'Moves this field down the form.',
  'Remove field': 'Removes this field from the registration form.',
  'Issue key': 'Creates a key so a partner system can send entries straight in.',
  'Replace key': 'Replaces the partner key; the old one stops working.',
  Revoke: 'Switches the partner key off.',

  // --- categories -------------------------------------------------------------------
  'Load standard categories': 'Adds a standard set of age groups and weight classes (for example SGFI) in one step.',
  'Load age groups': 'Loads the chosen standard set of age groups (and their weight classes).',
  'Add age group': { tip: 'Adds an age group (for example Boys 12-13). Players are placed by gender and age on the Master Age Calculation Date.', needs: 'Categories are frozen while entries are locked.' },
  'Add weight category': { tip: 'Adds a kumite weight class to an age group: "-40 KG" means up to 40 kg, "+40 KG" means above 40 kg.', needs: 'Add an age group first; categories are frozen while entries are locked.' },
  'Category rules': 'Rules for this category only (pool size, bout time, kata rounds). Anything not set follows the tournament.',
  'Clear all': 'Removes this category\'s own rules, so it follows the tournament\'s rules again.',

  // --- registrations ----------------------------------------------------------------
  'Add player': { tip: 'Registers a new player for this tournament.', needs: 'Entries are locked.' },
  'Add team': 'Adds a team (club or dojo) to this tournament.',
  'Edit team': 'Changes the team\'s details.',
  'Delete team': 'Deletes the team. A team that still has players needs a reason.',
  'Add team member': 'Adds a team manager, coach, judge or referee to the team.',
  'Approve all pending': 'Approves every registration that is waiting, in one go.',
  Approve: 'Approves this registration: the player can be put in a category and drawn.',
  Reject: 'Rejects this registration. You are asked for the reason, which the coach sees.',
  'Request correction': 'Sends the registration back to the coach to correct, with your note.',
  'Change category': 'Chooses this player\'s category by hand. The reason is kept in the audit log.',
  'Fix category': 'Chooses this player\'s category by hand, so the draw does not leave them out. The reason is kept in the audit log.',
  'Withdraw (injury, no-show)': 'Withdraws the player (for example injured). Bouts they still have are given to their opponents.',
  Payment: 'Records this player\'s payment.',
  'Delete the duplicate': 'Deletes this player, who is a duplicate of someone already registered.',
  Players: 'Shows the players.',
  Teams: 'Shows the teams.',
  'Team members': 'Shows the team managers, coaches, judges and referees.',
  'Possible duplicates': 'Players who look like someone already registered (same name and date of birth).',
  'Bulk upload': 'Adds many players at once from an Excel or CSV file.',
  'Excel template': 'Downloads an empty Excel file with the right columns to fill in.',
  'CSV template': 'Downloads an empty CSV file with the right columns to fill in.',
  'Choose Excel or CSV file': 'Picks the file with the players to import. You see a preview before anything is saved.',
  'Confirm import': 'Imports the checked rows above as new players.',
  'Error report (Excel)': 'Downloads the rows that have problems, to fix and upload again.',
  'Upload file': 'Uploads a document or photo (PNG, JPEG or PDF, up to 2 MB).',
  'Replace file': 'Uploads a different file in place of this one.',
  'Uploading…': 'Uploading the file; wait a moment.',
  'Open Categories': 'Opens the Categories tab, where age groups and weight classes are set.',
  'Open Registrations': 'Opens the Registrations tab, where each player\'s category can be chosen by hand.',

  // --- weigh-in -----------------------------------------------------------------------
  'Close weigh-in': 'Ends the weigh-in: no more weights can be recorded. Reopening needs a reason.',
  'Reopen weigh-in': 'Allows weights to be recorded again. You are asked for a reason.',
  'Send weigh-in reminder': 'Sends the teams a reminder about the weigh-in time.',

  // --- draw ---------------------------------------------------------------------------
  'Run categorisation': { tip: 'Places every approved player in the right category (gender, age, event, weight) and lists anyone who fits none.', needs: 'Not possible once entries are locked.' },
  'Draw all categories': { tip: 'Draws the pools for every category in one go.', needs: 'Lock entries on the Dashboard first. Not possible once the draw is locked.' },
  Draw: { tip: 'Draws this category\'s pools.', needs: 'Lock entries on the Dashboard first. Not possible once the draw is locked.' },
  Redraw: { tip: 'Draws this category\'s pools again; the current pools are replaced.', needs: 'Not possible once the draw is locked.' },
  'Generate pools': 'Draws the pools now.',
  'Confirm redraw': 'Draws the pools again and throws the current ones away.',
  'Move to another pool': 'Moves this player to a different pool of the same category (with a reason).',
  Move: 'Moves the player to the pool you chose.',
  'Generate matches': { tip: 'Creates every bout from the drawn pools.', needs: 'Lock the draw first.' },

  // --- matches and calling ------------------------------------------------------------
  'Open scoring console': { tip: 'Opens the scoring console for this bout.', needs: 'Both players of the bout must be known.' },
  Schedule: 'Sets this bout\'s time, mat, referee and judges.',
  'Swap AKA and AO': { tip: 'Swaps the players\' corners before the bout (AKA becomes AO).', needs: 'Not possible once the bout has started or finished.' },
  'Change status': 'Moves the bout on: called, ready, console open, paused.',
  'Live score log': 'Every score and penalty given in this bout, in order, with who gave it.',
  'Enter result': { tip: 'Records the result by hand, for example from a paper score sheet.', needs: 'Both players of the bout must be known.' },
  'Correct result': 'Changes a finished result. You are asked for a reason (kept in the audit log).',
  'Save result': 'Saves the result of the bout.',
  Queue: 'Shows the bouts still to be fought, in order.',
  Live: 'Shows the bouts on the mats now.',
  Completed: 'Shows the finished bouts.',
  All: 'Shows every bout.',
  Call: { tip: 'Calls this bout to its mat: the players and their coaches are told to come now.', needs: 'Only the event on the mats now can be called.' },
  'Call again': 'Calls the bout to the mat again; the number of calls is kept.',
  Present: 'Marks this player as at the mat. With both present the bout is ready.',
  Absent: 'Marks this player as not at the mat. If they do not come, the referee records a no-show.',

  // --- bracket ------------------------------------------------------------------------
  'Arrange draw': 'Drag players between places to arrange the first round (allowed until the first bout is called).',
  'Record results': 'Drag each winner into the next box, or tap a bout, to record how it ended.',
  'Save draw': 'Saves your arrangement and rebuilds the bouts.',
  'Undo changes': 'Puts the draw back as it was before your changes.',

  // --- kata ---------------------------------------------------------------------------
  'Open round 1': { tip: 'Sets up round 1: every entrant performs, in a drawn order.', needs: 'Lock entries first.' },
  'Open next round': { tip: 'Sets up the next round with the qualifiers of the last one, lowest score first.', needs: 'Close the current round first.' },
  'Start round': { tip: 'Opens scoring: the judges can score from now.', needs: 'Kata must be on the mats (switch the session at the top of the page).' },
  'Complete round': { tip: 'Closes the round: scores become final and the performers are ranked.', needs: 'Every judge must score every performer first.' },
  'Save judges': 'Saves which judge sits in which seat.',
  'Save score': 'Saves this judge\'s score for the performer.',
  Change: 'Changes the score you gave (allowed until the round is closed).',

  // --- results ------------------------------------------------------------------------
  'Verify result': 'Marks this category\'s result as checked, ready to publish.',
  'Publish results': { tip: 'Shows the results on the public page.', needs: 'Verify the results first.' },
  'Re-publish': 'Publishes the results again after a change.',
  Unpublish: 'Hides the results from the public page again.',
  'Lock result': 'Freezes this category\'s result. Unlocking needs the override privilege and a reason.',
  Unlock: 'Unlocks this category\'s result. You are asked for a reason.',
  'Generate final stage': { tip: 'Creates the final stage (knockout bracket or final pool) from the pool qualifiers.', needs: 'Every pool bout must be finished first.' },
  'Choose qualifiers': 'Chooses by hand who goes through from the pools to the final stage.',
  'Override medals': 'Sets this category\'s medals by hand. You are asked for a reason.',
  'Add medal': 'Adds a medal to the list.',
  'Remove medal': 'Removes this medal from the list.',
  'Save medals': 'Saves the medals you set by hand.',
  'Use calculated medals': 'Drops the medals set by hand and uses the calculated ones again.',
  'Award gold': 'Gives the only player in this category the gold medal.',
  'No competition': 'Records that this category had no competition (no medal).',

  // --- certificates and passes ----------------------------------------------------------
  Generate: 'Creates the certificates you chose. Ones already issued are not repeated.',
  'Special award…': 'Issues a certificate for a special award (for example Best Fighter).',
  Issue: 'Issues this certificate.',
  'Generate passes': 'Creates accreditation passes with QR codes for players and team staff.',
  'At the door (arrival)': 'Scanning checks people in as they arrive at the venue.',
  'At the mat (next bout)': 'Scanning checks a player in at the mat for their next bout.',
  'Scan with camera': 'Uses the camera to read a pass\'s QR code.',
  'Stop camera': 'Turns the camera off.',
  'Check in': 'Checks in the person with this code.',

  // --- the kumite console -----------------------------------------------------------------
  Ippon: 'Gives this side an Ippon (worth the points shown).',
  'Waza-ari': 'Gives this side a Waza-ari (worth the points shown).',
  Yuko: 'Gives this side a Yuko (worth the points shown).',
  '-1': 'Takes one point off this side, to correct a mistake.',
  Timeout: 'Records a timeout for this side and stops the clock.',
  Start: { tip: 'Starts the bout clock.', needs: 'This bout\'s event is not on the mats, or the bout is over.' },
  Stop: 'Stops the bout clock.',
  'Add 5 seconds': 'Puts 5 seconds back on the clock (only while it is stopped).',
  'Take off 5 seconds': 'Takes 5 seconds off the clock (only while it is stopped).',
  'KO Timer': 'Starts the knock-down timer.',
  'Reset time': 'Puts the clock back to the bout\'s full time.',
  'Extra time': 'Sets the clock for extra time after a tie.',
  '60 seconds': 'Sets the clock to 60 seconds.',
  'Start extra time': 'Starts extra time after a tie at full time.',
  'Start golden score': 'Starts golden score: the first score wins.',
  'Start scoreboard': 'Shows this bout on the hall scoreboard.',
  'Close scoreboard': 'Stops showing this bout on the hall scoreboard.',
  Decision: 'Ends the bout another way: withdrawal (kiken), disqualification (shikkaku) or the judges\' decision (hantei).',
  'Clear decision': 'Takes the decision back, so the bout can continue.',
  'Confirm result': 'Saves the bout\'s result: the winner goes through and the bout closes.',
  'Take over': 'Takes control of this mat from another device.',
  'Apply mine': 'Sends what you scored offline on top of the bout as the server has it (and takes the mat back).',
  "Use the server's": 'Drops what you scored offline and uses the bout as the server has it.',
  Undo: 'Undoes the last scoring action.',

  // --- referee and judge screens (single categories) ------------------------------------------
  'View & Manage Matches': 'Opens this category\'s bouts.',
  'Cannot manage expired tournament': 'This tournament has ended, so it can no longer be changed.',
  'Control Match': 'Opens the scoring console for this bout.',
  'Watch Match': 'Opens this bout to follow it.',
  'Assign officials & time': 'Sets the bout\'s time, mat, referee and judges.',
  'Delete Match': 'Deletes this bout. A bout already fought needs a reason.',
  'New Match': 'Creates a bout by hand.',
  'Create Match': 'Creates the bout.',
  'Draw Round Robin': 'Creates a bout for every pair of competitors in this category.',
  'Create a bout for every pair': 'Creates a bout for every pair of competitors in this category.',
  'Cannot create matches in expired tournament': 'This tournament has ended, so no bouts can be added.',
  'New Competitor': 'Adds a competitor to this category.',
  'Add Competitor': 'Adds the competitor.',
  'Update Competitor': 'Saves the competitor\'s changes.',

  // --- hall screens --------------------------------------------------------------------------
  'Hall scoreboard (latest bout)': 'Opens the hall scoreboard showing the latest bout.',
  'Live board': 'Every mat: the bout on it and what comes next.',
  'Live board (every mat)': 'Every mat: the bout on it and what comes next.',
  'Public site': 'The public website: draws, live bouts and results.',
  'All tournaments': 'Back to the list of all tournaments.',

  // --- the coach portal and the public page --------------------------------------------------
  'Start registration': 'Opens the form to register your team.',
  'Register team': 'Registers your team for this tournament.',
  'Create my own login': 'Sets up your own sign-in for this team, so you do not need the link and password again.',
  'Create login': 'Creates the login.',
  'Draw & results': 'Your players\' categories, draw and results.',
  Certificates: 'Your players\' certificates, to download.',
  Notifications: 'Messages from the organiser.',
  Find: 'Finds the certificates issued to this name.',
  Verify: 'Checks that this certificate is genuine.',
  Check: 'Checks whether this certificate number is genuine.',

  // --- accounts ------------------------------------------------------------------------------
  'New account': 'Creates a staff account (referee, judge, officer, organiser).',
  'Create account': 'Creates the staff account.',
  'Save account': 'Saves the account.',
  'Add tournament role': 'Gives this account a different role in one tournament only.',
  'You cannot delete your own account': 'You cannot delete the account you are signed in with.',
  'Change password': 'Saves your new password.',
  'Send reset link': 'Emails a link to reset the password.',
  'Set up two-factor sign-in': 'Adds a second step at sign-in: a code from an authenticator app.',
  'Turn on': 'Turns two-factor sign-in on.',
  'Turn off': 'Turns two-factor sign-in off.',
  'Sign out everywhere else': 'Ends your sessions on every other device (for example a lost phone).',
  'Add organisation': 'Adds an organisation (association) with its own tournaments and staff.',
  'New ruleset': 'Creates a new set of competition rules.',
  'Download backup': 'Downloads a full copy of all the data. Keep it safe: it includes accounts.',
}

/** "Delete Aarav Patil", "Edit WKF 2026": the verb, then a name. */
const named = (verb) => new RegExp(`^${verb} (.+)$`)

/** Labels with a part only known at run time: a name, a number, an event. */
export const ACTION_PATTERNS = [
  [/^Switch to (Kata|Kumite)$/, (m) => ({ tip: `Ends the current session and puts ${m[1]} on the mats. ${m[1] === 'Kata' ? 'Kumite' : 'Kata'} then waits for its turn.`, needs: 'Finish or cancel what is called or under way first.' })],
  [/^Load (\d+) age groups$/, (m) => `Loads the ${m[1]} age groups of this standard set (and their weight classes).`],
  [/^Mat (\d+)$/, (m) => `Shows mat ${m[1]} on the hall scoreboard.`],
  [/^Need at least 2 competitors/, () => 'A category needs at least two competitors before bouts can be created.'],
  [named('Delete'), (m) => ({ tip: `Deletes ${m[1]}. You are asked to confirm first.` })],
  [named('Edit'), (m) => `Opens ${m[1]} to change it.`],
  [named('Remove'), (m) => `Removes ${m[1]}.`],
  [named('Copy'), (m) => `Makes a copy of ${m[1]} to edit.`],
  [named('Restore'), (m) => `Puts ${m[1]} back to the standard rules as shipped.`],
  [named('Download'), (m) => `Downloads ${m[1]}.`],
  [named('Properties of'), (m) => `Settings of the field ${m[1]}: help text, default, validation and when it shows.`],
]

// The tournament's stages, for the "→ Next stage" buttons on the Dashboard.
const STAGES = {
  draft: 'Being set up; nothing is public yet.',
  'registration open': 'Coaches can register players through the link (within the registration dates).',
  'registration closed': 'No new players; the organisers check the entries.',
  verification: 'Officers check documents and details before the weigh-in.',
  'weigh in': 'Kumite players are weighed.',
  'entries locked': 'The player list and categories are frozen, ready for the draw.',
  'draw generated': 'Pools are drawn; bouts can be generated.',
  ready: 'Everything is set for competition day.',
  live: 'Competition day: bouts are called and scored.',
  completed: 'Finished: results are locked.',
  archived: 'Kept as read-only history.',
}

const asEntry = (value) => (typeof value === 'string' ? { tip: value } : value)

/**
 * The explanation for an action's label, or null when there is none:
 * { tip, needs? }. Counts in brackets ("Players (12)") are ignored.
 */
export function explainAction(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (ACTIONS[text]) return asEntry(ACTIONS[text])
  const move = text.match(/^([→←])\s*(.+)$/)
  if (move) {
    const stage = STAGES[move[2].toLowerCase()]
    if (stage) return move[1] === '→'
      ? { tip: `Moves the tournament on to "${move[2]}": ${stage}` }
      : { tip: `Moves the tournament back to "${move[2]}": ${stage} You are asked for a reason.` }
  }
  const bare = text.replace(/\s*\((?:\d+|…)\)$/, '')
  if (bare !== text && ACTIONS[bare]) return asEntry(ACTIONS[bare])
  for (const [pattern, explain] of ACTION_PATTERNS) {
    const m = text.match(pattern)
    if (m) return asEntry(explain(m))
  }
  return null
}
