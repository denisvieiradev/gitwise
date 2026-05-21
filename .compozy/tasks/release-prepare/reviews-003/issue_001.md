---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/core/src/commands/release.ts
line: 869
severity: high
author: claude-code
provider_ref:
---

# Issue 001: `abort` on github-flow leaves `.gitignore` dirty, blocking next `prepare`

## Review Comment

`prepareRelease` calls `ensureGitignored(cwd, RELEASE_PLAN_REL_PATH)` and `ensureGitignored(cwd, RELEASE_NOTES_GLOB_REL_PATH)` at step 11 (lines 383–384). On github-flow `releaseBranch === null`, so the branch in lines 386–393 that stages and commits `.gitignore` is skipped. The `.gitignore` modification is intentionally deferred to `finishRelease`'s step 6 (line 744–746), which folds it into the release commit.

But if the user cancels between prepare and finish — `gw release abort`, `runReleaseInProcess`'s `confirm` returning false, or a `Ctrl-C` at the confirm prompt — `abortRelease` (lines 869–925) only deletes the plan file and (optionally) the release branch. It never reverts the `.gitignore` change prepare made.

Result: after `prepare` + `abort` on a github-flow repo, `.gitignore` shows up as `M .gitignore` (or `?? .gitignore` on a brand-new repo). The next `gw release prepare` hits the unconditional preflight at lines 262–270:

```ts
const dirty = (await git.status(cwd)).trim();
if (dirty) {
  throw Object.assign(new Error(`Working tree must be clean...`), { code: "WORKING_TREE_DIRTY" });
}
```

…and fails with `WORKING_TREE_DIRTY` until the user manually runs `git checkout -- .gitignore` (or `git add` + `git commit`). The integration test at `release-lifecycle.test.ts:630` covers `prepare → finish → prepare`, but no test covers `prepare → abort → prepare` on github-flow — the gap that lets this regression hide.

**Suggested fix**: in `abortRelease`, restore `.gitignore` to its pre-prepare state when prepare modified it. Two practical options:

1. Snapshot the prior `.gitignore` content into `PersistedReleasePlan` (e.g. `previousGitignore: string | null`) during `prepare`, then restore in `abort`. Adds a field but keeps abort self-contained.
2. Make `prepareRelease`'s preflight (step 2) tolerant of the same `expectedDirtyPaths` allow-list that `finishRelease` uses (lines 617–622), so a leftover `.gitignore` from a prior aborted prepare doesn't block a fresh planning run.

Option 2 is the smaller change and matches the symmetric behavior on the finish side. Either way, add an integration test covering `prepare → abort → prepare` on github-flow to lock in the recovery path.

## Triage

- Decision: `VALID`
- Root cause: `prepareRelease` step 11 (lines 383–384) calls `ensureGitignored`
  twice. On gitflow the resulting `.gitignore` mutation is folded into the
  version-bump commit at lines 386–393. On github-flow `releaseBranch === null`,
  so that block is skipped and `.gitignore` is left intentionally dirty —
  `finishRelease`'s step 6 (lines 744–746) folds it into the release commit and
  step 2c's `expectedDirtyPaths` (lines 617–622) tolerates it. `abortRelease`
  has no equivalent recovery: it only deletes the plan file (and optionally the
  release branch), so a github-flow `prepare → abort` cycle leaves
  ` M .gitignore` (or `?? .gitignore`) sitting in the working tree. The
  unconditional preflight at lines 262–270 then refuses the next `prepare` with
  `WORKING_TREE_DIRTY`, forcing the user to manually
  `git checkout -- .gitignore` before retrying.
- Fix approach: chose the reviewer's Option 2 (smaller change, symmetric with
  finish). Replaced the unconditional `git.status` check in `prepareRelease`'s
  step 2 preflight with a filtered scan that ignores `.gitignore` exactly the
  way `finishRelease` step 2c does. Unrelated dirty paths still trip
  `WORKING_TREE_DIRTY`. Option 1 (snapshotting `.gitignore` into the persisted
  plan and restoring on abort) was rejected: it widens the schema for the same
  recovery property and would not symmetrise the prepare and finish preflights.
- Tests: added two integration cases at the end of
  `packages/core/__tests__/integration/release-lifecycle.test.ts`:
  - `github-flow: prepare → abort leaves .gitignore dirty, and the next
    prepare still succeeds` — runs the exact regression path described in the
    review, asserts the abort leaves `.gitignore` (and only `.gitignore`)
    dirty, then drives a second `prepare` to v1.1.0 in the same repo.
  - `prepare preflight still rejects unrelated dirty paths even when
    .gitignore is the only allowed leftover` — guards against the filter
    accidentally swallowing real user changes by pairing a stray `.gitignore`
    with an unrelated tracked-file modification and asserting
    `WORKING_TREE_DIRTY` still fires.
- Verification: `npm test` (gitwise workspace root) — Test Suites: 30 passed,
  Tests: 474 passed, including the two new regression tests. `npm run
  typecheck` (all three workspaces): clean. `npm run lint` fails with a
  pre-existing environment issue (`'jiti' library is required for loading
  TypeScript configuration files` against the `.ts` eslint config) that is
  independent of this change — my edits only touched executable source/test
  TS and added no new dependencies or config.
