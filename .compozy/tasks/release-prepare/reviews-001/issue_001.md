---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/core/src/commands/release.ts
line: 257
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Leftover release notes file blocks the next `release prepare`

## Review Comment

`prepareRelease` aborts when the working tree is not perfectly clean
(`packages/core/src/commands/release.ts:257`):

```ts
const dirty = (await git.status(cwd)).trim();
if (dirty) {
  throw Object.assign(
    new Error(`Working tree must be clean before preparing a release …`),
    { code: "WORKING_TREE_DIRTY" },
  );
}
```

However, the notes file written by every prepare lives at
`.gitwise/release-<version>.md` and is never gitignored — `ensureGitignored`
(`release-plan.ts:87`) only adds `.gitwise/release-plan.json`. The notes file
is also never staged or committed: the gitflow commit at
`release.ts:361-366` stages only `package.json`, `CHANGELOG.md`, and
`.gitignore`; the github-flow commit at `release.ts:680-688` stages only
`package.json` and `CHANGELOG.md`. After a successful `finishRelease`, the
file therefore remains in the working tree as an untracked file.

Reproduction:

1. `gw release` (ship `1.1.0`) → succeeds; `.gitwise/release-1.1.0.md` left on
   disk.
2. `gw release prepare` for `1.2.0` → fails immediately with
   `WORKING_TREE_DIRTY` because `git status --porcelain` reports
   `?? .gitwise/release-1.1.0.md` (or the collapsed `?? .gitwise/` entry on
   github-flow).

This makes the second release in any repository fail until the user
manually removes the previous notes file — a UX regression vs. the legacy
one-shot path which never created such an artifact.

The integration tests in
`packages/core/__tests__/integration/release-lifecycle.test.ts` don't catch
this because each test runs in a fresh `mkdtemp` directory.

ADR-003 explicitly states "Notes (`.gitwise/release-<v>.md`) are never
touched — the user may still want them." That stance is fine, but it needs
to coexist with the next prepare. Pick one of:

- Append `.gitwise/release-*.md` (or a broader `.gitwise/release-*` glob) to
  `.gitignore` during `ensureGitignored` so old notes files don't trip the
  dirty check; OR
- Filter `.gitwise/release-*.md` paths out of `prepareRelease`'s dirty check
  the same way `finishRelease` filters its `expectedDirtyPaths`; OR
- Stage and commit the notes file alongside the version bump so it ends up
  tracked.

Also worth adding an integration test that runs two successive `prepare`s in
the same repo to lock the behavior down.

## Triage

- Decision: `VALID`
- Root cause: `prepareRelease` writes `.gitwise/release-<v>.md` at
  `release.ts:314` and `applyRelease` writes it at `release.ts:447`, but
  `ensureGitignored` at `release-plan.ts:87` only covers
  `.gitwise/release-plan.json`. Neither `finishRelease` nor `abortRelease`
  removes the notes file (ADR-003 preserves it on disk for the user), and
  neither the gitflow commit (`release.ts:361-366`) nor the github-flow
  commit (`release.ts:680-688`) stages it. After a successful finish, the
  notes file remains as `?? .gitwise/release-<old-v>.md`, and the next
  `prepareRelease`'s unfiltered dirty check at `release.ts:257` rejects the
  whole working tree.
- Fix approach: option 1 from the review — also gitignore
  `.gitwise/release-*.md` from both `prepareRelease` and `applyRelease` so
  every past notes file falls out of `git status --porcelain` without being
  deleted. This is symmetric with the existing
  `.gitwise/release-plan.json` handling, respects ADR-003 (notes stay on
  disk), and is durable across arbitrarily many releases (no need to
  enumerate version-specific paths). Reuses the existing `ensureGitignored`
  helper, whose `isCovered` correctly treats `.gitwise/release-*.md` as an
  exact-line match and also detects pre-existing broader patterns
  (`.gitwise/`, `.gitwise/*`).
- Test coverage: added an integration test that runs two successive
  `prepareRelease` calls in the same repo (after the first prepare's
  artifacts have settled and the second LLM round of commits exists),
  asserting the second prepare does not throw `WORKING_TREE_DIRTY`. Both
  the gitflow and github-flow strategies are covered.
