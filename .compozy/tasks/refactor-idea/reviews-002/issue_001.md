---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/skills/skills/pr.md
line: 9
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Round 1 fix for skill paths only applied to commit.md

## Review Comment

Round 1 issue 013 ("Skills invoke scripts via repo-relative paths that break outside the gitwise install dir") was marked resolved. The fix landed in `packages/skills/skills/commit.md`, which now invokes `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js"`. However, the other three skill manifests still use the original broken relative path:

- `packages/skills/skills/pr.md` lines 9, 16, 19 — `node packages/skills/dist/scripts/pr.js`
- `packages/skills/skills/release.md` lines 9, 16, 19 — `node packages/skills/dist/scripts/release.js`
- `packages/skills/skills/review.md` lines 9, 15 — `node packages/skills/dist/scripts/review.js`

When Claude Code installs the plugin and a user invokes `gitwise-pr` from any directory that is not the gitwise checkout, the relative path resolves to `<cwd>/packages/skills/dist/scripts/pr.js`, which does not exist. Only `gitwise-commit` survives the round 1 fix. Three of the four shipped skills are still broken in the field.

Suggested fix: replicate the commit.md treatment in pr.md, release.md, and review.md. Each occurrence of `packages/skills/dist/scripts/<name>.js` should become `"${CLAUDE_PLUGIN_ROOT}/dist/scripts/<name>.js"`, including the surrounding double quotes so paths with spaces survive Bash expansion. A `packages/skills/__tests__/skills.test.ts` assertion that every skill markdown uses `${CLAUDE_PLUGIN_ROOT}` would prevent this regression from recurring.

## Triage

- Decision: `VALID`
- Root cause: round 1 issue 013's fix only updated `commit.md`. `pr.md`, `release.md`, and `review.md` still invoke their runners via the bare repo-relative path `node packages/skills/dist/scripts/<name>.js`. When the plugin is installed and the user invokes a skill from a directory other than the gitwise checkout, the relative path resolves to a non-existent `<cwd>/packages/skills/dist/scripts/<name>.js` and the skill fails. The round 1 fix anchored `commit.md` on `${CLAUDE_PLUGIN_ROOT}`, which Claude Code sets to the plugin install dir; the other three skills need the same treatment.
- Fix: Replaced every `packages/skills/dist/scripts/<name>.js` occurrence in `pr.md` (3 occurrences), `release.md` (3 occurrences), and `review.md` (2 occurrences) with `"${CLAUDE_PLUGIN_ROOT}/dist/scripts/<name>.js"`, including the surrounding double quotes so install paths containing spaces survive Bash expansion. Pattern matches the commit.md baseline.
- Regression guard: Extended `packages/skills/__tests__/skills.test.ts` so each of the three skill suites now mirrors the commit.md assertions — one that requires `${CLAUDE_PLUGIN_ROOT}/dist/scripts/<name>.js` to be present, and one that forbids the bare `packages/skills/dist/scripts/<name>.js` form. The negative assertion will catch any future drift back to the broken pattern.
- Scope note: This issue's frontmatter lists `pr.md` as the primary file, but the review body identifies a single regression manifested in three skill manifests and prescribes a single fix that touches all three. Editing `release.md` and `review.md` in addition to `pr.md` was the minimum needed to resolve the underlying defect the reviewer flagged; leaving the other two unfixed would have made the "resolved" status inaccurate. Documented here per the scope-deviation requirement in the execution contract.
- Verification: Workspace `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` (root scripts that fan out to the workspaces) all pass; see verification block below for command output evidence.

## Verification Report

```
VERIFICATION REPORT
-------------------
Claim: lint, typecheck, jest, and build all pass after the skill manifest fixes and added regression assertions
Command: `npm --prefix /Users/denisvieiradev/Projects/dvm-group/gitwise run lint`, `... run typecheck`, `... test`, `... run build`
Executed: just now, after all changes
Exit code: 0 (all four)
Output summary:
  - lint: `tsc --noEmit` in gitwise, gitwise-core, gitwise-skills — no diagnostics
  - typecheck: `tsc --noEmit` in gitwise, gitwise-core, gitwise-skills — no diagnostics
  - jest: Test Suites: 19 passed, 19 total; Tests: 246 passed, 246 total; 0 failures
  - build: tsup builds for core/cli/skills succeeded; emitted dist/scripts/{commit,pr,review,release}.js
Warnings: ExperimentalWarning on `--experimental-vm-modules` (Jest VM Modules) — pre-existing, unrelated to this change
Errors: none
Verdict: PASS
```
