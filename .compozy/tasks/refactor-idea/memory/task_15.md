# Task Memory: task_15.md

Keep only task-local execution context here. Do not duplicate facts that are
obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Phase 0 release tooling for the monorepo: a Node script that propagates a single
locked version across the root + every `packages/*/package.json`, commits, and
tags (no push); plus a tag-push GitHub Actions workflow that builds, tests,
publishes every workspace to npm, and creates a GitHub release using the top
section of `CHANGELOG.md`.

## Important Decisions

- **Pure-function structure inside `scripts/release.mjs`.** Exports
  `parseArgs`, `bumpVersion`, `isExplicitVersion`, `listWorkspaceManifests`,
  `propagateVersion`, `resolveNewVersion`, and `runRelease`. The git side
  effects are encapsulated in `defaultGit(rootDir)` and `runRelease` accepts an
  injectable `git` so unit tests assert call ordering without invoking real git.
  An explicit `--cwd <path>` flag lets tests run the script against a temp
  workspaces fixture without `cd`.
- **Ambient types via `scripts/release.d.mts`.** ts-jest under
  `strict: true` rejects an untyped `.mjs` import (TS7016). Adding a sibling
  declaration file kept the script pure JS and avoided wiring `allowJs` into the
  root tsconfig.
- **GitHub release notes via `awk` on `CHANGELOG.md`.** The workflow extracts
  the first `## ` section by streaming `CHANGELOG.md` through `awk`, then trims
  surrounding blank lines, and feeds the result to `gh release create
  --notes-file`. No external action needed.
- **Did NOT add an `npm run release` script.** ADR-005 frames the script as a
  Phase 0 fallback; aliasing it would hint at a stable workflow we plan to
  retire. Operators invoke `node scripts/release.mjs <bump>` directly per the
  CONTRIBUTING runbook.
- **GitHub release uses `gh release create` (preinstalled on GitHub-hosted
  runners) with `GH_TOKEN=secrets.GITHUB_TOKEN`.** `npm publish` authenticates
  via `actions/setup-node`'s `registry-url` + `NODE_AUTH_TOKEN=secrets.NPM_TOKEN`
  contract, which is the path most resistant to silent breakage.

## Learnings

- The legacy jest project's `roots: ["<rootDir>/__tests__"]` plus ts-jest ESM
  preset transparently imports `.mjs` modules from `.ts` test files. No
  moduleFileExtensions tweak needed.
- ts-jest's `--coverage` instrumentation does NOT cross subprocess boundaries.
  The integration test exercises the entry-point guard and `defaultGit` end to
  end, but those lines stayed uncovered in the report; an in-process unit test
  that initializes a real git repo in a `mkdtemp` and calls `runRelease()`
  without injecting `git` is what actually drove the script's branch coverage
  over 80% (final: 94.44/80.76/92.85/95.87).
- The repo currently has zero commits, so no real-repo dry-run with
  `commit + tag` is possible. The cleanest proof of correctness is the
  `__tests__/integration/release.test.ts` subprocess test against a temp git
  workspace. Direct invocation of the exported functions confirms manifest
  discovery + bump math against the real repo (`packages/core` only, until
  task_12 lands `packages/cli`).

## Files / Surfaces

- `scripts/release.mjs` (new) — Phase 0 release helper.
- `scripts/release.d.mts` (new) — TS declarations for the helper.
- `.github/workflows/release.yml` (new) — tag-push publish + GitHub release.
- `CONTRIBUTING.md` — added "Releasing (Phase 0)" section with runbook,
  required secrets table, rollback notes, and an ADR-005 link.
- `__tests__/unit/scripts/release.test.ts` (new) — 32 unit tests covering
  argument parsing, bump math, propagation, idempotence, manifest discovery
  edge cases, and an in-process end-to-end run that exercises `defaultGit`.
- `__tests__/integration/release.test.ts` (new) — 7 subprocess + YAML-shape
  tests (`v0.1.2 → v0.1.3` end to end, error path, workflow structural
  checks).

## Errors / Corrections

- First test run failed with TS7016 (no declarations for `release.mjs`); fixed
  by adding `scripts/release.d.mts`.
- Initial release.mjs imported `dirname` and `fileURLToPath` and never used
  them; removed.

## Ready for Next Run

- Phase 1 (task_17 in techspec sequencing) can move the propagation logic into
  `core.applyRelease()` and switch the runbook to `gw release`. The script and
  workflow MUST stay (ADR-005 fallback).
- When task_12 adds `packages/cli`, the workflow needs no change — `npm publish
  --workspaces` and the script's `listWorkspaceManifests` both pick it up
  automatically. Verify on the next dogfood release that `packages/cli/package.json`
  gets bumped alongside `packages/core/package.json`.
- The dry-run requested in the task's "Success Criteria" cannot be fulfilled
  against the actual repo (no commits exist). The integration test is the
  functional equivalent; document this if a future task introduces an initial
  commit and you want to repeat the dry-run.
