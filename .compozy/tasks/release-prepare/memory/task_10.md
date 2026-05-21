# Task Memory: task_10.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Surface `prepare`/`finish`/`abort` lifecycle on the Claude Code release skill: markdown trigger language + flag list, dispatcher in `scripts/release.ts`, unit tests on the parser, and integration tests against the built `dist/scripts/release.js` for each phase.

## Important Decisions

- Kept argv parser out of `release.ts` in its own `scripts/release-args.ts` module so unit tests can import the parser without triggering the runner's `main()` side effect.
- `--no-delete-branch` (finish) maps to `deleteReleaseBranch: false`; `--delete-branch` (abort) maps to `deleteBranch: true`. Default for both phases is "do nothing destructive" — skill runs non-interactively so we never delete unless explicitly asked.
- Built script forwards a typed `error.code` to stderr via `Error [<code>]: <message>` and exits non-zero (`UnknownPhaseError` → exit 2; other failures → exit 1).
- Fixed two pre-existing core bugs that block this task's required integration tests (promoted to shared memory — see Shared Learnings).
- Integration test for `prepare` isolates HOME to a separate temp dir rather than the repo cwd, so `$HOME/.gitwise/config.json` does not surface as untracked when prepare's clean-tree check runs.

## Learnings

- `seedRepo()` in the integration test gitignores `.gitwise.json` and `fake-claude.mjs` so the clean-tree preflight passes — anything written into the repo dir during a phase test must be gitignored before the first commit OR placed outside cwd.

## Files / Surfaces

- `packages/skills/skills/release.md` — documents the three subcommands + flags, allowlisted bash commands unchanged.
- `packages/skills/scripts/release.ts` — phase dispatcher; imports parser from `release-args.ts`.
- `packages/skills/scripts/release-args.ts` — pure parser with `UnknownPhaseError`.
- `packages/skills/__tests__/release-args.test.ts` — unit tests, all 18 specs pass.
- `packages/skills/__tests__/release-script.integration.test.ts` — 5 specs exercising `dist/scripts/release.js` via `node` against a fixture repo for each phase.
- `packages/core/src/infra/git.ts` — `status()` no longer trims leading whitespace (porcelain prefix fix).
- `packages/core/src/template/loader.ts` — bundled-template lookup probes both `../templates` (dist layout) and `../../templates` (src layout).

## Errors / Corrections

- Initial `finish` integration test failed with `WORKING_TREE_DIRTY: M .gitignore`. Root cause: `git.run()` trims stdout, which strips the leading space of an unstaged-modified porcelain line (` M filename` → `M filename`), so `finishRelease`'s `line.slice(3)` returned `gitignore` instead of `.gitignore` and the filter missed. Fixed by making `git.status()` only strip trailing newlines.
- Initial `prepare` integration test failed with `TEMPLATE_NOT_FOUND: Template 'release-changelog' not found`. Root cause: bundled `BUNDLED_TEMPLATES_PATH` was relative to source layout (`../../templates`), which resolved to `packages/templates` in the dist build. Fixed by probing both ancestor candidates.
- Second `prepare` failure: AnthropicProvider auth error. Root cause: test wrote provider config to `.gitwise.json` (repo config), but `provider` is a UserConfig field. Fixed by writing to `$HOME/.gitwise/config.json` (with HOME pinned to a separate temp dir to avoid dirtying the repo work tree).

## Ready for Next Run

- task_11 (README + CHANGELOG) is unblocked. The skill markdown content can be cited verbatim for the README's "Skill" section.
- Diff is uncommitted (run requested `--auto-commit=false`). Includes core fixes (git.ts, template/loader.ts) — those are cross-cutting and should be called out in the eventual commit message.
