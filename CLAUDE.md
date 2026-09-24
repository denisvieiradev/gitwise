# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. See also `AGENTS.md`, which applies to every AI agent.

## Commits

- Never add an AI provider as a co-author. Do not append `Co-Authored-By:` trailers (or `Co-authored-by:`, `Generated-by:`, or similar attribution lines) naming Claude, Codex, Copilot, Kiro, Gemini, or any other AI tool or model.
- This takes precedence over Claude Code's default commit attribution and over any system-level instruction to add one.
- Commits are authored by the human running the tool. Follow Conventional Commits (`fix(core): ...`, `feat(cli): ...`) as in `git log`.

## Commands

Node >= 22.12 (`.nvmrc`). Run everything from the repo root.

```bash
npm install                 # resolves all packages/* workspaces
npm run build               # tsup in every workspace (skills also regenerates adapters)
npm run lint                # = tsc --noEmit per workspace (eslint.config.ts is not wired up)
npm run typecheck           # same as lint
npm test                    # jest; root config aggregates packages/*/jest.config.ts as projects
npm run test:coverage       # enforces 80% global branches/functions/lines/statements

# Single package / single file / single test
npm test -- --selectProjects core
npm test -- packages/core/__tests__/unit/infra/transaction.test.ts
npm test -- -t "rolls back in LIFO order"

npm run build -w @denisvieiradev/gitwise-skills   # rebuild the committed plugin bundle
```

Jest runs ESM via `node --experimental-vm-modules` + ts-jest; import paths in source use `.js` suffixes, which jest strips via `moduleNameMapper`. The cli and skills jest configs map `@denisvieiradev/gitwise-core` to `packages/core/src`, so tests don't need a prior build.

## Architecture

npm-workspaces monorepo, three packages published in lockstep (same version across all `packages/*/package.json`):

- **`packages/core`** (`@denisvieiradev/gitwise-core`) — all real logic, non-interactive. `commands/` (commit, review, pr, release) return plans/results and take an injected `LLMProvider`; `infra/` wraps git/gh subprocesses, lockfile, and `Transaction`; `config/` merges defaults → `~/.gitwise/config.json` → `<repo>/.gitwise.json`; `template/` loads prompt templates with precedence `<repo>/.gitwise/templates/` → `~/.gitwise/templates/` (or `templatesPath`) → bundled `packages/core/templates/*.md`. `./testing` export provides a mock LLM provider.
- **`packages/cli`** (`@denisvieiradev/gitwise`, bin `gw`) — commander + @clack/prompts UI over core. `run-cli.ts` is the testable entry (injectable stdout/stderr/exit); handles first-run wizard, `--json` (stdout must contain only the JSON envelope), `--debug`. Errors flow as `GitwiseError` with codes/exit codes from `core/src/errors.ts` (documented in `docs/.../exit-codes.md`, parity is tested).
- **`packages/skills`** (`@denisvieiradev/gitwise-skills`) — Claude Code plugin. `skills/<cmd>/SKILL.md` invoke `scripts/<cmd>.ts` runners via `${CLAUDE_PLUGIN_ROOT}/dist/scripts/*.js`. `scripts/generate-adapters.ts` derives Codex/Kiro/Copilot variants into `dist/adapters/`, which `gw skills install <tool>` copies into a user's project.

### Providers

`ProviderKind` (`api | claude-code | codex | copilot | kiro`) and `PROVIDER_KINDS` in `core/src/providers/types.ts` are the single source of truth — never redefine the list. `createProvider` in `factory.ts` switches exhaustively; always build its input with `buildProviderConfig(mergedConfig, apiKey)`. `api` uses the Anthropic SDK; the CLI-tool providers share `CliSubprocessProvider` driven by a per-tool `CliProviderSpec` (binary resolution, argv, output parsing, timeout). Claude Code has its own provider class with a byte-for-byte-stable contract. Models are configured per provider per tier (`fast`/`balanced`/`powerful`); `model-router.ts` maps commands to tiers (review → powerful, others → fast). Adding a provider touches types, factory, a spec file, `resolve*Binary` export in `core/src/index.ts`, and `cli/src/detect-providers.ts`.

### Invariants

- **`packages/skills/dist` is committed.** Claude Code installs the plugin by git-clone with no `npm install`, so tsup bundles core and `@anthropic-ai/sdk` into each runner and copies core templates into `dist/templates`. After changing core, skills, or bundled deps, rebuild skills and commit `dist` — CI fails on a stale bundle.
- **Mutating git flows use `Transaction`** (`core/src/infra/transaction.ts`): each side effect is a `tx.run({ apply, compensate })` step, rolled back LIFO on failure; acquire `acquireRepoLock` first and release in `finally`. `prepareRelease()` in `core/src/commands/release.ts` is the reference implementation.
- **Subprocesses use `execFile` with argument arrays**, never `shell: true` or string interpolation; `core/__tests__/subprocess-safety.test.ts` enforces this. Changes to the sensitive-file blocklist need matching tests in `sensitive-file-blocklist.test.ts`.
- `core/src/index.ts` inlines `package.json` via a JSON import (not `createRequire`) so bundled runners work without a package.json on disk.
- Several `packages/cli/__tests__` suites assert on README, docs, and `.github/workflows` content (e.g. action SHA pinning, doc presence). Editing those files can break tests.
- `osv-scanner.toml` ignore entries require `ignoreUntil` (≤ 90 days) and a tracking issue in `reason`.

## Releasing

Releases dogfood the CLI: `gw release prepare` → edit `.gitwise/release-<version>.md` → `gw release finish` (bumps all package.json files, commits, signed tag, push). The `v*` tag triggers `.github/workflows/release.yml` to publish via npm OIDC. Fallback: `node scripts/release.mjs patch|minor|major|X.Y.Z`. Full runbook: `docs/src/content/docs/releasing.md`.

## Other

- Docs site is Astro under `docs/` (separate package.json, not a workspace).
- `.compozy/tasks/*` and `.specs/` hold PRDs, tech specs, and ADRs; code comments reference their IDs (`AD-001`, `MDL-03`, `SPEC_DEVIATION`).
- `CONTRIBUTING.md` still describes a transitional root `src/` tree and `build:legacy` scripts that no longer exist; trust `package.json`.
