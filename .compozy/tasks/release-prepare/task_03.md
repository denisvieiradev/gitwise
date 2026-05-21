---
status: completed
title: Implement ReleaseStrategy module
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 03: Implement ReleaseStrategy module

## Overview
Create a brand-new `packages/core/src/strategies/release.ts` file containing the `ReleaseStrategy` interface, two stateless implementations (`github-flow`, `gitflow`), and the `createReleaseStrategy(name)` factory. This is a narrow strategy abstraction scoped exclusively to release behavior — branch naming, merge targets, and develop-branch requirement — per ADR-002.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define `ReleaseStrategyName = "github-flow" | "gitflow"` as a closed string union.
- MUST define and export the `ReleaseStrategy` interface as specified in TechSpec → Implementation Design → Core Interfaces.
- MUST provide a `createReleaseStrategy(name: ReleaseStrategyName): ReleaseStrategy` factory that returns a pre-built singleton for each name.
- MUST NOT introduce `BranchType`, `MergeMethod`, `PRTarget`, or any other surface beyond what the release lifecycle needs (ADR-002).
- MUST treat strategies as stateless — the factory hands out the same instance per name.
- `github-flow` MUST return `releaseBranchFor(...) === null`, `mergeTargets("main") === ["main"]`, and `requiresDevelop() === false`.
- `gitflow` MUST return `releaseBranchFor(v) === "release/" + v`, `mergeTargets("main", "develop") === ["main", "develop"]` in that order, and `requiresDevelop() === true`.
- MUST re-export `ReleaseStrategy`, `ReleaseStrategyName`, and `createReleaseStrategy` from `packages/core/src/index.ts`.
</requirements>

## Subtasks
- [x] 3.1 Create the new file with the interface, two implementations, and the factory.
- [x] 3.2 Wire the public re-exports through `packages/core/src/index.ts`.
- [x] 3.3 Add unit tests for each strategy method and the factory.
- [x] 3.4 Verify the file size stays around the ~80 lines target indicated in ADR-002.

## Implementation Details
Create `packages/core/src/strategies/release.ts`. The directory is brand new — the build map confirms no existing `strategies/` folder. See TechSpec → Implementation Design → Core Interfaces for the exact interface shape; do not duplicate it here. Strategies are stateless singletons: implement them as frozen objects rather than classes if it keeps the file shorter, but classes are also acceptable.

### Relevant Files
- `packages/core/src/strategies/release.ts` — New file with interface, impls, and factory.
- `packages/core/src/index.ts` — Add public re-exports next to the existing release exports.
- `packages/core/src/config/types.ts` (from task_01) — `RepoConfig.releaseStrategy` must use the same string union.

### Dependent Files
- `packages/core/src/commands/release.ts` (task_05, task_06, task_07) — Will call `createReleaseStrategy` from the lifecycle functions.
- `packages/core/src/commands/release-plan.ts` (task_04) — Imports `ReleaseStrategyName` for the persisted plan type.

### Related ADRs
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — Establishes the narrow interface chosen for this task.
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Defines the lifecycle the strategy serves.

## Deliverables
- `packages/core/src/strategies/release.ts` exporting the interface, two impls, and the factory.
- Public re-exports added to `packages/core/src/index.ts`.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for factory selection **(REQUIRED — covered by a unit-style integration test that loads `RepoConfig` and resolves a strategy)**

## Tests
- Unit tests:
  - [x] `createReleaseStrategy("github-flow").releaseBranchFor("1.2.0")` returns `null`.
  - [x] `createReleaseStrategy("github-flow").mergeTargets("main", "develop")` returns `["main"]` (develop ignored).
  - [x] `createReleaseStrategy("github-flow").requiresDevelop()` is `false`.
  - [x] `createReleaseStrategy("gitflow").releaseBranchFor("1.2.0")` returns `"release/1.2.0"`.
  - [x] `createReleaseStrategy("gitflow").mergeTargets("main", "develop")` returns `["main", "develop"]` in that order.
  - [x] `createReleaseStrategy("gitflow").requiresDevelop()` is `true`.
  - [x] `createReleaseStrategy("github-flow")` returns the same singleton across calls (reference equality).
  - [x] `createReleaseStrategy("gitflow")` returns the same singleton across calls.
- Integration tests:
  - [x] Load a `RepoConfig` with `releaseStrategy: "gitflow"` and assert `createReleaseStrategy(cfg.releaseStrategy)` resolves to the gitflow singleton.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Interface, both impls, and factory exported from `packages/core` and consumable by downstream tasks.
- File size around 80 lines, no unrelated surface introduced.
