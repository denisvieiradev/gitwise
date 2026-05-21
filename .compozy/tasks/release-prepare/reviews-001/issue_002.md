---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/core/src/commands/release.ts
line: 693
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Gitflow merge failure in `finishRelease` leaves repo in irrecoverable state

## Review Comment

`finishRelease` deletes the plan file before performing any merges (ADR-003,
"plan-first delete" invariant — `release.ts:637`). The subsequent merge loop
is:

```ts
const mergeTargets = strategy.mergeTargets(mainBranch, developBranch);
for (const target of mergeTargets) {
  if (target === plan.targetBranch) continue;
  await git.checkout(cwd, target);
  await git.mergeNoFf(cwd, plan.targetBranch);
}
```

For gitflow, `mergeTargets = ["main", "develop"]`. If `main` merges cleanly
but `develop` produces a conflict, `git merge --no-ff` exits non-zero, the
loop throws a raw, untyped error, and we are left with:

- Plan file: deleted.
- Main: contains the release commit + tag would later be created here, but
  step 9 never runs.
- Develop: partially merged with conflict markers in the index/work tree.
- HEAD: stuck on `develop` mid-conflict.
- No way to `gw release finish` again (NO_RELEASE_PLAN) and no `abort` would
  help (also NO_RELEASE_PLAN).

The techspec ("Known Risks", `_techspec.md:286-288`) acknowledges this risk
but the implementation surfaces no typed error and no recovery hint.
`release-errors.ts` therefore returns the generic `UNKNOWN_HINT` for the
merge failure, which tells the user nothing about how to dig out.

Two minimum-bar fixes:

1. Wrap each `git.checkout` + `git.mergeNoFf` pair in a try/catch and
   re-throw with a typed `FINISH_MERGE_CONFLICT` code carrying the offending
   target branch and the failed source. Add a matching case to
   `release-errors.ts` describing the manual recovery: resolve, `git
   merge --continue`, then re-run a smaller helper (or just `git tag` +
   `git push --follow-tags` manually).
2. Optionally pre-check mergeability with `git merge-tree` (Git ≥ 2.38)
   before deleting the plan, so a known-conflict develop merge fails fast
   while the plan is still on disk and `abort` is still meaningful.

Also worth a regression test that seeds a conflicting commit on develop and
asserts a typed error + plan-file state.

## Triage

- Decision: `VALID`
- Root cause: The merge loop in `finishRelease` at `release.ts:703-712` runs
  `git.checkout` + `git.mergeNoFf` for each strategy target with no error
  handling. When `git merge --no-ff` fails (the gitflow develop merge can
  conflict if develop advanced between prepare and finish), the loop throws an
  untyped raw error after the plan file has already been deleted at step 5
  (ADR-003 "plan-first delete"). `release-errors.ts` keys on `code`, so the
  untyped failure falls through to `UNKNOWN_HINT`, telling the user nothing
  about manual recovery. The repo is left mid-merge with no plan to abort and
  no way to re-run finish.
- Fix approach (minimum-bar option 1 from the review):
  1. Wrap the `git.checkout` + `git.mergeNoFf` pair inside the loop in a
     try/catch. On failure throw a typed error with
     `code: "FINISH_MERGE_CONFLICT"` carrying `target`, `source`, and
     `newVersion`, plus a message naming the failing branch.
  2. Add a `FINISH_MERGE_CONFLICT` case to `release-errors.ts` whose hint
     directs the user to resolve conflicts, run `git merge --continue`, and
     tag + `git push --follow-tags` manually (the plan file is already gone,
     so finish cannot be re-run).
  3. Add an integration regression test that seeds a conflicting commit on
     develop between prepare and finish and asserts the typed error code.
  4. Add the new code to the formatter coverage test.
- Skipped (out of scope for the minimum-bar fix): the optional `git merge-tree`
  pre-flight from review option 2 — that is a larger design change (mergeability
  probe before the plan is deleted) and the issue marks it as "optionally".
- Out-of-scope files touched (the issue itself directs the fix to span them):
  - `packages/cli/src/commands/release-errors.ts` — adding the
    `FINISH_MERGE_CONFLICT` hint is explicitly part of the prescribed fix and
    is the whole reason `UNKNOWN_HINT` no longer leaks.
  - `packages/cli/__tests__/release-errors.test.ts` — extends the existing
    code-coverage parametrized list so the new hint stays exercised.
  - `packages/core/__tests__/integration/release-lifecycle.test.ts` — adds the
    regression test the review asks for (seed conflict on develop, assert
    typed error + plan-file state).
