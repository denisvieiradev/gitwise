---
status: completed
title: Update release skill for new subcommands
type: docs
complexity: low
dependencies:
  - task_09
---

# Task 10: Update release skill for new subcommands

## Overview
Surface the new `prepare` / `finish` / `abort` lifecycle to Claude Code by updating `packages/skills/skills/release.md` and `packages/skills/scripts/release.ts`. The skill markdown documents the available subcommands and flags, and the script accepts a subcommand argument so the skill can drive each phase without requiring the user to type the full CLI.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/skills/skills/release.md` MUST mirror the new CLI surface: trigger language for `release prepare`, `release finish`, `release abort`, and the legacy one-shot.
- `packages/skills/scripts/release.ts` MUST accept a first positional argument selecting the phase: `prepare`, `finish`, `abort`, or absent (legacy one-shot).
- Existing flags MUST stay supported on the relevant phase: `--bump`, `--apply` (legacy only), `--no-gh-release`, `--no-workspace-propagation`, and the new `--no-delete-branch` on `finish`.
- The script MUST exit with a non-zero status when the underlying core function rejects, surfacing the `error.code` in the output so the skill can react.
- The skill markdown MUST stay terse — match the existing style — and list the same allowlisted Bash commands the current skill uses (no new permissions).
- MUST NOT duplicate the CLI's typed-error rendering — the script can either forward to the CLI binary or call the core functions directly; pick whichever matches the existing pattern in the current `release.ts` script (which currently calls core directly).
</requirements>

## Subtasks
- [x] 10.1 Update `packages/skills/skills/release.md` with the new commands and flags.
- [x] 10.2 Refactor `packages/skills/scripts/release.ts` to dispatch on the phase positional argument.
- [x] 10.3 Wire the new `--no-delete-branch` flag through the script for the `finish` phase.
- [x] 10.4 Add unit tests on the script's argument parser covering each phase + flag.
- [x] 10.5 Verify the built skill script in `dist/scripts/release.js` still runs under `node` against the documented invocation pattern.

## Implementation Details
Edit two files. The current `scripts/release.ts` is small (~67 lines); the refactor adds a switch on `process.argv[2]` and forwards remaining args. For `abort`, ask the caller to pass `--delete-branch` to enable branch deletion (skills run non-interactively, so default to keeping the branch unless explicitly asked).

### Relevant Files
- `packages/skills/skills/release.md` — Update trigger and command listing.
- `packages/skills/scripts/release.ts` — Add subcommand dispatch.
- `packages/core/src/index.ts` — Source of `prepareRelease`, `finishRelease`, `abortRelease` exports.

### Dependent Files
- `dist/scripts/release.js` — Build output consumed by the skill at runtime.
- `README.md` (task_11) — Cross-references the skill invocation.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Establishes the surface the skill mirrors.

## Deliverables
- Updated `release.md` documenting the new subcommands.
- Updated `release.ts` script with a phase dispatcher.
- Unit tests on the argument parser.
- Unit tests with 80%+ coverage **(REQUIRED — for the argument parser and dispatch logic)**
- Integration tests for the skill invocation **(REQUIRED — exercise the built script under `node` against a fixture repo for each phase)**

## Tests
- Unit tests:
  - [ ] `parseArgs(["prepare", "--bump", "minor"])` returns `{ phase: "prepare", bump: "minor" }`.
  - [ ] `parseArgs(["finish", "--no-delete-branch"])` returns `{ phase: "finish", deleteReleaseBranch: false }`.
  - [ ] `parseArgs(["abort", "--delete-branch"])` returns `{ phase: "abort", deleteBranch: true }`.
  - [ ] `parseArgs([])` returns `{ phase: undefined }` (legacy one-shot).
  - [ ] An unrecognized phase rejects with a clear message and a non-zero exit hint.
  - [ ] Existing legacy invocation `parseArgs(["--bump","patch","--apply"])` keeps producing the same result as today.
- Integration tests:
  - [ ] Run the built script `node dist/scripts/release.js prepare --bump patch` against a temp github-flow repo with a stubbed LLM; assert plan file is written and exit code is 0.
  - [ ] Run `node dist/scripts/release.js finish` against the same fixture; assert tag is created and exit code is 0.
  - [ ] Run `node dist/scripts/release.js abort` against a prepare-only fixture; assert plan file is removed.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Skill markdown advertises `prepare`, `finish`, and `abort` and stays consistent with the CLI help text.
- Built script exits non-zero with `error.code` in output on failure.
