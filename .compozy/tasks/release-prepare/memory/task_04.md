# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Complete. New module `packages/core/src/commands/release-plan.ts` ships `PersistedReleasePlan` + `saveReleasePlan` / `loadReleasePlan` / `deleteReleasePlan` / `ensureGitignored`, all re-exported from the core barrel.

## Important Decisions

- Malformed JSON in the plan file throws with `code: "INVALID_PLAN_JSON"` (distinct from `INVALID_PLAN_SCHEMA`). The task only required "a typed error" for the JSON case, but a separate code lets the CLI render targeted recovery hints without parsing error messages.
- `loadReleasePlan` also rejects `null`/non-object JSON with `INVALID_PLAN_SCHEMA` (covered by `schema !== 1`), so the integrity check is single-pronged for everything that's syntactically valid JSON.
- `ensureGitignored` derives wildcard candidates from `dirname(entry)`, producing `<dir>/` and `<dir>/*`. For `.gitwise/release-plan.json` that's exactly the two patterns called out in the spec, and the same helper generalises to other entries without per-call wiring.
- Lines starting with `#` are skipped during coverage detection so a commented-out entry does not falsely block the append.

## Learnings

- `writeJSON` from `infra/filesystem.ts` already runs `ensureDir(dirname(path))`, so save callers do not need an extra `ensureDir`.
- Core jest config has `roots: ["<rootDir>/__tests__"]`, so a new `__tests__/integration/` folder is picked up automatically — no jest config change needed.
- `info()` writes to stdout; tests spy on `console.log` to assert the notice fires (and importantly does NOT fire on the no-op branches).

## Files / Surfaces

- `packages/core/src/commands/release-plan.ts` (new)
- `packages/core/src/index.ts` (re-exports added)
- `packages/core/__tests__/unit/commands/release-plan.test.ts` (new)
- `packages/core/__tests__/integration/release-plan.test.ts` (new)

## Errors / Corrections

None.

## Ready for Next Run

- task_05 (`prepareRelease`) can `import { saveReleasePlan, ensureGitignored, type PersistedReleasePlan } from "./release-plan.js"`; the module has no git/LLM deps so it imports cleanly from inside `commands/release.ts` without creating cycles (release-plan.ts only `import type`s from release.ts for `BumpType`).
- The `.gitignore` notice ("Added <entry> to .gitignore") goes through `info()` — if the CLI later wants it suppressed in non-TTY mode, that is a logger concern, not a release-plan one.
