# Task Memory: task_12.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Configure Dependabot + pin all GitHub Actions in existing workflows to commit SHAs. Prerequisite for task_15 (auto-merge) and task_16 (OIDC release pipeline).

## Important Decisions
- Used `gh api repos/actions/<name>/commits/<tag> --jq .sha` to resolve SHAs (returns commit SHA directly, not tag-object SHA).
- Placed enforcement test in `packages/cli/__tests__/workflow-pinning.test.ts` (not root-level) to match existing security-docs test pattern.
- Did not add `js-yaml` — used string/regex assertions matching existing test patterns. `js-yaml` is in node_modules transitively but has no `@types` package.
- `expect(value, message)` two-argument form is unsupported in Jest 29 TypeScript types; switched to violation-array pattern.

## Files / Surfaces
- `.github/dependabot.yml` — NEW
- `.github/workflows/ci.yml` — pinned `actions/checkout@v4` and `actions/setup-node@v4`
- `.github/workflows/release.yml` — pinned same (SHA-pinning only, no other changes)
- `packages/cli/__tests__/workflow-pinning.test.ts` — NEW (12 tests, all pass)

## Learnings
- `actions/checkout@v4` → SHA `34e114876b0b11c390a56381ad16ebd13914f8d5` (as of 2026-05-22)
- `actions/setup-node@v4` → SHA `49933ea5288caeca8642d1e84afbd3f7d6820020` (as of 2026-05-22)
- Root `npm test` has pre-existing project-mode suite failures (core suites fail under root jest project discovery). Running `npm run -w packages/core test` passes 33 suites / 493 tests.

## Errors / Corrections
None.

## Ready for Next Run
Task complete. Diff is staged for manual review (auto-commit disabled). tasks_13, 14, 15 can now follow the same SHA-pinning convention for new workflows.
