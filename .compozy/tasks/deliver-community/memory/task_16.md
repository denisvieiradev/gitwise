# Task Memory: task_16.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Harden `release.yml` with OIDC, npm provenance, SBOM, and signed tags. Update `release.ts` with `signTags: true` default and `--no-sign` escape hatch. **COMPLETED.**

## Important Decisions
- Subtasks 16.1–16.6 were already implemented in prior runs (release.yml and release.ts were complete).
- 16.7 SBOM smoke test added in `packages/cli/__tests__/sbom-smoke.test.ts`, guarded by `SBOM_SMOKE=1` env var to avoid downloading cdxgen on every CI run.
- `describe.skipIf` not available in jest 29; used `const describeIf = (cond) => cond ? describe : describe.skip` pattern.
- 6 tests in `release.test.ts` needed `signTags: false` added (they called `finishRelease` with `tagAndPush: true` but predated the `signTags: true` default).

## Learnings
- `workflow-release-hardened.test.ts` covers all 9 workflow-shape unit tests.
- `release-signing.test.ts` (core) covers all signTags unit/integration tests.
- `workflow-pinning.test.ts` covers SHA pinning including release.yml.
- Lockfile test flaky under parallel load (race condition in unit test itself) — pre-existing, unrelated to task_16.

## Files / Surfaces
- `.github/workflows/release.yml` — fully hardened (pre-existing in this branch)
- `packages/core/src/commands/release.ts` — signTags: true default, --no-sign warning (pre-existing)
- `packages/core/__tests__/unit/commands/release-signing.test.ts` — signTags tests (pre-existing)
- `packages/cli/__tests__/workflow-release-hardened.test.ts` — workflow shape tests (pre-existing)
- `packages/cli/__tests__/sbom-smoke.test.ts` — NEW: SBOM smoke integration test (added this run)
- `packages/core/__tests__/unit/commands/release.test.ts` — added `signTags: false` to 6 test calls that use tagAndPush: true

## Errors / Corrections
- `release.test.ts` had 6 tests failing because finishRelease/applyRelease with `tagAndPush: true` now defaults to `signTags: true`, requiring GPG. Fixed by adding `signTags: false` to those test calls.

## Ready for Next Run
Task complete. Diff ready for manual review (auto-commit disabled).
