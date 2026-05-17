# Task Memory: task_16.md

Keep only task-local execution context here. Do not duplicate facts that are
obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Rewrite README + docs for gitwise (positioning, install paths, four-command
reference, privacy, config schema), add `docs/migrating-from-devflow.md` and
`docs/deprecation-banner.md`, refresh `CONTRIBUTING.md` + `SECURITY.md`, append a
`0.1.0 — gitwise refactor` `CHANGELOG.md` entry, and add a docs lint test
that checks required README sections, broken relative links, removed-command
coverage, and banner contents.

## Important Decisions

- **Docs lint helper lives at `scripts/docs-lint.mjs` with a sibling
  `scripts/docs-lint.d.mts`.** Reuses the `scripts/release.mjs` pattern from
  task_15 — keeps the helper pure JS (no `allowJs`) while letting TS tests
  import it with full types. Required because ts-jest under `strict: true`
  rejects untyped `.mjs` imports (TS7016).
- **README intentionally does NOT link to `packages/cli/` or `packages/skills/`.**
  Those packages are added in task_12 / task_14 (still pending). The README
  mentions them as plain code (`@denisvieiradev/gitwise (packages/cli/) — landed
  in a later refactor task`) so the broken-link lint test stays clean while the
  monorepo is mid-build.
- **CHANGELOG version reset to `0.1.0`, not a continuation of `1.x`.** The
  product is rebranded and the pipeline surface dropped; per ADR-005 all three
  packages share a locked version. Keeping the historical `1.x` entries above
  the `0.1.0` block preserves attribution for the devflow-cli releases.
- **README `homepage`/`repo` URLs in the root `package.json` still point to the
  archived `denisvieiradev/devflow-cli` repo.** Not changed in this task — the
  gitwise GitHub repo URL is referenced from docs/SECURITY only. Update the
  root manifest when the actual gitwise repo URL is live (probably task_17 or
  the first dogfood release).

## Learnings

- Jest under the ESM preset does NOT define `__dirname` in `.ts` test files.
  Switch to `process.cwd()` (jest is invoked from repo root in this setup); the
  same pattern is used in `jest.config.ts`.
- The `findBrokenLinks` walk surfaced missing `packages/cli` and `packages/skills`
  directories before they were corrected in the README. Lint test paid for
  itself on first run.
- Coverage on `scripts/docs-lint.mjs`: 96.77/89.28/100/100. The uncovered branches
  are the `target.split('?')` empty-after-fragment branch and the
  isolated `if (!target) continue` after the fragment strip — both are
  defensive guards covered by the broader-input tests.

## Files / Surfaces

- `README.md` — rewritten end to end.
- `CONTRIBUTING.md` — devflow-cli references removed.
- `SECURITY.md` — rewritten for new package surface, `~/.gitwise/.env` API key
  location, sensitive-file filter call-out.
- `CHANGELOG.md` — added `## [0.1.0] - 2026-05-16 — gitwise refactor` block at
  the top + version link footnote.
- `docs/migrating-from-devflow.md` (new) — direct-equivalents table + removed
  commands table + config + templates migration.
- `docs/deprecation-banner.md` (new) — canonical banner text + placement notes
  (top-of-CLI guard + postinstall fallback).
- `scripts/docs-lint.mjs` (new) — pure-function lint helper.
- `scripts/docs-lint.d.mts` (new) — TS declarations sibling.
- `__tests__/unit/scripts/docs-lint.test.ts` (new) — 20 unit tests.
- `__tests__/integration/docs.test.ts` (new) — 11 integration assertions
  against the actual repo docs.

## Errors / Corrections

- First test run failed: `__dirname is not defined` (ESM). Replaced with
  `process.cwd()`; jest project's CWD is always the repo root.
- First test run also failed: angle-bracket-link test used `[x](<some path.md>)`
  where the regex (intentionally) rejects whitespace inside the target. Changed
  fixture to `[x](<docs/file.md>)`; the regex stays the same.
- First integration run failed on broken `packages/cli` / `packages/skills`
  links in the README. Replaced the inline links with plain-code references
  noting that those packages land in later refactor tasks.

## Ready for Next Run

- When `packages/cli` and `packages/skills` land (task_12 / task_14), upgrade
  the README "Architecture" bullet points back to real links — the lint test
  will start passing on those too.
- The deprecation-banner text in `docs/deprecation-banner.md` is the canonical
  source. When cutting the final `devflow-cli` release, copy verbatim into the
  archived repo's `DEPRECATION.txt`. Do not edit one without editing the other.
- The docs lint helper is general enough to lint additional markdown files. Add
  more files to `__tests__/integration/docs.test.ts` as new docs land
  (e.g. ADRs, future migration guides).
