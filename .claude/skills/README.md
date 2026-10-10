# Skills vendored into this repository

Skills here are instructions that a coding agent loads when it works on this
repository. They are plain Markdown plus small zero-dependency scripts; nothing
here runs as part of the app, the build, or the tests.

## security-audit

A defensive security-audit workflow: reconnaissance, coverage-led hunting,
adversarial validation of every candidate, structured findings, independent
record verification, and a report.

- Source: https://github.com/cloudflare/security-audit-skill
- Licence: MIT, © Cloudflare
- Installed with: `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`
- Pinned in `skills-lock.json` at the repository root.

Run it by asking the agent for a security audit of this codebase. It writes its
output outside the repository and never modifies application source.
