---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/core/src/commands/release.ts
line: 693
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: `finishRelease` partial-mutation hole between plan delete (step 5) and commit (step 6)

## Review Comment

ADR-003 documents the "plan deleted FIRST" invariant on the finish path (line 691–693): once the plan file is gone, downstream failures cannot re-trigger a second `finish`. The current code handles two such failures cleanly:

- **Step 7 merge conflict** — throws `FINISH_MERGE_CONFLICT` with an actionable hint that includes the exact manual recovery (`git merge --continue`, `git tag -a vX.Y.Z -F …`, `git push --follow-tags …`), surfaced through `formatReleaseError` (release-errors.ts:95–99).
- **Step 10 `gh release` failure** — non-fatal by design; the tag is already pushed, the user can recreate the release manually.

But step 6 (github-flow only, lines 697–753) has the same exposure with **no** equivalent recovery hint. Between the plan delete on line 693 and the commit on line 752, the function:

1. Reads `package.json`, mutates `version`, writes it back (line 698–701).
2. Optionally calls `propagateVersionToWorkspaces` (line 709) — which writes to every workspace `package.json` and sibling `plugin.json` in sequence (lines 1029–1056). Mid-loop failure leaves a subset of manifests bumped.
3. Prepends to `CHANGELOG.md` (lines 712–737).
4. Calls `git.add(cwd, stagePaths)` (line 751).
5. Calls `git.commit(cwd, "chore(release): vX.Y.Z")` (line 752) — which routes through `git.applyCommit` and surfaces hook failures as `COMMIT_HOOK_FAILURE`.

If any of these throws after step 5 (a pre-commit hook rejecting the release commit is the most likely real-world trigger), the user is left with:

- bumped manifests in the working tree,
- a CHANGELOG entry written,
- no plan file (so `gw release finish` cannot be re-run — it raises `NO_RELEASE_PLAN`),
- no clear hint on how to recover.

The hint mapping for `COMMIT_HOOK_FAILURE` falls through to `UNKNOWN_HINT` in `release-errors.ts` (no case matches the code).

**Suggested fix** — two complementary moves:

1. Move plan deletion (step 5) to **after** the github-flow commit succeeds. The merge conflict reasoning (commit on line 762 then `mergeNoFf` may fail) doesn't apply at step 6 because there's no merge yet — only local file writes + a local commit. Deleting the plan after step 6's commit keeps the same invariant (plan gone before any irreversible operation) while shrinking the partial-mutation window. The branch deletion / tag / push from steps 7–11 should still see the plan gone before they run, so move the `deleteReleasePlan` call between step 6 and step 7.
2. Add a `COMMIT_HOOK_FAILURE` case to `formatReleaseError` with a hint along the lines of: "A pre-commit hook rejected the release commit. Inspect the hook output, resolve the issue, then re-run `gw release finish`." — which becomes correct once #1 lands.

If #1 is too risky to take in this round, at minimum add the `COMMIT_HOOK_FAILURE` mapping and a one-line warning in the function's JSDoc that step-6 failures require manual recovery.

## Triage

- Decision: `VALID`
- Root cause: on the github-flow path, `finishRelease` deletes the plan file (step 5) before doing the local file mutations and release commit (step 6). A failure in step 6 — most realistically a pre-commit hook rejecting `chore(release): vX.Y.Z` — leaves the working tree dirty (bumped manifests + prepended CHANGELOG entry + possibly propagated workspace manifests) with no plan file on disk, so `gw release finish` raises `NO_RELEASE_PLAN` on retry and `formatReleaseError` falls through to `UNKNOWN_HINT` (no `COMMIT_HOOK_FAILURE` mapping exists). The ADR-003 invariant ("plan gone before any irreversible operation") is still preserved if we delete the plan AFTER the github-flow commit succeeds — the commit itself is local-only and reversible via `git reset --hard`, while the irreversible steps (merge / tag / push / gh release) all come after.
- Fix approach:
  1. Move `deleteReleasePlan(cwd)` from before the `if (!plan.releaseBranchCreated)` block to immediately after it, so on github-flow the plan file outlives any pre-commit hook failure (allowing recovery via `git reset --hard HEAD && gw release finish`, or `gw release abort`). On gitflow, `releaseBranchCreated === true` so the `if` block is a no-op and the delete still happens before the merges — same ordering as before, ADR-003 unchanged.
  2. Refresh the JSDoc on `finishRelease` so the documented lifecycle matches the new order, and update the step-5 / step-6 comments inline.
  3. Add a `COMMIT_HOOK_FAILURE` case to `formatReleaseError` (in `packages/cli/src/commands/release-errors.ts`, outside this batch's `<batch_scope>` code files) with the targeted recovery hint. This is the minimum out-of-scope change required for the fix to surface a useful message to the CLI user; without it the new behavior is correct but the hint is generic.
  4. Add a unit test in `packages/core/__tests__/unit/commands/release.test.ts` that installs a failing pre-commit hook on github-flow finish and asserts: (a) `git.commit` throws `COMMIT_HOOK_FAILURE`, (b) the plan file is still on disk afterwards, (c) the release tag was NOT created. Add a matching CLI-side test in `packages/cli/__tests__/release-errors.test.ts` for the new hint mapping.

- Notes: Out-of-scope file touched: `packages/cli/src/commands/release-errors.ts` (+ its test). The change is a single new switch case (and a matching test case row) — the minimum necessary so the new error path surfaces an actionable hint instead of `UNKNOWN_HINT`.
