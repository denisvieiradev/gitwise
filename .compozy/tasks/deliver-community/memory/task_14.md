# Task Memory: task_14.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Add `.github/workflows/osv-scanner.yml` and `osv-scanner.toml` with expiry-enforced ignore entries. Task complete.

## Important Decisions
- Used the **reusable workflow** approach (`osv-scanner-reusable.yml` / `osv-scanner-reusable-pr.yml`) instead of the bare `osv-scanner-action/action.yml`. The reusable workflows expose `fail-on-vuln: true` as an explicit input — satisfying the "assert via the action's input" test requirement.
- SHA for `google/osv-scanner-action` v2.3.8: `9a498708959aeaef5ef730655706c5a1df1edbc2`. This is the commit SHA returned by `gh api repos/google/osv-scanner-action/commits/v2.3.8`.
- `ignoreUntil` is the correct osv-scanner.toml field name (not `expires`).
- Expiry enforcement is a separate `check-ignore-expiry` job (runs first; scan jobs `needs: check-ignore-expiry`), so the scan never runs with a stale ignore file.
- TOML parsing in tests uses a line-scanner regex (no external TOML dep) — consistent with the pattern used in other workflow test files.

## Files / Surfaces
- `.github/workflows/osv-scanner.yml` — NEW
- `osv-scanner.toml` — NEW (repo root, empty scaffold)
- `packages/cli/__tests__/workflow-osv-scanner.test.ts` — NEW (23 tests)

## Errors / Corrections
- The unified workflow example in the osv-scanner-action repo uses an internal SHA (`3adb4b14a2b0623876d18d863a498b785fb3752d`) that differs from the v2.3.8 tag SHA. Used the tag SHA (`9a498708959aeaef5ef730655706c5a1df1edbc2`) per ADR-001 convention.

## Ready for Next Run
- task_15 (dependabot-auto-merge) gates on OSV-Scanner passing — can reference the SHA above.
- Manual step: enable OSV-Scanner as a required status check in GitHub repo settings (note in PR description).
