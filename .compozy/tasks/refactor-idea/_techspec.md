# TechSpec: gitwise — Refactor from devflow-cli into an AI Git Toolbelt

## Executive Summary

gitwise is implemented as a TypeScript / Node ≥ 18 npm-workspaces monorepo with three publishable packages: `@denisvieiradev/gitwise-core` (shared logic), `@denisvieiradev/gitwise` (the `gw` CLI), and `@denisvieiradev/gitwise-skills` (the Claude Code plugin). The four product commands (`commit`, `review`, `pr`, `release`) are implemented as **non-interactive async functions** in core, returning typed plans/drafts as data. The CLI wraps those calls with `@clack/prompts` and adds defaults-with-flag-overrides; the skills bundle calls them from small Node scripts and emits markdown for Claude Code to drive any user dialog. Both surfaces ship at parity from day one.

The primary technical trade-off: by keeping core non-interactive and locking all three packages to a shared version, we accept slightly more orchestration code inside the CLI and occasional empty version bumps in `core`/`cli` (when only `skills` changes), in exchange for structural parity between install modes and a coherent user-visible version number. We carry over the strongest pieces of the existing devflow-cli (the multi-context commit splitter, both LLM providers, the regex template engine, git/github infra, model-tier routing) and drop the entire pipeline surface (`init`, `prd`, `techspec`, `tasks`, `run-tasks`, `test`, `done`, `status`, plus their supporting `state.ts`, `pipeline.ts`, `drift.ts`, `context.ts`).

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       @gitwise/skills                            │
│  plugin.json + skills/*.md  ──▶  scripts/*.ts (thin Node)        │
└────────────────────┬─────────────────────────────────────────────┘
                     │ imports
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       @gitwise/core                              │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  commands/    │  │  providers/  │  │   infra/             │  │
│  │  commit.ts    │  │  anthropic.ts│  │   git.ts             │  │
│  │  review.ts    │  │  claude-code │  │   github.ts          │  │
│  │  pr.ts        │  │  factory.ts  │  │   filesystem.ts      │  │
│  │  release.ts   │  │  model-router│  │   logger.ts          │  │
│  └───────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  config/      │  │  template/   │  │   testing/           │  │
│  │  user.ts      │  │  loader.ts   │  │   MockLLMProvider    │  │
│  │  repo.ts      │  │  interpolate │  │                      │  │
│  └───────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────▲─────────────────────────────────────────────┘
                     │ imports
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                       @gitwise (CLI)                             │
│  bin/gw  ──▶  src/program.ts ──▶ src/commands/*.ts               │
│             (commander + @clack/prompts wraps core functions)    │
└──────────────────────────────────────────────────────────────────┘
```

**Component responsibilities:**

- **`@gitwise/core`** — All product logic. Pure functions where possible; no interactive I/O; no `process.exit`. Owns prompt templates (`packages/core/templates/`), LLM providers, git/github wrappers, config loaders, model-tier routing. Exports four high-level commands plus typed result shapes plus a `MockLLMProvider` for tests.
- **`@gitwise/cli`** — Commander-based CLI. Parses args, loads config, calls core, renders interactive plan confirmations via `@clack/prompts`, applies plans (creating commits, opening PRs, cutting releases). Owns the **first-run flow** (provider selection + API key capture) and the `gw config` subcommand.
- **`@gitwise/skills`** — Claude Code plugin. Ships a `plugin.json` manifest and four skill markdown files; each skill's tool allowlist includes Bash to run a per-skill `scripts/<name>.ts` (via `node` or `tsx`) that imports `@gitwise/core`. Scripts emit structured markdown/JSON for Claude Code to surface to the user.

**Data flow (CLI `gw commit "<intent>"`):**

```
User → gw → load user/repo config → resolve provider → core.commit({ prompt, ... })
       → core: diff → LLM call (with templates + intent) → parsed plan returned
   → CLI: render plan via @clack/prompts → user confirms split/single
   → CLI: apply (git add + git commit per entry) → optional push → done
```

**Data flow (skill, inside Claude Code):**

```
User asks Claude → skill triggers → Claude runs `node packages/skills/scripts/commit.js "<intent>"`
   → script: imports core, calls core.commit() → emits plan as markdown
   → Claude reads stdout → asks user to confirm/edit → re-invokes script with flags
   → script: applies plan via core.applyCommitPlan() → exits → Claude confirms outcome
```

**External system interactions:** the local `git` binary (always required), the `gh` CLI (optional; needed for `pr` create and `release` GitHub releases), the Anthropic API (when `provider === "api"`), the `claude` binary (when `provider === "claude-code"`).

## Implementation Design

### Core Interfaces

The public API surface of `@gitwise/core`. Each command function takes a typed options object (all fields optional with sensible defaults) and returns a typed plan/draft. Mutations are exposed as `apply*` helpers so callers control the moment of side effects.

```typescript
// packages/core/src/index.ts (excerpt)

export interface CommitOptions {
  cwd?: string;                 // default: process.cwd()
  prompt?: string;              // free-form user intent (positional arg)
  split?: "auto" | "never" | "always";  // default: "auto"
  filesToStage?: string[];      // default: keep current staged set
  baseBranch?: string;          // default: detect (main/master)
  push?: boolean;               // default: false
  providerOverride?: ProviderConfig;
}

export interface CommitPlan {
  kind: "single" | "split";
  commits: Array<{
    message: string;            // conventional-commits-formatted
    description?: string;
    files: string[];
  }>;
  tokens: { input: number; output: number };
}

export async function commit(opts?: CommitOptions): Promise<CommitPlan>;
export async function applyCommitPlan(plan: CommitPlan, opts?: { push?: boolean }): Promise<void>;
```

```typescript
// review, pr, release follow the same plan-then-apply pattern.

export interface ReviewOptions { cwd?: string; prompt?: string; baseBranch?: string; }
export interface ReviewResult {
  critical: Finding[];
  suggestions: Finding[];
  nitpicks: Finding[];
  markdown: string;
  tokens: { input: number; output: number };
}
export async function review(opts?: ReviewOptions): Promise<ReviewResult>;

export interface PrOptions { cwd?: string; prompt?: string; baseBranch?: string; draft?: boolean; }
export interface PrDraft { title: string; body: string; existingPrNumber?: number; }
export async function pr(opts?: PrOptions): Promise<PrDraft>;
export async function applyPr(draft: PrDraft, opts?: { draft?: boolean }): Promise<{ url: string }>;

export interface ReleaseOptions { cwd?: string; bump?: "patch" | "minor" | "major"; language?: Language; }
export interface ReleasePlan {
  suggestedBump: "patch" | "minor" | "major";
  newVersion: string;
  changelog: string;             // Keep a Changelog format
  notes: string;                 // client-facing
  tokens: { input: number; output: number };
}
export async function release(opts?: ReleaseOptions): Promise<ReleasePlan>;
export async function applyRelease(plan: ReleasePlan, opts?: { tagAndPush?: boolean; createGhRelease?: boolean }): Promise<void>;
```

```typescript
// Provider abstraction reused for both Anthropic SDK and Claude Code subprocess.

export interface LLMProvider {
  chat(req: { systemPrompt: string; userMessage: string; tier: "fast" | "balanced" | "powerful" }):
    Promise<{ content: string; tokens: { input: number; output: number } }>;
}

export interface ProviderConfig {
  kind: "api" | "claude-code";
  claudeCliPath?: string;        // for "claude-code"
  models: { fast: string; balanced: string; powerful: string };
}

export function createProvider(config: ProviderConfig): LLMProvider;
```

**Error handling conventions:**
- All command functions throw typed errors (`GitwiseError` subclasses) with a `.code` field (`"NO_STAGED_CHANGES"`, `"NO_REMOTE"`, `"PROVIDER_UNAVAILABLE"`, etc.). Callers map codes to user-facing messages.
- LLM errors retry up to 3 times with exponential backoff (carry over devflow's retry logic).
- Sensitive-file guard (`.env`, `*.pem`, credential JSONs) refuses to call the LLM and throws `SENSITIVE_FILE_STAGED`.

### Data Models

`UserConfig` (at `~/.gitwise/config.json`):

```typescript
interface UserConfig {
  provider: "claude-code" | "api";
  claudeCliPath?: string;
  models: { fast: string; balanced: string; powerful: string };
  language: "en" | "pt" | "es" | "fr";
  defaultBaseBranch?: string;
  commitConvention: "conventional" | "free";
}
```

`RepoConfig` (at `<repo>/.gitwise.json`, all fields optional, deep-merged on top of `UserConfig`):

```typescript
interface RepoConfig {
  models?: Partial<UserConfig["models"]>;
  language?: UserConfig["language"];
  defaultBaseBranch?: string;
  commitConvention?: UserConfig["commitConvention"];
  templatesPath?: string;          // alternative to ~/.gitwise/templates
}
```

API keys are persisted out-of-band in `~/.gitwise/.env` with `0600` permissions (single line: `ANTHROPIC_API_KEY=...`). They are never written into `config.json`.

There is **no per-feature state**, **no run history**, **no SHA tracking**. The product is stateless except for `UserConfig`.

### API Endpoints

gitwise is a CLI + plugin product; it exposes no HTTP API. The "endpoints" are the four core functions documented in Core Interfaces. CLI flag surface per command:

| Command | Positional | Flags |
|---------|------------|-------|
| `gw commit [intent]` | intent (free-form prompt) | `--split=<auto\|never\|always>` `--push` `--message <m>` `--no-confirm` `--base <branch>` |
| `gw review [intent]` | intent | `--base <branch>` `--json` |
| `gw pr [intent]` | intent | `--draft` `--base <branch>` `--update` |
| `gw release` | — | `--bump <patch\|minor\|major>` `--language <code>` `--no-publish` `--no-gh-release` |
| `gw config <key> <value>` | key, value | — |
| `gw --version` | — | — |

## Integration Points

| External System | Purpose | Auth | Error Handling |
|----------------|---------|------|----------------|
| **Anthropic API** | LLM calls when `provider === "api"` | `ANTHROPIC_API_KEY` from `~/.gitwise/.env` or env var | 3-retry exponential backoff for 429/529; throw `PROVIDER_UNAVAILABLE` on persistent failure |
| **Claude Code CLI** | LLM calls when `provider === "claude-code"` | Inherits Claude Code's session; resolves binary via PATH/Homebrew/nvm | Fail fast if binary not found; suggest `gw config provider api` |
| **`git` binary** | All diff/log/commit operations | local | Carry over devflow's error-mapping (no-changes, no-remote, conflicts) |
| **`gh` CLI** | Open PRs (`pr` command) and GitHub releases (`release` command) | Inherits user's `gh auth status` | Graceful fallback: print title/body or release notes to stdout if `gh` is absent or unauthed |

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|-----------|-------------|---------------------|-----------------|
| `src/cli/commands/commit.ts` (devflow) | Migrated | Refactor into `packages/core/src/commands/commit.ts` (logic) + `packages/cli/src/commands/commit.ts` (clack wrapper). Multi-context detection unchanged. **Low risk** — extensive existing tests. | Port + split |
| `src/cli/commands/review.ts` | Migrated | Same split. Drop `techspec.md`-loading code path; review now operates only on diff + branch context. **Low risk.** | Port + simplify |
| `src/cli/commands/pr.ts` | Migrated | Same split. Add `--update` flag (update body when PR exists). **Low risk.** | Port + extend |
| `src/cli/commands/release.ts` | Migrated | Same split. Add workspace-aware version propagation (for the gitwise monorepo's own dogfood release; configurable via `.gitwise.json`). **Medium risk** — multi-package propagation is new behavior. | Port + extend |
| `src/cli/commands/{init,prd,techspec,tasks,run-tasks,test,done,status}.ts` | Deprecated | All removed in gitwise. **No risk** — feature explicitly out of scope (PRD non-goals). | Delete |
| `src/core/{pipeline,state,context,drift}.ts` | Deprecated | Feature-tracking / artifact hashing — entirely pipeline-only. | Delete |
| `src/core/{config,template,scanner}.ts` | Migrated | Carry over with simplification: drop `feature*` fields from types; templates loader gets the new 3-level precedence (per-repo → user-global → core). | Port + adapt |
| `src/providers/{claude,claude-code,factory,model-router}.ts` | Migrated | Both providers kept. Factory now reads from `UserConfig.provider`. Model-router map shrunk to four commands. **Low risk.** | Port |
| `src/infra/{git,github,filesystem,env,logger}.ts` | Migrated | Carry over as-is. | Port |
| `src/infra/update-check.ts` | Deprecated | Update-checker (devflow-cli specific) removed; reintroduce in phase 2 if needed. | Delete |
| Templates (`templates/*.md`) | Migrated | Keep `commit.md`, `pr.md`, `release-*.md`. Add a new `review.md` extracted from the inline prompt in `review.ts`. Drop `prd.md`, `techspec.md`, `tasks.md`. | Trim + extract |
| `__tests__/` | Migrated | Repartition by package. Add a shared `MockLLMProvider` and golden-output fixtures for `commit`/`pr`/`release` plans. **Medium risk** — coverage threshold (80%) must be re-hit per package. | Port + adapt |
| `tsup.config.ts` | New | Per-package configs in monorepo; root config shared. | New |
| `package.json` (root) | New | `private: true`, `workspaces: ["packages/*"]`. | New |
| Per-package `package.json` | New | `core`, `cli`, `skills` each with explicit `files`, `exports`, `bin` (cli only). | New |
| `scripts/release.mjs` | New | Phase 0 release script (locked version propagation) until `gw release` dogfoods itself. | New |
| `devflow-cli` (npm package) | Deprecated | Publish one final release that prints a deprecation banner pointing to `@denisvieiradev/gitwise`. Then archive the GitHub repo. | One-time |
| `.devflow/` (in user projects) | Unaffected | gitwise reads no devflow state; existing `.devflow/` dirs in user repos are left alone. | None |

## Testing Approach

### Unit Tests

- **Framework**: Jest with ts-jest ESM preset (already configured in devflow-cli; ported per package).
- **Coverage target**: 80% branches/functions/lines/statements (carry over devflow threshold). Enforced per package.
- **Critical components to unit test**:
  - `packages/core/src/commands/commit.ts` — multi-context JSON parser (3-strategy: pure JSON, fenced, brace extraction); plan-merging logic; sensitive-file guard.
  - `packages/core/src/commands/release.ts` — semver-bump recommendation, workspace propagation logic.
  - `packages/core/src/config/loader.ts` — precedence chain (repo → user → defaults) and merge semantics.
  - `packages/core/src/template/loader.ts` — 3-level template lookup; missing-file fallback.
  - `packages/core/src/providers/factory.ts` — provider selection from `UserConfig`.
  - `packages/core/src/providers/anthropic.ts` — retry/backoff on 429/529 (mock the SDK).
- **Mocks**:
  - `MockLLMProvider` exported from `@denisvieiradev/gitwise-core/testing`. Implements `LLMProvider` and returns scripted responses keyed by an incrementing call counter or by matching the request prompt prefix. Used in every command test to avoid real LLM calls.
  - `ora` mock carried over from devflow's `__mocks__/ora.ts` for CLI tests.
- **Edge cases** to cover: empty diff, only-sensitive-files staged, non-git directory, no remote, no commits since last tag, detached HEAD, conflict during commit application.

### Integration Tests

- **Components together**: each command function exercised against a real local git repo built in a `mkdtemp` directory (carry over devflow integration pattern). Real `git` invocations; mocked LLM provider.
- **Per package**:
  - `packages/core/__tests__/integration/` — golden-output tests: feed a fixed diff + a `MockLLMProvider` returning a fixed canned response; assert the resulting plan structure matches a `.snap` file.
  - `packages/cli/__tests__/integration/` — spawn `node packages/cli/dist/index.js commit --no-confirm` against the temp repo, assert exit code 0 and that commits land.
  - `packages/skills/__tests__/integration/` — invoke a skill script directly (`node packages/skills/dist/scripts/commit.js`) and assert the stdout markdown structure.
- **Environment dependencies**: tests skip GitHub-touching paths (`gh` CLI calls) by default; gated behind a `GITWISE_E2E=1` env var that signals a sandbox repo + token are available.

## Development Sequencing

### Build Order

The order below respects the dependency graph; each step states the steps it depends on.

1. **Initialize the monorepo skeleton** — root `package.json` with workspaces, `tsconfig.base.json`, shared `tsup.config.ts`, shared `jest.config.ts`, root `.gitignore`, `CONTRIBUTING.md`. **No dependencies.**
2. **Create `packages/core` skeleton** — `package.json`, `src/index.ts` stub, `__tests__/` skeleton, build wiring. Depends on **step 1**.
3. **Port infra modules into core** — `packages/core/src/infra/{git,github,filesystem,env,logger}.ts`. Depends on **step 2**.
4. **Port provider modules into core** — `packages/core/src/providers/{anthropic,claude-code,factory,model-router}.ts`. Depends on **step 2**. Add `MockLLMProvider` export under `packages/core/src/testing/`.
5. **Port template engine + bundled templates** — `packages/core/src/template/{loader,interpolate}.ts`, bundle `commit.md`, `pr.md`, `release-*.md`, new `review.md` under `packages/core/templates/`. 3-level precedence loader. Depends on **steps 2–3**.
6. **Port config loaders** — `packages/core/src/config/{user,repo,merge}.ts`. Includes default `UserConfig` shape and the `~/.gitwise/.env` reader. Depends on **steps 2–3**.
7. **Implement `core.commit()` + `applyCommitPlan()`** — refactor from `devflow-cli`'s `commit.ts` into non-interactive form; sensitive-file guard; multi-context JSON parser. Unit tests with `MockLLMProvider`. Depends on **steps 3–6**.
8. **Implement `core.review()`** — refactor from devflow `review.ts`; drop techspec-loading path. Depends on **steps 3–6**.
9. **Implement `core.pr()` + `applyPr()`** — refactor from devflow `pr.ts`; add `--update` semantics. Depends on **steps 3–6**.
10. **Implement `core.release()` + `applyRelease()`** — refactor from devflow `release.ts`; add workspace propagation hook. Depends on **steps 3–6**.
11. **Create `packages/cli` skeleton + first-run flow** — Commander program; `gw config` subcommand; first-run provider prompt (writes `~/.gitwise/config.json` + `~/.gitwise/.env`). Depends on **step 6**.
12. **Implement CLI command wrappers** — `gw commit`, `gw review`, `gw pr`, `gw release`. Each loads config, calls the matching core function, renders plan via `@clack/prompts`, applies on confirm. Per-command flags from the table above. Depends on **steps 7–10, 11**.
13. **Create `packages/skills` skeleton** — `plugin.json` manifest, four skill markdown files, four `scripts/*.ts` Node entry points; each script imports core, formats output as markdown, exits. Depends on **steps 7–10**.
14. **Port and partition tests** — split `__tests__/` from devflow into `packages/*/​__tests__/`; refit to the new module paths; hit the 80% coverage target per package. Depends on **steps 7–13**.
15. **Phase 0 release tooling** — `scripts/release.mjs` (manual version-bump propagator); CI on tag push that runs `npm publish --workspaces --access public`. Depends on **steps 1, 11**.
16. **Final devflow-cli deprecation release** — publish a last devflow-cli version that prints a one-line deprecation banner pointing to `@denisvieiradev/gitwise`; archive the github.com/denisvieiradev/devflow-cli repo. Depends on **steps 1–15** (gitwise must be publishable first).
17. **Dogfood `gw release` for gitwise itself** — when the locked-version monorepo bump is wired into `gw release` end-to-end, switch the release process. Depends on **steps 10, 12, 15**.

### Technical Dependencies

- **Node ≥ 18** (carry over from devflow). Required for ESM + native test runner support.
- **`@anthropic-ai/sdk`** ^0.39.x or current (for Anthropic provider).
- **`commander`** ^13.x (CLI framework).
- **`@clack/prompts`** ^0.9.x (CLI interactive UI).
- **`ora`** ^8.x (spinners).
- **`chalk`** ^5.x (colors).
- **`jest`** + **`ts-jest`** ^29.x (tests; ESM preset).
- **`tsup`** ^8.x (bundling).
- **`gh` CLI** (optional, runtime) and **`claude` CLI** (optional, runtime when provider is `claude-code`) — neither is a build-time dependency.
- **Claude Code plugin schema** must remain stable for `packages/skills`; track [the plugin docs](https://code.claude.com/docs/en/discover-plugins).

## Monitoring and Observability

This is a local CLI / plugin product; there is no server-side telemetry by design (privacy is a PRD principle). Operational visibility is local:

- **Token usage reporting**: every LLM call prints input/output token counts (carry over from devflow). The CLI prints them to stdout after the operation; the skill script includes them in the emitted markdown.
- **Verbose / debug mode**: `GITWISE_DEBUG=1` enables structured logs to stderr (carry over devflow's `infra/logger.ts`). Log lines include event, command, provider, tier, duration, and a request id correlating to the LLM call.
- **Error reporting**: errors print a single user-readable line on stderr plus a hint when applicable; full stack only in debug mode.
- **No alerting / no remote metrics.** Users are encouraged (in README) to file GitHub issues with the redacted debug log when something breaks.

## Technical Considerations

### Key Decisions

- **Decision**: Monorepo with three npm-workspace packages (`core`, `cli`, `skills`).
  - **Rationale**: Single source of truth for prompts + providers + git/github; per-package dep boundaries; future host adapters drop in cleanly.
  - **Trade-offs**: Three packages to keep coherent. Mitigated by locked versions.
  - **Alternative rejected**: single combined package, two separate repos, full host-adapter scaffolding from day one.
  - **Recorded in**: [ADR-002](adrs/adr-002.md).

- **Decision**: Non-interactive core; CLI owns prompts; skills emit markdown for Claude to drive dialog.
  - **Rationale**: Parity between install modes is structural rather than policed; defaults make daily use frictionless; free-form `prompt` arg conveys intent uniformly.
  - **Trade-offs**: CLI carries plan-rendering code; skills delegate dialog to Claude (which may default-choose wrong on rare paths).
  - **Alternative rejected**: injected IO adapter, two entry points per command, low-level primitives only.
  - **Recorded in**: [ADR-003](adrs/adr-003.md).

- **Decision**: Explicit first-run provider prompt; persisted in `~/.gitwise/config.json`.
  - **Rationale**: Predictability over silent-detection. One-time friction; reconfigurable via `gw config provider`.
  - **Trade-offs**: First-command interactive moment; stale config if user uninstalls `claude` later.
  - **Alternative rejected**: silent auto-detect every run, cached auto-detect, hard separation by install mode.
  - **Recorded in**: [ADR-004](adrs/adr-004.md).

- **Decision**: Locked shared version across packages; manual `scripts/release.mjs` until `gw release` dogfoods itself.
  - **Rationale**: Coupled releases prevent partial-upgrade traps; dogfooding `gw release` validates the product on itself.
  - **Trade-offs**: Empty bumps for unaffected packages; two release paths during Phase 0.
  - **Alternative rejected**: Changesets, independent versioning, permanent manual releases.
  - **Recorded in**: [ADR-005](adrs/adr-005.md).

- **Decision (no separate ADR)**: Templates ship in `packages/core/templates/`; precedence is per-repo `<repo>/.gitwise/templates/` > user-global `~/.gitwise/templates/` > built-in core. Override-by-file with the existing `{{var}}` regex interpolation.
  - **Rationale**: Users derive from base templates and place them at the scope they want.
  - **Trade-offs**: None significant; matches existing devflow loader pattern.

### Known Risks

- **Risk (high likelihood, low impact)**: small breakages porting commands from devflow's `src/cli/commands/` into non-interactive core functions — clack prompt sites are scattered through the existing code.
  - **Mitigation**: port one command at a time; keep the existing test files and adapt them progressively; require a green test suite per command before moving on.
- **Risk (medium likelihood, medium impact)**: Claude Code plugin schema or skill discovery flow changes between when we design `packages/skills` and when we ship.
  - **Mitigation**: pin to a documented schema version; CI smoke-test the plugin manifest with the public Claude Code installer flow before each release.
- **Risk (medium likelihood, medium impact)**: workspace-aware version propagation in `gw release` has no existing implementation to lift from devflow.
  - **Mitigation**: prototype in `scripts/release.mjs` first; the same logic moves into `core.applyRelease()` when proven.
- **Risk (low likelihood, high impact)**: API-key file permissions (`0600`) fail on Windows, leaking keys.
  - **Mitigation**: on Windows, fall back to writing into the user's local AppData with ACL restriction; if not feasible at MVP, document the env-var path as the recommended Windows option.
- **Risk (medium likelihood, low impact)**: existing devflow-cli users (small but real) feel abandoned by the rename.
  - **Mitigation**: final devflow-cli release prints a banner with the new install command; honest changelog note that the pipeline parts are gone.

## Architecture Decision Records

ADRs documenting decisions made during PRD brainstorming and technical design:

- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](adrs/adr-001.md) — keep all four current commands as independent subcommands and skills; no required workflow; reject the orchestrator and skills-first alternatives.
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — three publishable packages in one git repo; future host adapters drop in alongside `cli` and `skills`.
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — `commit`/`review`/`pr`/`release` return typed plans; CLI wraps with `@clack/prompts`; skills emit markdown and let Claude drive dialog; every command accepts a free-form `prompt` argument.
- [ADR-004: Explicit first-run provider choice with persisted user config](adrs/adr-004.md) — one-time prompt picks Claude Code subprocess or Anthropic API; persisted in `~/.gitwise/config.json`; reconfigurable via `gw config provider`.
- [ADR-005: Locked-version monorepo releases via dogfooded `gw release`](adrs/adr-005.md) — all three packages share a version; Phase 0 manual script; Phase 1 (`gw release` from repo root) takes over once dogfoodable.
