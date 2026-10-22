# Notes for working on this repo

## Ship every change as its own small PR

Each fix or change goes on its own branch, cut from the latest `main` and named
`claude/<ticket>-<short-name>` (for example `claude/kan-391-partner-window`),
and goes out as its own pull request. Open the PR without waiting to be asked.

- One ticket, or one part of a ticket, per PR. Split a larger ticket into
  several PRs rather than bundling it.
- Never stack new work on a branch whose PR is open or merged; start a fresh
  branch from `main`.
- The PR description says what was wrong, what changed, how it was tested, and
  whether the docs needed updating (see below).
- Merge the PR as soon as it passes testing: the local checks and the **CI**
  check on GitHub green, and no conflict with `main`. Several PRs that touch
  the same file can be merged one after another; merge `main` back into a
  branch if it conflicts.

## Hand each fixed ticket to QA in Jira

After a PR for a Jira ticket (project KAN) is merged:

1. Add a comment to that ticket (and to the story it relates to, if the fix
   changes what the story describes) with the steps to test the flow: the PR,
   what changed, what to set up first, then a table of steps with what to do
   and what to expect, and the automated test that covers it. If only part of
   the ticket is fixed, say which part, and list what is still open.
2. Move the ticket to **In Review**, which this project uses as "Ready for QA"
   (KAN has no separate Ready for QA status). Do this for a partly fixed ticket
   too: its comment says which part to test and what is still open.

## Keep the operator handbook and its PDF in step with the app

`docs/operator-handbook/` walks the person who runs a tournament through the app,
click by click: `README.md`, its screenshots in `images/`, and
`Operator-Handbook.pdf`, the copy that gets printed or sent to operators. The
PDF must not fall behind the app.

In any PR that changes something the handbook describes (a screen, a button,
tab or field label, the order of the steps, a rule, a message or a default):

1. Update `docs/operator-handbook/README.md`.
2. If a pictured screen changed, retake its screenshots with
   `npm run docs:screenshots -- <names>`. It starts a throwaway copy of the app
   with its test data by itself and stops it afterwards
   (`docs/operator-handbook/tools/servers.mjs`).
3. Rebuild the PDF with `npm run docs:pdf` and commit `Operator-Handbook.pdf`
   in the same PR.
4. Check `docs/user-guide/README.md` as well: it lists every rule and message.
   Its screenshots have no script; retake those by hand if their screen changed.

Changes an operator cannot see (refactors, tests, internals) need none of this.
Say in the PR description whether the handbook was updated, or why it did not
need to be.

The handbook and the user guide also exist as Claude Docs on claude.ai. Those
are separate copies; the files here are the ones the PDF is built from.
