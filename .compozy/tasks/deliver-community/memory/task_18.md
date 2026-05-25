# Task Memory: task_18.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Overhaul README.md: add CI/CodeQL/OSV-Scanner/provenance/version badges, four new H2 sections (Security, Supply Chain, Governance, Exit Codes), Reporting Issues callout, and a placeholder-resolution gate test. COMPLETED.

## Important Decisions
- `community-docs.test.ts` had a test asserting `TODO(community-launch)` IS present in GOVERNANCE.md; this test was removed as part of resolving the placeholder. Without removing it, the gate test and the old test would be in contradiction.
- Docs files live at `docs/src/content/docs/*.md` — README links use full paths (e.g. `docs/src/content/docs/supply-chain.md`).
- The GOVERNANCE.md placeholder was resolved by removing the TODO comment and adding a clear statement about GitHub Trust & Safety as the escalation path.
- Root-level `npm test` shows core suite failures due to pre-existing lockfile/tmp-dir concurrency interference; per-package runs are clean. Not a regression from this task.

## Files / Surfaces
- `README.md` — badge row (8 badges) + expanded Security + Supply Chain/Governance/Exit Codes/Reporting Issues sections
- `GOVERNANCE.md` — removed `TODO(community-launch)` comment; added escalation statement
- `packages/cli/__tests__/readme-content.test.ts` — NEW (20 tests)
- `packages/cli/__tests__/community-docs.test.ts` — removed 1 test that expected TODO to be in GOVERNANCE.md

## Status
COMPLETED. All 20 new tests pass. Docs build succeeds. No regressions in CLI suite.
