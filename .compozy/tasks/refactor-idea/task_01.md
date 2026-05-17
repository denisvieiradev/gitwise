---
status: completed
title: Initialize monorepo skeleton with npm workspaces and shared configs
type: infra
complexity: medium
dependencies: []
---

# Task 1: Initialize monorepo skeleton with npm workspaces and shared configs

## Overview
Convert the repository root from a single-package layout into an npm workspaces monorepo that will host `packages/core`, `packages/cli`, and `packages/skills`. This task establishes the shared TypeScript, bundler, and test toolchain that every subsequent porting task depends on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- The root `package.json` MUST declare `"private": true` and `"workspaces": ["packages/*"]` and remove the existing `bin`, `main`, `files`, and runtime dependencies that belong to the per-package manifests instead.
- A shared `tsconfig.base.json` MUST be added at the repo root and the existing root `tsconfig.json` MUST extend it (or be retained only for IDE convenience while per-package `tsconfig.json` files extend the base).
- Shared build and test configuration MUST live at the root: a shared `tsup.config.ts` consumable by per-package overrides and a shared `jest.config.ts` that runs `--projects` across all `packages/*`.
- The Node engines field MUST require `node >= 18` and the existing `.nvmrc` MUST match.
- The empty `packages/` directory MUST be created and committed (with placeholder if needed) so subsequent tasks find it.
- Root scripts MUST be reworked to delegate to workspaces (`npm run -w packages/core build`, etc.) and a `build`, `test`, `lint`, and `typecheck` script MUST exist at the root that runs across all workspaces.
- `CONTRIBUTING.md` MUST be updated to describe the monorepo layout and how to add a new workspace.
- The change MUST NOT break the existing `src/` tree; that code keeps building under the old root tsconfig until later tasks migrate it (or it is removed by [[task_02]]).
</requirements>

## Subtasks
- [x] 1.1 Rewrite root `package.json` to be a private workspaces root with the new script surface (build/test/lint/typecheck delegated across workspaces).
- [x] 1.2 Add `tsconfig.base.json` with shared compiler options derived from the existing `tsconfig.json` and update the root `tsconfig.json` to extend it.
- [x] 1.3 Add a shared `tsup.config.ts` that exports a `defineConfig` helper packages can extend, and a `jest.config.ts` that aggregates per-package configs via `projects`.
- [x] 1.4 Create the `packages/` directory and any minimal `.gitkeep` needed to commit it.
- [x] 1.5 Update `CONTRIBUTING.md` to describe the workspaces layout, how to add a new package, and how scripts route through workspaces.
- [x] 1.6 Add or extend unit tests that exercise the shared `tsup.config.ts` helper (it MUST produce a valid config for a given package input).

## Implementation Details
This task does not yet move code into packages. It only wires the workspaces shell so that [[task_03]] can drop `packages/core` in cleanly. The shared `tsup.config.ts` is the export documented in TechSpec "Development Sequencing" step 1 — see that section for what each package will later consume.

The existing root files to edit are listed below. Per-package `package.json` files are added in their respective skeleton tasks, not here.

### Relevant Files
- `package.json` — currently a single-package manifest; convert to workspaces root.
- `tsconfig.json` — current single tsconfig that all source uses; will extend new base.
- `tsup.config.ts` — current single bundle config; replace with shared helper.
- `jest.config.ts` — current single test config; replace with projects-based config.
- `.nvmrc` — verify Node 18 is pinned.
- `CONTRIBUTING.md` — update for monorepo onboarding.
- `eslint.config.ts` — verify it still resolves files via the workspaces layout (no source moved yet, but lint scope should be ready).

### Dependent Files
- `src/**/*.ts` — must continue to compile against the root tsconfig until [[task_02]] removes deprecated parts and [[task_04]]–[[task_07]] migrate the rest into `packages/core`.
- `__tests__/**/*.ts` — must continue to run; the root jest config keeps a project entry pointing at the legacy tree for this transitional task only.

### Related ADRs
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — defines the workspaces layout this task realizes.

## Deliverables
- Root `package.json` converted to a private workspaces root with delegated scripts.
- `tsconfig.base.json` introduced and root `tsconfig.json` updated to extend it.
- Shared `tsup.config.ts` and `jest.config.ts` at the root.
- `packages/` directory created.
- `CONTRIBUTING.md` updated with monorepo onboarding section.
- Unit tests with 80%+ coverage for the shared `tsup.config.ts` helper **(REQUIRED)**.
- Integration test that runs `npm run -w` over an empty placeholder package and exits 0 **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Shared `tsup.config.ts` helper produces a valid config object when invoked with a sample package input.
  - [x] Shared `tsup.config.ts` helper merges per-package overrides (entry, outDir) on top of the defaults.
  - [x] `tsconfig.base.json` is a valid JSON file that defines `compilerOptions.target`, `module`, `moduleResolution`, `strict: true`, and `esModuleInterop: true`.
- Integration tests:
  - [x] `npm run build` from the repo root succeeds and produces no output for empty workspaces (placeholder OK).
  - [x] `npm test` from the repo root invokes Jest with the projects configuration and exits 0 with no test files present.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `npm install` from the root resolves workspaces without errors.
- `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck` execute from the root and route through workspaces.
- Existing `src/` and `__tests__/` continue to build and pass under the transitional config.
