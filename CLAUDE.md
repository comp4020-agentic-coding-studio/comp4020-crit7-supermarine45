# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Rules I hold the agent to

- **Never touch or integrate with ANU's real StarRez housing portal**
  (`anucomb.starrezhousing.com`). It's out of scope and I have no
  authorisation to access it. Only ANU's public
  `study.anu.edu.au/accommodation/our-residences` listing and its public
  per-residence pages may be used as data or content sources. The existing
  `applyUrl` fields linking to real, public StarRez application URLs are an
  already-approved exception — don't extend it without asking me first.
- **Never commit, push, or deploy without asking me first**, even partway
  through a task. Finish the work, tell me what changed and show me
  `git status`, and wait for an explicit go-ahead before any of those three.
- **Don't fabricate data that could pass as real.** If a feature needs data
  this app has no genuine source for (a contact address, a fee, a policy),
  say so and mark it as mocked rather than inventing something that reads
  as real ANU information. If a feature draws on a real published source
  (e.g. a PDF schedule), only hardcode the parts you've actually verified by
  hand — don't trust an automatic extraction you haven't cross-checked.
- **Prove a feature works, not just that it type-checks.** `pnpm check`
  (typecheck + build + tests) is the floor, not the finish line — before
  calling a feature done, exercise it end to end against a running server
  (curl or a browser) and say what you actually observed.
- End every git commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- End every PR description with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- **Know where content actually lives before editing it by hand.** Per-residence
  data (tariffs, features, blurb, coordinates, apply links, ...) is hand-curated
  in `seed/*.json` and applied to the database at boot by `scripts/seed.ts` —
  edit the JSON, not the database. Static page copy (headings, explanatory
  text, disclaimers) is hardcoded directly in each route's own file under
  `src/pages/*.astro`. `/readme/` is the one exception: it renders `README.md`
  verbatim, so that page's content is `README.md` itself.
