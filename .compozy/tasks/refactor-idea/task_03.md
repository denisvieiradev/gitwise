---
status: completed
title: Create packages/core skeleton with build and test wiring
type: infra
complexity: low
dependencies:
  - task_01
---

# Task 3: Create packages/core skeleton with build and test wiring

## Overview
Establish the `@denisvieiradev/gitwise-core` package with an empty but buildable shape so subsequent porting tasks have a target directory tree, a working `index.ts`, and per-package test/build configs. This task ships no product logic; it just lays the slab.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- A `packages/core/` directory MUST be created with `package.json`, `tsconfig.json` (extending `tsconfig.base.json`), `tsup.config.ts`, `__tests__/`, and `src/index.ts`.
- The package name in `package.json` MUST be `@denisvieiradev/gitwise-core`, `type` MUST be `"module"`, `engines.node` MUST be `">=18"`, and an explicit `files` field MUST list only the published artifacts (`dist`, `templates`, `README.md`, `LICENSE`).
- An `exports` map MUST be defined with at minimum a root entry and a `./testing` subpath entry (used in [[task_05]] for `MockLLMProvider`).
- The package MUST be wired into the root workspaces and the root jest projects array.
- `src/index.ts` MUST export a placeholder `version` constant (read from `package.json`) and re-export a `__placeholder__` symbol that will be replaced by real exports in later tasks.
- The build MUST succeed via `npm run -w packages/core build` producing `dist/index.js`, `dist/index.d.ts`, and the `testing` subpath build outputs.
- The `templates/` directory MUST be created (empty for now; [[task_06]] populates it) and listed under `package.json` `files`.
- A `packages/core/README.md` stub MUST exist describing the package purpose in one paragraph.
</requirements>

## Subtasks
- [x] 3.1 Create `packages/core/package.json` with the name, version (matching root), `type: "module"`, `exports`, `files`, `engines`, and minimal `dependencies` (real deps land in subsequent port tasks).
- [x] 3.2 Create `packages/core/tsconfig.json` extending `../../tsconfig.base.json` with `rootDir: "src"` and `outDir: "dist"`.
- [x] 3.3 Create `packages/core/tsup.config.ts` consuming the shared helper from [[task_01]] with entries for `src/index.ts` and `src/testing/index.ts`.
- [x] 3.4 Create `packages/core/src/index.ts` exporting a `version` constant and a placeholder export.
- [x] 3.5 Create `packages/core/__tests__/index.test.ts` and `packages/core/templates/.gitkeep`.
- [x] 3.6 Register the package in the root jest projects array and verify `npm install` from the root links the workspace.

## Implementation Details
Reference TechSpec "Development Sequencing" step 2 for the order this fits into and "Component Overview" diagram for the directory shape (`commands/`, `providers/`, `infra/`, `config/`, `template/`, `testing/`). Only the top-level files and `src/index.ts` ship here; module subdirectories are created by their respective porting tasks.

### Relevant Files
- `packages/core/package.json` — new.
- `packages/core/tsconfig.json` — new, extends the base from [[task_01]].
- `packages/core/tsup.config.ts` — new, consumes the shared helper.
- `packages/core/src/index.ts` — new stub.
- `packages/core/__tests__/index.test.ts` — new stub.
- `packages/core/templates/.gitkeep` — new, ensures the directory is committed.
- `packages/core/README.md` — new stub.

### Dependent Files
- Root `package.json` — workspaces glob already covers `packages/*` from [[task_01]]; verify `npm install` resolves the new package.
- Root `jest.config.ts` — adds `packages/core` to the projects array.

### Related ADRs
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — names the package and its export surface.
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — informs the public API placeholder shape.

## Deliverables
- `packages/core/` directory with `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/index.ts`, `templates/`, and `__tests__/`.
- Root workspaces resolve the new package successfully.
- Unit tests with 80%+ coverage on the index stub **(REQUIRED)**.
- Integration test confirming the package builds and exports the `version` constant **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `version` constant exported from `@denisvieiradev/gitwise-core` matches the package.json version.
  - [ ] The package's `exports` map exposes both the root entry and the `./testing` subpath.
- Integration tests:
  - [ ] `npm run -w packages/core build` produces `dist/index.js` and `dist/index.d.ts`.
  - [ ] `npm run -w packages/core test` exits 0.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `packages/core` builds and tests succeed in isolation.
- Root `npm install` links the workspace and produces no warnings.
