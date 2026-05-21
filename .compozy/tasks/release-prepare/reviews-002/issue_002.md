---
provider: manual
pr:
round: 2
round_created_at: 2026-05-20T19:54:20Z
status: resolved
file: packages/core/src/commands/release-plan.ts
line: 59
severity: high
author: claude-code
provider_ref:
---

# Issue 002: `loadReleasePlan` only validates `schema`; other fields are unchecked

## Review Comment

`loadReleasePlan` (`packages/core/src/commands/release-plan.ts:39-70`)
checks JSON parseability and then `schema === 1` — and that's it:

```ts
const schema = (parsed as { schema?: unknown } | null)?.schema;
if (schema !== 1) {
  throw Object.assign(new Error(…), { code: "INVALID_PLAN_SCHEMA" });
}
return parsed as PersistedReleasePlan;
```

Every other required field (`strategy`, `targetBranch`, `newVersion`,
`currentVersion`, `releaseBranchCreated`, `notes`, `commits`, `tokens`,
…) is trusted via an unchecked cast. A plan that round-trips
`JSON.parse` but is missing or has the wrong type for any of those fields
flows straight into `finishRelease` / `abortRelease`, which then crash
with cryptic downstream errors:

- `strategy === undefined` → `createReleaseStrategy(plan.strategy)` at
  `release.ts:558` returns `undefined`, so `strategy.requiresDevelop()`
  throws `TypeError: Cannot read properties of undefined (reading
  'requiresDevelop')`.
- `targetBranch === undefined` → `STALE_PLAN_BRANCH_MISMATCH` claims the
  plan targets `"undefined"`, which is misleading.
- `newVersion === undefined` → the tag becomes `vundefined` and the notes
  path becomes `.gitwise/release-undefined.md`. The user sees `ENOENT:
  release-undefined.md` from the `readFile` at `release.ts:651` after
  the plan has already been deleted (ADR-003 plan-first delete).

Reachable scenarios:

1. A user opens `.gitwise/release-plan.json` to inspect it ("do not edit"
   is documented but not enforced) and accidentally truncates or removes
   a field.
2. A future schema bump lands `schema: 1` content alongside a renamed
   field — the validator passes a half-migrated payload through.
3. A partial write from a crash mid-`saveReleasePlan` (writeJSON isn't
   atomic — `packages/core/src/infra/filesystem.ts:18-22` writes the
   final path directly, no temp-file + rename) lands a truncated JSON
   blob that happens to parse if the truncation falls after a value.

The fix is a narrow shape check before the cast:

```ts
function isPersistedReleasePlan(v: unknown): v is PersistedReleasePlan {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    p.schema === 1 &&
    (p.strategy === "gitflow" || p.strategy === "github-flow") &&
    typeof p.currentVersion === "string" &&
    typeof p.newVersion === "string" &&
    typeof p.targetBranch === "string" &&
    typeof p.releaseBranchCreated === "boolean" &&
    typeof p.notes === "string"
    // plus the other required fields
  );
}
```

Throw `INVALID_PLAN_SCHEMA` (existing typed code, already wired into
`release-errors.ts`) when the predicate fails — that keeps the error
contract unchanged and the CLI hint already says "Run `gw release abort`
to discard it, then `gw release prepare` again."

Tests: extend `release-plan.test.ts` with cases that build a JSON file
with `schema: 1` but each individual required field missing /
wrong-typed and assert `INVALID_PLAN_SCHEMA` is thrown — current
coverage only exercises the literal `schema` field.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed against `packages/core/src/commands/release-plan.ts:39-70`: only
    `schema === 1` is validated, every other field on `PersistedReleasePlan`
    is cast unchecked. The downstream crash scenarios in the report are
    reachable — e.g., `strategy` is fed into `createReleaseStrategy` and
    `newVersion` is interpolated into tag names and `.gitwise/release-*.md`
    paths.
  - Root cause: lack of a shape check after `JSON.parse`. A partial /
    hand-edited / future-migration payload that happens to parse and still
    carries `schema: 1` is treated as valid.
  - Fix: add a typed `isPersistedReleasePlan` predicate validating every
    required field (including `suggestedBump`, `changelog`, `commits`,
    `preparedAt`, `baseCommit`, and the nested `tokens.input` /
    `tokens.output` numbers). When the predicate fails, throw the same
    typed `INVALID_PLAN_SCHEMA` error so the existing CLI hint
    (`gw release abort` → re-run `prepare`) keeps working unchanged.
  - Tests: extend
    `packages/core/__tests__/unit/commands/release-plan.test.ts` with
    cases for missing / wrong-typed required fields (including the
    `tokens` sub-object) and assert `INVALID_PLAN_SCHEMA` is thrown.
