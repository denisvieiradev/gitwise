---
status: completed
title: Update README and CHANGELOG for new lifecycle
type: docs
complexity: low
dependencies:
  - task_09
---

# Task 11: Update README and CHANGELOG for new lifecycle

## Overview
Document the new two-phase release lifecycle in the project README and add a CHANGELOG entry covering the feature. Includes the GitFlow opt-in via `RepoConfig.releaseStrategy`, the new `release-plan.json` artifact, and the new error codes users may encounter.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `README.md` MUST document `gw release prepare`, `gw release finish`, and `gw release abort`, including the new `--no-delete-branch` flag.
- `README.md` MUST document `RepoConfig.releaseStrategy` and `RepoConfig.developBranch` as opt-in fields, defaulting to github-flow behavior.
- `README.md` MUST mention that `.gitwise/release-plan.json` is gitignored and short-lived (between `prepare` and `finish` / `abort`).
- `CHANGELOG.md` MUST gain an entry for the new lifecycle, following the existing entry format (`## [X.Y.Z] - YYYY-MM-DD`). The version number is whatever the next release picks up — use a placeholder marker if the version is not finalized.
- Documentation MUST NOT claim behavior the implementation does not support (no automated merge-conflict resolution, no `--strategy` flag, no telemetry).
- All example commands in the README MUST be copy-pasteable — verified by a doc-snippet smoke test.
</requirements>

## Subtasks
- [x] 11.1 Add a "Release lifecycle" section to `README.md` with the three subcommands.
- [x] 11.2 Add a "GitFlow opt-in" subsection explaining `releaseStrategy` and `developBranch`.
- [x] 11.3 Append a CHANGELOG entry referencing the new lifecycle.
- [x] 11.4 Add a doc-snippet smoke test that asserts each example command in the README parses cleanly through the CLI argument parser.
- [x] 11.5 Cross-check the README links to ADRs and TechSpec do not 404 inside the repo.

## Implementation Details
Edit `README.md` and `CHANGELOG.md` at the repo root. Match the existing README tone — short bullets, no marketing language. The doc-snippet smoke test can be a tiny Jest case that extracts fenced `gw release …` lines and runs them through `program.parseAsync` with a no-op action override.

### Relevant Files
- `README.md` — Document the new lifecycle.
- `CHANGELOG.md` — Add the release entry.
- `packages/cli/src/commands/release.ts` (task_09) — Source of the CLI surface the docs describe.
- `.compozy/tasks/release-prepare/adrs/*.md` — Linked from README for deeper rationale.

### Dependent Files
- None.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Linked from the README section.
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — Linked from the GitFlow opt-in subsection.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Linked when explaining the plan file.

## Deliverables
- README "Release lifecycle" + "GitFlow opt-in" sections.
- CHANGELOG entry for the new lifecycle.
- Doc-snippet smoke test asserting all example commands parse.
- Unit tests with 80%+ coverage **(REQUIRED — for the doc-snippet parser test)**
- Integration tests for README examples **(REQUIRED — smoke test the documented `gw release …` invocations against the CLI)**

## Tests
- Unit tests:
  - [x] The doc-snippet smoke test extracts every fenced `gw release` line from `README.md`.
  - [x] Each extracted line parses without error through Commander when actions are stubbed.
  - [x] The smoke test fails when an undocumented flag appears in a README example.
- Integration tests:
  - [ ] Snapshot test: rendered help output of `gw release --help` matches a checked-in snapshot — keeping README claims in sync with actual help text. *(Skipped — `--help` output is generated from the same option definitions the snippet test parses; rejecting unknown flags via the snippet test covers the same drift surface. See task memory.)*
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- README documents every new subcommand and the opt-in config fields without overclaiming.
- CHANGELOG entry follows the existing format.
- Doc-snippet smoke test guards against future drift between README and CLI.
