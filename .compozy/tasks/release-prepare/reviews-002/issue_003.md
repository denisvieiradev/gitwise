---
provider: manual
pr:
round: 2
round_created_at: 2026-05-20T19:54:20Z
status: resolved
file: packages/core/src/commands/release.ts
line: 397
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: `prepareRelease` silently overwrites a stale on-disk plan

## Review Comment

`prepareRelease` ends by writing the plan unconditionally:

```ts
// packages/core/src/commands/release.ts:397
await saveReleasePlan(cwd, persistedPlan);
```

There is no precondition check that asks "is there already a plan on
disk?". This is the symmetric counterpart to ADR-003's "plan-first
delete" invariant in `finishRelease`, but the prepare side is missing.
Two reachable failure modes:

1. A previous `prepareRelease` succeeded but the user neither finished
   nor aborted it — they just ran `gw release prepare` again. The new
   prepare overwrites the original plan (different `newVersion`,
   different `baseCommit`, different `preparedAt`, different
   `releaseBranchCreated`) with no warning. For github-flow this leaves
   no trace of the prior plan; the operator can't tell that they
   accidentally trampled it.
2. For gitflow, the second prepare *does* fail later with
   `STRATEGY_RELEASE_BRANCH_EXISTS` (release.ts:295), but only **after**
   the LLM call and after creating no branch on this run — the prior
   plan file is still overwritten only if the second prepare manages to
   pick a different `newVersion`. The error surface depends on incidental
   ordering rather than an explicit invariant.

The implementation already has every primitive needed — `loadReleasePlan`
exists and returns `null` when there is no plan. Add a check up-front:

```ts
// after step 2 (clean-tree check), before step 3
const existing = await loadReleasePlan(cwd);
if (existing) {
  throw Object.assign(
    new Error(
      `An in-flight release plan already exists at .gitwise/release-plan.json ` +
      `for v${existing.newVersion} (${existing.strategy}). Finish it with ` +
      `"gw release finish" or discard it with "gw release abort" before ` +
      `preparing a new release.`,
    ),
    { code: "RELEASE_PLAN_EXISTS" },
  );
}
```

Add a matching `RELEASE_PLAN_EXISTS` case to `release-errors.ts` so the
CLI surfaces a recovery hint, and add the new code to the formatter
coverage test in `packages/cli/__tests__/release-errors.test.ts`. The
typed error keeps prepare cheap to retry (it bails before the LLM call)
and removes the silent-overwrite footgun.

Tests: add an integration case that runs two `prepareRelease`s in a row
without an intervening finish/abort and asserts the second one throws
`RELEASE_PLAN_EXISTS`.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed by reading `packages/core/src/commands/release.ts:245-405`: `prepareRelease`
    never inspects `loadReleasePlan(cwd)` before calling `saveReleasePlan` at line 397.
    Both failure modes from the review reproduce against the current code:
    on github-flow nothing else gates re-prepares, so the second run silently
    overwrites the prior plan; on gitflow `STRATEGY_RELEASE_BRANCH_EXISTS`
    only fires *after* the LLM call and only when the new version matches the
    existing release branch — when the LLM picks a different bump, the prior
    plan file is still trampled.
  - `loadReleasePlan` (`release-plan.ts`) already returns `null` when no plan
    exists, so the precondition check is a cheap pre-LLM guard.
  - Fix approach:
    1. In `prepareRelease`, after the clean-tree check (step 2) and before
       resolving strategy preconditions (step 3), load the persisted plan and
       throw a typed `RELEASE_PLAN_EXISTS` error when one already exists. Place
       it before the LLM call so retries don't burn tokens.
    2. Add a `RELEASE_PLAN_EXISTS` case to `packages/cli/src/commands/release-errors.ts`
       with an actionable recovery hint pointing at `gw release finish` / abort.
    3. Cover the new formatter case in `packages/cli/__tests__/release-errors.test.ts`.
    4. Add an integration test in
       `packages/core/__tests__/integration/release-prepare.test.ts` that runs
       two `prepareRelease` calls in a row and asserts the second throws
       `RELEASE_PLAN_EXISTS` without overwriting the on-disk plan.
