---
status: completed
title: Build packages/skills plugin with manifest, skill markdown, and scripts
type: frontend
complexity: medium
dependencies:
    - task_08
    - task_09
    - task_10
    - task_11
---

# Task 14: Build packages/skills plugin with manifest, skill markdown, and scripts

## Overview
Create the `@denisvieiradev/gitwise-skills` package: a Claude Code plugin that ships a `plugin.json`, four skill markdown specs (one per command), and four thin Node scripts that import `@denisvieiradev/gitwise-core` and emit structured markdown for Claude to drive the user dialog.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- A new package MUST be created at `packages/skills/` with `package.json` (name `@denisvieiradev/gitwise-skills`, `type: "module"`, `engines.node >=18`, explicit `files`, and a workspace dependency on `@denisvieiradev/gitwise-core`).
- A `plugin.json` manifest MUST be authored at the package root, conforming to the documented Claude Code plugin schema (pin to a documented schema version per TechSpec risk mitigation).
- Four skill markdown files MUST live under `packages/skills/skills/`: `commit.md`, `review.md`, `pr.md`, `release.md`. Each file MUST include name, description, the tool allowlist (at minimum `Bash` to run `node` plus filesystem reads as needed), and instructions that teach Claude when to invoke the skill and what flags can be passed.
- Four script entry points MUST live under `packages/skills/scripts/`: `commit.ts`, `review.ts`, `pr.ts`, `release.ts`. Each script MUST parse positional args + named flags, call the corresponding core function, and emit deterministic markdown to stdout. Scripts MUST exit non-zero on typed errors.
- The build output MUST place compiled scripts under `dist/scripts/` and the manifest + skill markdown unchanged in the published artifact.
- The scripts MUST NOT use `@clack/prompts` or any other interactive primitive — they emit markdown and exit.
- The `commit` script MUST support a `--apply` flag that calls `applyCommitPlan()` with the previously-emitted plan (re-parsed from stdin or rebuilt from flags) so Claude can complete a confirm round-trip.
- The `pr` script MUST analogously support `--apply`.
- The `release` script MUST analogously support `--apply`.
- The skills MUST instruct Claude to prefer the `--apply` round-trip after user confirmation.
- Tests MUST cover each script's happy path against `MockLLMProvider` and a `mkdtemp` repo, and the JSON-vs-markdown emission stability.
</requirements>

## Subtasks
- [ ] 14.1 Scaffold `packages/skills/` with `package.json`, `tsconfig.json`, `tsup.config.ts`, `plugin.json`, `skills/`, `scripts/`, and `__tests__/`.
- [ ] 14.2 Author `plugin.json` and the four skill markdown files with tool allowlists and instruction text.
- [ ] 14.3 Implement the four scripts with deterministic markdown emission and `--apply` round-trips for commit/pr/release.
- [ ] 14.4 Wire the tsup config to emit `dist/scripts/*.js` and to include `plugin.json` + `skills/` in the published artifact.
- [ ] 14.5 Add tests for each script.

## Implementation Details
Reference TechSpec "Implementation Design → Component Overview" for the skills package shape and "Data flow (skill, inside Claude Code)" for the round-trip. Reference [ADR-002](adrs/adr-002.md) for the package name and [ADR-003](adrs/adr-003.md) for the markdown-emit-and-let-Claude-drive-dialog contract.

### Relevant Files
- `packages/skills/package.json` — new.
- `packages/skills/plugin.json` — new (Claude Code plugin manifest).
- `packages/skills/skills/{commit,review,pr,release}.md` — new skill specs.
- `packages/skills/scripts/{commit,review,pr,release}.ts` — new entry points.
- `packages/skills/__tests__/` — new.

### Dependent Files
- `packages/core` exports consumed by every script.
- `scripts/release.mjs` (from [[task_15]]) — propagates version to this package.

### Related ADRs
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — package naming and layout.
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — skills emit markdown; Claude drives dialog.

## Deliverables
- `packages/skills/` package scaffolded and publishable.
- Plugin manifest and four skill markdown files authored.
- Four script entry points implemented with `--apply` round-trips.
- Unit + integration tests **(REQUIRED)**.
- Test coverage 80%+ on `packages/skills` **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `commit` script: invoked with a positional intent and `MockLLMProvider` injected, emits a markdown plan to stdout and exits 0.
  - [ ] `commit --apply` script: invoked with a plan on stdin, applies it and exits 0.
  - [ ] `review` script: emits the `markdown` field of `ReviewResult` to stdout.
  - [ ] `pr` script: emits the draft as markdown.
  - [ ] `pr --apply` script: invokes `applyPr` and emits the resulting URL.
  - [ ] `release` script: emits the plan as markdown.
  - [ ] `release --apply` script: invokes `applyRelease` and exits 0.
  - [ ] All scripts: typed core errors map to single-line stderr messages and exit 1.
  - [ ] All scripts: a `--help` flag prints a usage summary.
- Integration tests:
  - [ ] End-to-end: in a `mkdtemp` repo, running `node packages/skills/dist/scripts/commit.js "intent"` against `MockLLMProvider` emits a markdown plan, then running it with `--apply` and the plan on stdin produces a commit in `git log`.
  - [ ] `plugin.json` validates against the documented Claude Code schema version pinned in this task.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The package builds and produces a valid plugin artifact.
- Each script emits stable, deterministic markdown given a fixed mock LLM response.
- The plugin manifest validates against the pinned Claude Code schema.
