---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/core/src/commands/release.ts
line: 200
severity: medium
author: claude-code
provider_ref:
---

# Issue 006: applyRelease leaves the repo half-applied on partial failure

## Review Comment

`packages/core/src/commands/release.ts:200-263` performs an ordered series of side effects:

1. Write `package.json` (line 210).
2. Optional workspace propagation (line 214).
3. Rewrite `CHANGELOG.md` (lines 222–234).
4. Write `.gitwise/release-<version>.md` (lines 237–238).
5. Stage and commit (lines 246–254).
6. Create tag (line 258).
7. Push (line 262).
8. Optional GitHub release (lines 267–284).

There is no preflight (`scripts/release.mjs` has one at lines 188–200 — clean tree + `tagExists`) and no rollback. If step 6 fails because the tag already exists, the user is left with a `chore(release): vX.Y.Z` commit on the branch, manifests and CHANGELOG mutated, and no tag — re-running `gw release` will then fail at the very first `git commit` (working tree dirty) and the user has to hand-clean. If step 7 fails, the commit and tag are local; the next `gw release` invocation will see the tag exists and refuse.

Suggested fix:

1. Lift the `statusPorcelain()` and `tagExists()` preflight from `scripts/release.mjs` (`defaultGit()` block, lines 151–168) into `applyRelease`. If `cwd` is dirty before any mutation, throw `WORKING_TREE_DIRTY`; if `vX.Y.Z` already exists as a ref, throw `TAG_EXISTS`. Do this before writing any file.
2. Keep the GitHub release step's existing graceful catch (lines 269–280) but explicitly document in the function's docstring that step 6/7 failures leave a local release commit + tag. Operators can recover with `git push origin HEAD --tags`; first-time users cannot.

A unit test should cover both preflight branches with the existing `MockLLMProvider` pattern, exercising the failure path on a dirty tree.

## Triage

- Decision: `VALID`
- Root cause: `applyRelease` in `packages/core/src/commands/release.ts:200` performs a
  sequence of file writes (`package.json`, `CHANGELOG.md`, `.gitwise/release-*.md`),
  `git commit`, `git tag`, and `git push` with no preflight. If any step from the
  commit onward fails (typically `git tag` because `vX.Y.Z` already exists, or
  `git push` due to network/permissions), the working tree is left mutated and
  staged or committed — re-running `gw release` then aborts at the very first
  `git commit` because of the dirty tree, forcing manual cleanup. The companion
  script `scripts/release.mjs:211-223` already guards against this with
  `statusPorcelain()` and `tagExists()` preflights; `applyRelease` did not.
- Fix approach:
  1. Add `tagExists(cwd, tag)` helper to `packages/core/src/infra/git.ts`
     using `git rev-parse --verify --quiet refs/tags/<tag>`.
  2. At the top of `applyRelease`, before any filesystem or git mutation:
     - Use the existing `git.status(cwd)` (porcelain) helper; if non-empty,
       throw with `code: "WORKING_TREE_DIRTY"`.
     - If `tagAndPush` is enabled, call `git.tagExists(cwd, \`v${plan.newVersion}\`)`;
       if true, throw with `code: "TAG_EXISTS"`.
  3. Document failure modes for `git push` (step 7) and `gh release create`
     (step 8) in the function's docstring, including recovery commands.
  4. Add three unit tests using the existing `mkdtemp` pattern: dirty tree
     (returns `WORKING_TREE_DIRTY` and leaves manifests untouched), pre-existing
     tag with `tagAndPush: true` (returns `TAG_EXISTS` and leaves manifests
     untouched), and pre-existing tag with `tagAndPush: false` (proceeds).
- Notes:
  - Adjusted four existing workspace tests that created `packages/*/package.json`
    *after* the seed commit; the new preflight (correctly) flagged that as a
    dirty tree, so each test now commits the workspace fixtures before calling
    `applyRelease`. This is the right behavior in production — releasing on a
    dirty tree is exactly what the preflight prevents.
  - The GitHub release step (8) keeps its existing graceful catch — a failure
    there is the only post-mutation failure that is fully recoverable without
    operator intervention, and the docstring now documents that explicitly.

## Verification

```
VERIFICATION REPORT
-------------------
Claim: All release fix changes are correct (preflight added, tests cover both branches, no regressions).
Command: npm run lint && npm test && npm run build  (run from repo root)
Executed: just now, after all changes
Exit code: 0 for each
Output summary:
  - lint: tsc --noEmit across cli/core/skills — no output, exit 0
  - test: 20 suites passed, 261 tests passed (release.test.ts: 35/35 incl. 3 new preflight tests)
  - build: tsup ESM + DTS build success across all packages
Warnings: none
Errors: none
Verdict: PASS
```
