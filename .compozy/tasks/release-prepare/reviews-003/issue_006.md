---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/cli/src/commands/release.ts
line: 304
severity: low
author: claude-code
provider_ref:
---

# Issue 006: CLI `runAbort` uses an unnecessary dynamic import of `loadReleasePlan`

## Review Comment

`packages/cli/src/commands/release.ts:304` reaches for `loadReleasePlan` through a dynamic import:

```ts
const { loadReleasePlan } = await import("@denisvieiradev/gitwise-core");
const plan = await loadReleasePlan(cwd);
```

…even though the same file already statically imports several named exports from the same package at the top (line 5–13: `prepareRelease`, `finishRelease`, `abortRelease`, `runReleaseInProcess`, etc.). `loadReleasePlan` is also exported from core's `index.ts` and used statically by tests under `packages/cli/__tests__/release-wiring.test.ts`.

The dynamic import buys nothing here: bundle splitting isn't a concern in a CLI binary, the function isn't lazy-loaded for cost reasons, and the surrounding `try/catch` is wide enough to handle both module-resolution and `loadReleasePlan` failures regardless of import style. It just makes the dependency harder to see at a glance and surfaces module-not-found errors at runtime instead of at type-check / build time.

**Suggested fix**: hoist the import to the top of the file:

```ts
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  prepareRelease,
  finishRelease,
  abortRelease,
  loadReleasePlan,
  runReleaseInProcess,
} from "@denisvieiradev/gitwise-core";
```

…and drop the `await import(...)` line. Net: -1 line, clearer dependency graph.

## Triage

- Decision: `valid`
- Notes:
  - Confirmed `loadReleasePlan` is exported from `packages/core/src/index.ts:62`, alongside the other named exports already imported statically at `packages/cli/src/commands/release.ts:5-14`.
  - The `await import("@denisvieiradev/gitwise-core")` inside `runAbort` provides no lazy-loading benefit (CLI binary, no bundle splitting) and hides the dependency from static analysis.
  - Test harness already mocks `loadReleasePlan` on the core module (`packages/cli/__tests__/release-wiring.test.ts:11,35` and `packages/cli/__tests__/readme-doc-snippets.test.ts:51`), so a static import resolves to the mock under `jest.unstable_mockModule` exactly as it did via dynamic import.
  - Fix: added `loadReleasePlan` to the existing top-of-file named import block and removed the dynamic `await import` line inside `runAbort` (`packages/cli/src/commands/release.ts`). Net -1 line, clearer dependency graph.

## Verification

- `npm run typecheck` — all three workspaces typecheck (`tsc --noEmit` x3, no errors).
- `npm run build` — full workspace build succeeded (tsup ESM + DTS, exit 0).
- `npm test` — 30 test suites, 494 tests passed.
- `npm run lint` — fails with a pre-existing tooling error ("outdated 'jiti' library" while loading the TypeScript `eslint.config.ts`); reproducible on `main` independent of this change, not caused by it. Not in scope for this batch.
