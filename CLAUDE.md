# Notes for working on this repo

## Keep the operator handbook and its PDF in step with the app

`docs/operator-handbook/` walks the person who runs a tournament through the app,
click by click: `README.md`, its screenshots in `images/`, and
`Operator-Handbook.pdf`, the copy that gets printed or sent to operators. The
PDF must not fall behind the app.

In any PR that changes something the handbook describes (a screen, a button,
tab or field label, the order of the steps, a rule, a message or a default):

1. Update `docs/operator-handbook/README.md`.
2. If a pictured screen changed, retake its screenshots with
   `npm run docs:screenshots -- <names>` while the app runs with its test data
   (how to start it is at the top of `docs/operator-handbook/tools/screenshots.mjs`).
3. Rebuild the PDF with `npm run docs:pdf` and commit `Operator-Handbook.pdf`
   in the same PR.
4. Check `docs/user-guide/README.md` as well: it lists every rule and message.
   Its screenshots have no script; retake those by hand if their screen changed.

Changes an operator cannot see (refactors, tests, internals) need none of this.
Say in the PR description whether the handbook was updated, or why it did not
need to be.

The handbook and the user guide also exist as Claude Docs on claude.ai. Those
are separate copies; the files here are the ones the PDF is built from.
