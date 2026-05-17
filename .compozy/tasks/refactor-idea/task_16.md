---
status: completed
title: Rewrite README and docs for gitwise and draft devflow-cli deprecation banner
type: docs
complexity: low
dependencies:
  - task_13
  - task_14
---

# Task 16: Rewrite README and docs for gitwise and draft devflow-cli deprecation banner

## Overview
Replace the devflow-era README and supporting docs with gitwise-positioned content (four commands, dual install modes, privacy notes) and write the one-time deprecation banner text that the final devflow-cli release will print.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- The root `README.md` MUST be rewritten to describe gitwise (positioning, four commands, install paths, configuration, privacy, requirements). It MUST link to the PRD highlights and the four ADRs.
- The README MUST include explicit install snippets for both modes (`npm install -g @denisvieiradev/gitwise` and the Claude Code plugin install).
- The README MUST disclose the privacy posture (diffs sent to Claude; sensitive-file filter on by default).
- The README MUST document `.gitwise.json` schema (RepoConfig) and `~/.gitwise/config.json` schema (UserConfig) at a high level, with a pointer to detailed docs.
- A new file `docs/migrating-from-devflow.md` MUST be written, mapping every removed devflow command to either gitwise's equivalent or to "removed and why".
- A new file `docs/deprecation-banner.md` MUST contain the exact one-paragraph banner text the final devflow-cli release will print on every invocation, plus the recommended location to put it (e.g., a postinstall hook or a top-of-CLI guard).
- The existing `CONTRIBUTING.md` MUST be updated to remove devflow-specific references and reflect the gitwise monorepo workflow (extends [[task_15]]'s edits).
- `SECURITY.md` MUST be updated to reference the new package name, the sensitive-file filter, and the API-key storage location.
- `CHANGELOG.md` MUST be reset (or appended) with a "0.1.0 — gitwise refactor" entry that summarizes the rename and the dropped commands.
- A test MUST verify that the README contains required sections (Install, Commands, Privacy, Config) and that all internal links resolve.
</requirements>

## Subtasks
- [x] 16.1 Rewrite `README.md` with the gitwise positioning, install paths, command reference, privacy note, and config schema overview.
- [x] 16.2 Write `docs/migrating-from-devflow.md` mapping old commands to gitwise outcomes.
- [x] 16.3 Write `docs/deprecation-banner.md` containing the final devflow-cli banner text and placement notes.
- [x] 16.4 Update `CONTRIBUTING.md` and `SECURITY.md` to remove devflow references and reflect gitwise.
- [x] 16.5 Add a `0.1.0 — gitwise refactor` section to `CHANGELOG.md`.
- [x] 16.6 Add a documentation lint test that checks for required README sections and validates internal markdown links.

## Implementation Details
Pull positioning language from PRD "Overview", "Goals", and "User Stories". Pull the dropped-command list from PRD "Non-Goals (Out of Scope)" and TechSpec "Impact Analysis". The deprecation banner content matches ADR-001 Implementation Notes and the PRD risk mitigation.

### Relevant Files
- `README.md` — rewrite.
- `CONTRIBUTING.md` — update for gitwise.
- `SECURITY.md` — update.
- `CHANGELOG.md` — append the 0.1.0 entry.
- `docs/migrating-from-devflow.md` — new.
- `docs/deprecation-banner.md` — new.
- `.compozy/tasks/refactor-idea/_prd.md`, `_techspec.md`, `adrs/*.md` — referenced as link targets.

### Dependent Files
- No code dependents; this is documentation. Indirectly verifies that the install commands and `gw` invocations from earlier tasks are accurate.

### Related ADRs
- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](adrs/adr-001.md) — positioning and dropped commands.
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — package surface mentioned in README install instructions.

## Deliverables
- Rewritten `README.md`.
- New `docs/migrating-from-devflow.md` and `docs/deprecation-banner.md`.
- Updated `CONTRIBUTING.md`, `SECURITY.md`, and `CHANGELOG.md`.
- Docs lint test asserting required sections and link validity **(REQUIRED)**.
- Test coverage 80%+ on the docs lint helper **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Docs lint helper detects missing required README sections (`Install`, `Commands`, `Privacy`, `Configuration`).
  - [ ] Docs lint helper flags broken relative links in `README.md` and `docs/*.md`.
  - [ ] Docs lint helper passes against the actual rewritten `README.md`.
- Integration tests:
  - [ ] `docs/deprecation-banner.md` is non-empty and contains the new package name `@denisvieiradev/gitwise`.
  - [ ] `docs/migrating-from-devflow.md` includes an entry for each removed command (`init`, `prd`, `techspec`, `tasks`, `run-tasks`, `test`, `done`, `status`).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The rewritten README accurately describes the four-command gitwise product and the two install modes.
- The migration guide covers every removed devflow command.
- The deprecation banner text is ready to copy into the final devflow-cli release.
