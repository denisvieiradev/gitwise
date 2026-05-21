---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/cli/src/commands/release.ts
line: 27
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: `detectWorkspaceRoot` duplicated verbatim between CLI and skills runner

## Review Comment

`detectWorkspaceRoot` is defined in two places with byte-identical logic:

- `packages/cli/src/commands/release.ts:27-53`
- `packages/skills/scripts/release.ts:38-63`

Both implementations read `package.json.workspaces`, fall back to probing `packages/*` for a nested `package.json`, and return a boolean. Same imports (`access`, `readFile`, `readdir`), same control flow, same error-swallowing pattern.

This is a clear drift risk: when one consumer's auto-detection needs to evolve (e.g., supporting pnpm's `pnpm-workspace.yaml`, deno workspaces, or `npm@10`'s globstar patterns that core's `expandWorkspacePatterns` already supports at `release.ts:1084`), the other will silently lag. The PRD's ADR-005 mentions workspace propagation as a first-class behavior — keeping detection logic in lockstep matters.

Note that `packages/core/src/commands/release.ts:1058-1102` already implements a more capable `readWorkspacePatterns` + `expandWorkspacePatterns` pair in core: it handles the yarn-object form, npm/pnpm array form, `!`-prefixed negations, and arbitrary globstar segments. The two consumer-side detectors are a strict subset of that logic and could be replaced by a thin core helper.

**Suggested fix**: extract `detectWorkspaceRoot(cwd: string): Promise<boolean>` into `packages/core/src/commands/release-plan.ts` (or a sibling utility module) and re-export from `packages/core/src/index.ts`. Update both call sites to import it. Tests live with the extracted helper, not duplicated in each consumer.

Implementation can be cheap: it's `(await readWorkspacePatterns(cwd)).length > 0 && (await expandWorkspacePatterns(...)).length > 0` — reusing logic core already owns.

## Triage

- Decision: `VALID`
- Root cause: `detectWorkspaceRoot` was added independently in both
  `packages/cli/src/commands/release.ts:27-53` and
  `packages/skills/scripts/release.ts:38-63` with byte-identical control flow.
  Core already owns the canonical workspace-pattern logic
  (`readWorkspacePatterns` + `expandWorkspacePatterns` at
  `packages/core/src/commands/release.ts:1124-1167`) which
  `propagateVersionToWorkspaces` uses for the actual bump. Two consumer-side
  detectors that lag behind core's pattern matching are a real drift risk.
- Fix approach: add an exported `detectWorkspaceRoot(cwd: string):
  Promise<boolean>` in `packages/core/src/commands/release.ts` (where the
  related private helpers already live), built on top of
  `readWorkspacePatterns` + `expandWorkspacePatterns` + a per-dir
  `package.json` probe so the detector agrees with
  `propagateVersionToWorkspaces` (true ↔ propagation would touch ≥1 dir).
  Re-export from `packages/core/src/index.ts`. Replace both consumer-side
  copies with `import { detectWorkspaceRoot } from
  "@denisvieiradev/gitwise-core"`. Cover the helper with unit tests in core
  so the regression is caught regardless of which consumer first probes a
  new layout (`apps/*`, yarn-object form, missing dirs, empty
  workspaces array, etc.).
- Out-of-scope files needed: this fix cannot land by editing only
  `packages/cli/src/commands/release.ts` — eliminating duplication requires
  edits to `packages/core/src/commands/release.ts`,
  `packages/core/src/index.ts`, `packages/skills/scripts/release.ts`, and
  the core test file `packages/core/__tests__/unit/commands/release.test.ts`.
  Changes outside the batch's CLI file are limited to the minimum needed to
  publish the core helper and switch the second call site.
- Notes:
  - Added `detectWorkspaceRoot(cwd)` in
    `packages/core/src/commands/release.ts` (next to the existing private
    `readWorkspacePatterns` / `expandWorkspacePatterns` it reuses) and
    re-exported it from `packages/core/src/index.ts`.
  - Replaced the duplicate implementations in
    `packages/cli/src/commands/release.ts:27-53` and
    `packages/skills/scripts/release.ts:38-63` with imports from
    `@denisvieiradev/gitwise-core`. The call sites
    (`cli/src/commands/release.ts:152-153,239-240` and
    `skills/scripts/release.ts:95-96,117-118`) keep the same
    `opts.workspacePropagation === false ? false : await detectWorkspaceRoot(cwd)`
    contract.
  - Removed the now-unused `node:fs/promises` (`access`, `readFile`,
    `readdir`) and `node:path` (`join`) imports from both consumer files.
  - Updated CLI tests that mock the core module
    (`packages/cli/__tests__/release-wiring.test.ts`,
    `packages/cli/__tests__/readme-doc-snippets.test.ts`) to expose
    `detectWorkspaceRoot` in the mock so the new import resolves.
  - Added 8 unit tests in
    `packages/core/__tests__/unit/commands/release.test.ts` covering:
    missing `package.json`, empty `packages/`, `packages/*` fallback, npm
    array form (`apps/*`), yarn-object form (`{ packages: ["libs/*"] }`),
    workspace arrays whose dirs lack `package.json`, and unparseable JSON.

## Verification

VERIFICATION REPORT
-------------------
Claim: typecheck + full test suite pass after extraction
Command: `npm run typecheck` then `npm test` (workspace root)
Executed: just now, after all changes (including core dist rebuild)
Exit code: 0
Output summary:
  - Typecheck: 3 workspaces, `tsc --noEmit` exit 0, no errors.
  - Tests: `Test Suites: 30 passed, 30 total` / `Tests: 492 passed, 492 total`
    across the cli, core, and skills jest projects.
  - Build: `npm run build` succeeds for all 3 workspaces (tsup ESM + DTS).
Warnings: none introduced by this change.
Errors: none.
Verdict: PASS
