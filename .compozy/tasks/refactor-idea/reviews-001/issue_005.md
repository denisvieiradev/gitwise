---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/cli/src/program.ts
line: 19
severity: high
author: claude-code
provider_ref:
---

# Issue 005: --no-color flag is declared but never consumed

## Review Comment

`packages/cli/src/program.ts:19` declares `.option("--no-color", "Disable ANSI color output")` on the root program. Commander parses the flag and stores it on `program.opts().color`, but no command handler reads it. Chalk 5.x auto-respects the `NO_COLOR` environment variable, so users who set `NO_COLOR=1` are fine — but the explicit `--no-color` CLI flag is a no-op. A user running `gw commit --no-color` will still see ANSI escape codes in `chalk.cyan(…)`, `chalk.bold(…)`, etc.

PRD line 124 states "CLI respects `NO_COLOR` and `--no-color`" as an accessibility requirement, so this is a spec gap.

**Suggested fix**: When `program.opts().color === false` (Commander negates `--no-color` into `color: false`), set `process.env.NO_COLOR = "1"` once at program startup (in `program.ts`) so chalk and downstream code both honor it. Alternatively, call `chalk.level = 0` directly. Add a test in `packages/cli/__tests__/program.test.ts` that asserts no ANSI bytes appear in command output when `--no-color` is passed.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed in `packages/cli/src/program.ts:19` — `--no-color` is declared via `.option()` but no handler reads `program.opts().color`. Commander negates the flag into `color: false`, but nothing in the codebase propagates that to chalk.
  - All four user-facing commands (`commit.ts`, `review.ts`, `release.ts`, `pr.ts`) import `chalk` and call colorized helpers (`chalk.cyan`, `chalk.bold`, etc.). Chalk 5.x detects support at import time from `process.env.NO_COLOR` and stdout TTY; without intervention, `gw <cmd> --no-color` still emits ANSI escapes.
  - PRD line 124 explicitly requires `--no-color` support, so this is a spec gap, not just a polish item.
  - Root cause: the option is purely declarative — there is no Commander hook or pre-parse step that translates `color === false` into `chalk.level = 0` / `process.env.NO_COLOR = "1"`.
  - Fix: register a `program.hook("preAction", …)` in `createProgram()` that, when `thisCommand.opts().color === false`, sets both `process.env.NO_COLOR = "1"` (so any spawned subprocesses inherit it) and `chalk.level = 0` (so the already-imported chalk instance stops emitting escapes). Expose the side-effecting helper as `applyNoColor()` so it can be unit-tested without invoking real commands.
  - Tests: add two cases in `program.test.ts` — one calling `applyNoColor()` directly and asserting `chalk.level === 0` and `process.env.NO_COLOR === "1"`, and one parsing `["node","gw","--no-color",<stub>]` through a registered no-op subcommand to assert the `preAction` hook actually fires.
