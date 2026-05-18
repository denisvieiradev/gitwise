---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/cli/src/commands/release.ts
line: 87
severity: high
author: claude-code
provider_ref:
---

# Issue 003: workspacePropagation never enabled at any applyRelease caller

## Review Comment

`packages/core/src/commands/release.ts` defines `ApplyReleaseOptions.workspacePropagation` (line 40) and implements `propagateVersionToWorkspaces()` (lines 287–307) precisely to satisfy ADR-005's locked-version monorepo guarantee. But none of the call sites enable the flag:

- `packages/cli/src/commands/release.ts:87-90` — `applyRelease(plan, { cwd, createGhRelease: opts.ghRelease })` (no `workspacePropagation`).
- `packages/skills/scripts/release.ts:57` — `applyRelease(plan, { cwd, createGhRelease: !noGhRelease })` (no `workspacePropagation`).

The default is `false` (line 204: `workspacePropagation = false`). So when gitwise dogfoods `gw release` on itself (per the development sequence in `_techspec.md` step 17, and ADR-005's stated goal), only the root `package.json` will bump; `packages/core/package.json`, `packages/cli/package.json`, and `packages/skills/package.json` will be left at the previous version. The published npm packages will mismatch the root version on every release.

Suggested fix: detect a workspace root automatically (e.g., presence of `workspaces` array in root `package.json`, or presence of a `packages/` directory containing `package.json` files) and enable `workspacePropagation` by default in that case. Add a `--no-workspace-propagation` escape hatch. Wire the same default into both `packages/cli/src/commands/release.ts` and `packages/skills/scripts/release.ts`. A unit test in `packages/core/__tests__/unit/commands/release.test.ts` should assert that `applyRelease({ workspacePropagation: true })` actually writes every `packages/*/package.json`.

## Triage

- Decision: `VALID`
- Root cause: `packages/cli/src/commands/release.ts:87` invoked `applyRelease(plan, { cwd, createGhRelease: opts.ghRelease })` without `workspacePropagation`. Because `ApplyReleaseOptions.workspacePropagation` defaults to `false` in `packages/core/src/commands/release.ts:204`, dogfooding `gw release` against the gitwise monorepo bumped only the root `package.json` and left `packages/*/package.json` stale. The core layer already implements correct propagation behavior (and is exercised by `packages/core/__tests__/unit/commands/release.test.ts:205-283`), so the defect lived entirely in the CLI default — not in core.
- Fix approach: auto-detect whether `cwd` is a workspace root and default `workspacePropagation` to that detection result. Detection looks for a `workspaces` array in the root `package.json`, falling back to scanning `packages/*/package.json`. Added a `--no-workspace-propagation` Commander flag so users can opt out (Commander parses `--no-X` as `opts.X = true` by default, `false` when supplied, which lets us treat `false` as an explicit override and otherwise auto-detect).

## Resolution

- Edited `packages/cli/src/commands/release.ts`:
  - Added `detectWorkspaceRoot(cwd)` helper using `node:fs/promises` (`readFile` for the root `package.json` `workspaces` array; `readdir` + `access` fallback for a `packages/*/package.json` layout).
  - Registered `--no-workspace-propagation` on the Commander command and extended the action signature with `workspacePropagation: boolean`.
  - Computed the effective flag as `opts.workspacePropagation === false ? false : await detectWorkspaceRoot(cwd)` and forwarded it into `applyRelease`.
- Added a regression assertion in `packages/cli/__tests__/commands.test.ts` confirming `--no-workspace-propagation` is registered (matches the existing option-registration test style for this file).
- The companion call site at `packages/skills/scripts/release.ts:57` exhibits the same defect, but `packages/skills/scripts/release.ts` is outside this batch's code-file scope (`packages/cli/src/commands/release.ts` only). The fix there is not strictly required to keep `gw release` correct, so it is left to a follow-up review issue to keep this batch focused.
- Did not add a new core unit test because `packages/core/__tests__/unit/commands/release.test.ts` already asserts `applyRelease({ workspacePropagation: true })` writes every `packages/*/package.json` (`workspacePropagation: true updates packages/*/package.json` at line 205 and the 3-package integration test at line 268).

## Verification

- `npm test` (workspace root, all 3 projects): 19 suites, 249 tests passed, including the new `makeReleaseCommand registers --no-workspace-propagation option` case and the existing `workspacePropagation: true` core tests.
- `npm run typecheck` (workspace root): `tsc --noEmit` passes for `core`, `cli`, and `skills`.
