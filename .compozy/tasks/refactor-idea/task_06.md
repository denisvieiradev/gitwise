---
status: completed
title: Port template engine and bundled templates with 3-level precedence
type: refactor
complexity: medium
dependencies:
    - task_02
    - task_04
---

# Task 6: Port template engine and bundled templates with 3-level precedence

## Overview
Move the template loader and the kept prompt templates into `packages/core/`, drop deprecated templates, add a new `review.md` template extracted from the existing inline review prompt, and implement a 3-level precedence chain (repo → user-global → core-bundled).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `src/core/template.ts` MUST be ported into `packages/core/src/template/loader.ts` and split, if useful, into `loader.ts` and `interpolate.ts` to match TechSpec "Component Overview".
- The carry-over templates `commit.md`, `pr.md`, `release-changelog.md`, `release-notes.md`, and `release-version.md` MUST move from `templates/` to `packages/core/templates/`.
- A new `review.md` template MUST be authored from the inline review prompt that currently lives in `src/cli/commands/review.ts`; the inline string MUST be deleted in [[task_09]].
- The 3-level template lookup MUST resolve in order: `<repo>/.gitwise/templates/<name>.md`, then `~/.gitwise/templates/<name>.md`, then the bundled `packages/core/templates/<name>.md`.
- The `{{variable}}` interpolation engine MUST be preserved exactly as in the existing implementation.
- A `templatesPath` override (from `RepoConfig.templatesPath` in TechSpec Data Models) MUST be honored as an alternative to `~/.gitwise/templates`.
- Missing-template fallback MUST be deterministic and well-tested.
- Existing tests under `__tests__/unit/core/template.test.ts` MUST be relocated and expanded to cover the new precedence rules and the new `review.md` shape.
- The legacy `src/core/template.ts` and the deprecated templates MUST be deleted (the deprecated ones were already removed by [[task_02]]; this task verifies they are gone and removes the legacy loader).
</requirements>

## Subtasks
- [ ] 6.1 Port the template loader into `packages/core/src/template/`, optionally splitting into `loader.ts` and `interpolate.ts`.
- [ ] 6.2 Move kept templates (`commit.md`, `pr.md`, `release-changelog.md`, `release-notes.md`, `release-version.md`) into `packages/core/templates/`.
- [ ] 6.3 Author a new `review.md` template extracted from the existing inline review prompt.
- [ ] 6.4 Implement the 3-level lookup order with the `templatesPath` override.
- [ ] 6.5 Move template tests to `packages/core/__tests__/unit/template/` and add cases for precedence and override.
- [ ] 6.6 Delete the legacy `src/core/template.ts` and verify the top-level `templates/` directory is empty (then delete it).

## Implementation Details
Reference TechSpec "Implementation Design → Data Models" for `RepoConfig.templatesPath` and "Implementation Notes" decision block on the 3-level precedence. The interpolation engine is described in the existing `src/core/template.ts`; do not re-design.

### Relevant Files
- `src/core/template.ts` — port and split.
- `templates/{commit,pr,release-changelog,release-notes,release-version}.md` — move under `packages/core/templates/`.
- `src/cli/commands/review.ts` — read its inline review prompt (do NOT modify here; [[task_09]] removes the inline string after the new template lands).
- `__tests__/unit/core/template.test.ts` — relocate and expand.

### Dependent Files
- `packages/core/src/index.ts` — exports `loadTemplate(name, context)` and the interpolation helper.
- All four command implementations ([[task_08]]–[[task_11]]) consume `loadTemplate`.

### Related ADRs
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — establishes that templates ship in core.

## Deliverables
- Template loader ported into `packages/core/src/template/`.
- Five carry-over templates moved to `packages/core/templates/`.
- New `review.md` template authored.
- Top-level `templates/` directory removed.
- Legacy `src/core/template.ts` removed.
- Unit tests with 80%+ coverage on loader and interpolation **(REQUIRED)**.
- Integration test asserting the 3-level lookup order against a temp filesystem **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `loadTemplate("commit", ctx)` returns the bundled template content when no overrides exist.
  - [ ] `loadTemplate("commit", ctx)` returns the user-global override when `~/.gitwise/templates/commit.md` exists.
  - [ ] `loadTemplate("commit", ctx)` returns the repo-level override when `<repo>/.gitwise/templates/commit.md` exists, taking precedence over the user-global one.
  - [ ] `loadTemplate("commit", ctx, { templatesPath })` uses the configured directory in place of the user-global default.
  - [ ] `loadTemplate("missing")` throws a typed `TEMPLATE_NOT_FOUND` error.
  - [ ] Interpolation replaces `{{var}}` placeholders using the supplied context object.
  - [ ] Interpolation leaves unknown placeholders untouched (or throws — match existing behavior; assert whichever it is).
  - [ ] The new `review.md` template contains the section headers `Critical`, `Suggestions`, `Nitpicks` (these structure the parsed output expected by [[task_09]]).
- Integration tests:
  - [ ] Against a `mkdtemp` filesystem populated with all three levels, the loader resolves to the repo-level file.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `loadTemplate` produces identical output for each kept template name as the pre-port loader did, with the 3-level chain wired in.
- `review.md` exists and is referenced (by name) in the test that asserts loadable templates.
