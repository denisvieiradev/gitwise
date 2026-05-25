# Task Memory: task_15.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Create `.github/workflows/dependabot-auto-merge.yml` that auto-merges Dependabot npm patch/minor PRs after all required checks pass, excluding github-actions ecosystem and major bumps.

## Important Decisions
- Omitted `actions/checkout` step from the workflow — `dependabot/fetch-metadata` reads metadata via API (no checkout needed), and `gh pr merge` also works without checkout. Reduces attack surface and action count.
- Used `pull_request` (not `pull_request_target`) as trigger. With explicit `permissions: contents: write`, Dependabot PRs get write access in modern GitHub Actions.
- `gh pr merge --auto --squash` is the merge command: `--auto` delegates enforcement to branch protection required checks (CI + CodeQL + OSV-Scanner). The merge only executes after all required checks pass.
- Condition uses `>-` folded scalar for multi-line if: expression — YAML folds newlines to spaces, result is valid GitHub Actions expression syntax.

## Learnings
- `dependabot/fetch-metadata@v3.1.0` SHA: `25dd0e34f4fe68f24cc83900b1fe3fe149efef98`
- `package-ecosystem` output from fetch-metadata returns the ecosystem as declared in `dependabot.yml`, e.g., `github-actions` (with hyphen, not underscore).
- Test pattern: structural unit tests (YAML text assertions) + logic integration tests (helper function simulating conditions) + contract tests (YAML references expected variables).

## Files / Surfaces
- `.github/workflows/dependabot-auto-merge.yml` — NEW
- `packages/cli/__tests__/workflow-auto-merge.test.ts` — NEW (32 tests)

## Errors / Corrections
- ESLint `npm run lint` fails with "jiti library required" — pre-existing infrastructure issue (ESLint 9 + TypeScript config). Not caused by this task.

## Ready for Next Run
Task complete. 32 tests pass. Workflow SHA-pinning verified. Diff staged for manual commit.
