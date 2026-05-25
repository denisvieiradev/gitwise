# Task Memory: task_13.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Add CodeQL SAST workflow at `.github/workflows/codeql.yml` with init+analyze pair, two query suites, three triggers, least-privilege permissions, and all Action SHAs pinned.

## Important Decisions
- Both `codeql.yml` and `workflow-codeql.test.ts` were already present from a prior session when this task ran.
- The `github/codeql-action/init` and `github/codeql-action/analyze` SHA used: `03e4368ac7daa2bd82b3e85262f3bf87ee112f57` (v3).
- `actions/checkout` SHA reused from task_12: `34e114876b0b11c390a56381ad16ebd13914f8d5` (v4).

## Learnings
- The workflow-pinning integration test (`workflow-pinning.test.ts`) scans ALL `.github/workflows/*.yml` files, so any new workflow with non-SHA `uses:` lines would fail that existing test.
- The `workflow-codeql.test.ts` tests do not parse YAML as a structured object — they use regex/string matching. This is intentional: avoids a YAML parser dependency in the CLI test package.

## Files / Surfaces
- `.github/workflows/codeql.yml` — created (or already present)
- `packages/cli/__tests__/workflow-codeql.test.ts` — created (or already present)

## Errors / Corrections
None.

## Ready for Next Run
Task 13 is complete. All deliverables present, all 16 task-specific tests pass, workflow-pinning integration scan also passes (28 total tests). No auto-commit; diff is ready for manual review.
