# TechSpec: `gw release prepare` — Two-Phase Strategy-Aware Release Workflow

## Executive Summary

Split the current monolithic `release` command into an explicit two-phase lifecycle — `gw release prepare` and `gw release finish` — backed by a persisted plan file (`.gitwise/release-plan.json`) that survives between processes. Add a narrow `ReleaseStrategy` abstraction (`github-flow` default, `gitflow` opt-in) that controls whether a release branch is created during `prepare` and how `finish` merges and tags. The existing `gw release` invocation keeps today's one-shot UX: it runs `prepare` then immediately `finish` against the in-memory plan, so no existing user has to change anything.

The primary technical trade-off is the introduction of a small on-disk state surface (the plan file plus its lifecycle and validation rules) in exchange for unlocking GitFlow's multi-session release model and letting users iterate on generated changelog / notes without re-paying LLM cost. We deliberately reject the broader `FlowStrategy` interface from the design doc (which would also reshape `commit`, `pr`, `merge`, `worktree`) — that work is left to follow-on tasks; this spec stays scoped to release.

## System Architecture

### Component Overview

```
                  packages/core
┌─────────────────────────────────────────────────────────────┐
│  commands/release.ts                                        │
│    prepareRelease(opts)  ──┐                                │
│    finishRelease(opts)   ──┼──► strategies/release.ts       │
│    abortRelease(opts)    ──┘     createReleaseStrategy()    │
│    release(opts) [legacy one-shot] ─►                       │
│                                                             │
│  commands/release-plan.ts                                   │
│    saveReleasePlan / loadReleasePlan / deleteReleasePlan    │
│    ensureGitignored                                         │
│                                                             │
│  config/types.ts                                            │
│    RepoConfig.releaseStrategy?: "github-flow" | "gitflow"   │
│    RepoConfig.developBranch?: string                        │
│                                                             │
│  infra/git.ts (additions)                                   │
│    mergeNoFf(cwd, source) / branchExists(cwd, branch)       │
│    headSha(cwd) / deleteBranch(cwd, branch, force?)         │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ imports
┌─────────────────────────────┴───────────────────────────────┐
│  packages/cli/src/commands/release.ts                       │
│  Subcommands wired via Commander:                           │
│    gw release [version] [--bump]    → legacy one-shot       │
│    gw release prepare [version]     → prepareRelease + save │
│    gw release finish                → load + finishRelease  │
│    gw release abort                 → abortRelease          │
└─────────────────────────────────────────────────────────────┘
```

**Component responsibilities:**

- **`commands/release.ts`** — Owns the three lifecycle functions. `prepareRelease` runs the existing LLM planning, asks the strategy for a release branch, performs filesystem mutations for GitFlow (branch + manifest + changelog on the release branch), and ends by writing `release-plan.json`. `finishRelease` validates the plan, merges + tags + pushes + creates a GitHub release per strategy, and deletes the plan. `abortRelease` removes the plan file and, when applicable, the release branch.
- **`commands/release-plan.ts`** — Pure filesystem helpers for the plan file plus the `.gitignore` ensure-helper. No git or LLM dependencies; cheap to unit-test.
- **`strategies/release.ts`** — Two stateless strategy objects implementing `ReleaseStrategy`. `gitflow` returns a release branch name and lists both `main` and `develop` as merge targets; `github-flow` returns `null` for the branch and lists only `main`.
- **`infra/git.ts`** — Add the small set of git primitives the strategies need: `mergeNoFf`, `branchExists`, `headSha`, `deleteBranch`. Follow the existing `run`/`exec` pattern in the file.
- **CLI `release.ts`** — Register subcommands; render plan, validation errors, and recovery hints via `@clack/prompts`. The legacy `gw release` action wires `prepareRelease` → confirm → `finishRelease`.

**External system interactions:** local `git` binary (always), `gh` CLI (optional, for GitHub release creation in `finishRelease`), the configured LLM provider (only during `prepareRelease`).

**Data flow — `gw release prepare 1.2.0` on GitFlow:**

```
CLI → loadConfig → resolveStrategy("gitflow") → core.prepareRelease({version:"1.2.0",strategy})
  → core: createBranch("release/1.2.0", from=develop) → release() [LLM plan]
       → bump package.json + write CHANGELOG entry + write .gitwise/release-1.2.0.md
       → ensureGitignored(".gitwise/release-plan.json")
       → saveReleasePlan(persistedPlan)
  → CLI: print "Prepared release/1.2.0; edit .gitwise/release-1.2.0.md, then run gw release finish"
```

**Data flow — `gw release finish` on GitFlow:**

```
CLI → loadReleasePlan → strategy.mergeTargets() = ["main","develop"]
  → core.finishRelease: validate (tag missing, branch=plan.targetBranch, develop exists, tree clean)
     → reload notes from .gitwise/release-1.2.0.md (user-edited)
     → deleteReleasePlan
     → for each target in mergeTargets: checkout(target); mergeNoFf("release/1.2.0")
     → createTag("v1.2.0"); pushWithTags("origin", main); push("origin", develop)
     → optional gh release create
     → delete local release branch (asks first)
```

## Implementation Design

### Core Interfaces

The release lifecycle exposes three async entry points and a strategy interface. Each function returns a typed result; mutations are isolated to `finishRelease`.

```typescript
// packages/core/src/strategies/release.ts
export type ReleaseStrategyName = "github-flow" | "gitflow";

export interface ReleaseStrategy {
  readonly name: ReleaseStrategyName;
  releaseBranchFor(version: string): string | null;
  mergeTargets(mainBranch: string, developBranch?: string): string[];
  requiresDevelop(): boolean;
}

export function createReleaseStrategy(name: ReleaseStrategyName): ReleaseStrategy;
```

```typescript
// packages/core/src/commands/release-plan.ts
export interface PersistedReleasePlan {
  schema: 1;
  strategy: ReleaseStrategyName;
  currentVersion: string;
  newVersion: string;
  suggestedBump: BumpType;
  changelog: string;
  notes: string;
  commits: string;
  preparedAt: string;
  baseCommit: string;
  targetBranch: string;
  releaseBranchCreated: boolean;
  tokens: { input: number; output: number };
}
```

```typescript
// packages/core/src/commands/release.ts (new entry points)
export interface PrepareReleaseOptions extends ReleaseOptions {
  strategy?: ReleaseStrategyName;   // resolved from RepoConfig if omitted
  developBranch?: string;            // default "develop"
}
export interface FinishReleaseOptions {
  cwd: string;
  tagAndPush?: boolean;
  createGhRelease?: boolean;
  deleteReleaseBranch?: boolean;     // default true for gitflow
}
export interface AbortReleaseOptions {
  cwd: string;
  deleteBranch?: boolean;
}

export function prepareRelease(opts: PrepareReleaseOptions): Promise<PersistedReleasePlan>;
export function finishRelease(opts: FinishReleaseOptions): Promise<void>;
export function abortRelease(opts: AbortReleaseOptions): Promise<void>;
```

**Error conventions** — Typed via the existing `Object.assign(new Error(...), { code })` pattern. New error codes:

- `STRATEGY_DEVELOP_MISSING` — GitFlow strategy selected but `developBranch` does not exist.
- `STRATEGY_RELEASE_BRANCH_EXISTS` — `prepare` tried to create a branch that's already there.
- `STALE_PLAN_TAG_EXISTS` — `finish` found `v<newVersion>` already tagged.
- `STALE_PLAN_BRANCH_MISMATCH` — `finish` run from a branch other than `plan.targetBranch`.
- `NO_RELEASE_PLAN` — `finish` or `abort` called without a saved plan.
- `INVALID_PLAN_SCHEMA` — plan file has a schema version this binary cannot read.

The existing `WORKING_TREE_DIRTY`, `TAG_EXISTS`, `NO_COMMITS`, `INVALID_VERSION`, and `NO_PACKAGE_JSON` codes are reused.

### Data Models

The only new persisted artifact is `.gitwise/release-plan.json`, whose shape is `PersistedReleasePlan` (above). It is JSON-serialized via the existing `writeJSON` helper, gitignored, and short-lived (exists only between successful `prepare` and the first `finish`/`abort`).

Config additions (`packages/core/src/config/types.ts`):

```typescript
export interface RepoConfig {
  // existing fields preserved...
  releaseStrategy?: "github-flow" | "gitflow";
  developBranch?: string; // default "develop", only used by gitflow
}
```

No database, no remote storage, no new template files.

### API Endpoints

Not applicable — gitwise has no HTTP surface. The "API" is the CLI subcommands and the core function exports above.

CLI surface:

| Command | Description | Notes |
|---------|-------------|-------|
| `gw release [version]` | One-shot (legacy) | Unchanged UX; internally calls `prepareRelease` + `finishRelease`. |
| `gw release prepare [version]` | Plan + write artifacts + (gitflow) create branch | Stops before tagging. |
| `gw release finish` | Apply persisted plan | Validates plan first. |
| `gw release abort` | Discard plan | Asks before deleting release branch. |

Common flags carried over: `--bump`, `--apply` (alias for confirm-yes in legacy mode), `--no-gh-release`, `--no-workspace-propagation`. New flag: `--no-delete-branch` on `finish` (keeps the release branch after merging — useful when CI re-uses it).

## Integration Points

No new external services. We continue to integrate with:

- **Local `git`** — extended with `mergeNoFf`, `branchExists`, `headSha`, `deleteBranch`. All wrap `execFile("git", …)` through the existing `run` helper with the same timeout (`GIT_TIMEOUT_MS`) and buffer limits. Errors surface as standard `Error` objects; merge conflicts produce a plain failure ("Merge conflict; resolve manually and rerun `gw release finish`") — automated conflict resolution is explicitly out of scope.
- **`gh` CLI** — Existing `isGhAvailable` + `createGitHubRelease`. `finishRelease` uses them unchanged.
- **LLM provider** — Only used in `prepareRelease`. The provider interface is unchanged.

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|-----------|-------------|----------------------|-----------------|
| `packages/core/src/commands/release.ts` | Modified | Adds `prepareRelease`/`finishRelease`/`abortRelease`; refactors `applyRelease` to consume `PersistedReleasePlan`. Risk: legacy `gw release` regression if the unified path differs from today's behavior. | Cover with existing `release.test.ts` plus new tests for each phase. |
| `packages/core/src/commands/release-plan.ts` | New | Pure filesystem helpers. Risk: low. | New file + unit tests. |
| `packages/core/src/strategies/release.ts` | New | Two stateless strategy implementations + factory. Risk: low. | New file + unit tests. |
| `packages/core/src/config/types.ts` | Modified | Two new optional `RepoConfig` fields. Risk: zero (additive optionals). | Type-only change. |
| `packages/core/src/infra/git.ts` | Modified | Four new helpers (`mergeNoFf`, `branchExists`, `headSha`, `deleteBranch`). Risk: low. | Wrap existing `run()`. |
| `packages/core/src/index.ts` | Modified | Re-export new types and functions. | Additive. |
| `packages/cli/src/commands/release.ts` | Modified | Add three subcommands; keep root action as legacy one-shot. Risk: command surface change visible to users. | Update `--help`, README snippet, and integration smoke test. |
| `packages/skills/skills/release.md` and `packages/skills/scripts/release.ts` | Modified | Surface `prepare`/`finish` to Claude Code. Risk: skill markdown drift from CLI. | Mirror the CLI help text in the skill md. |
| `.gitignore` (target repos) | Modified at runtime | `prepare` appends `.gitwise/release-plan.json` if missing. Risk: surprises users. | Print a one-line notice when we modify it. |
| `CHANGELOG.md` (gitwise itself) | Modified | Release notes for the new lifecycle. Risk: none. | Standard release-time entry. |
| `README.md` | Modified | Document `release prepare`/`finish`/`abort` and the GitFlow opt-in. | Doc-only change. |
| Existing `release()` function | Deprecated (soft) | Still exported and used by the legacy path; future task can collapse it into `prepareRelease`. | None now — flagged in inline comment. |

## Testing Approach

### Unit Tests

Co-located under `packages/core/__tests__/unit/commands/` and `…/strategies/`. We use the existing `MockLLMProvider` from `packages/core/src/testing/`.

- **`release-plan.test.ts`** — save → load round-trips; schema-version rejection; `ensureGitignored` with (a) no `.gitignore`, (b) entry missing, (c) entry present, (d) wildcard `.gitwise/` already covers it; delete is idempotent.
- **`strategies/release.test.ts`** — `github-flow`: `releaseBranchFor` returns null, `mergeTargets("main")` returns `["main"]`, `requiresDevelop()` false. `gitflow`: `releaseBranchFor("1.2.0")` returns `"release/1.2.0"`, `mergeTargets("main","develop")` returns `["main","develop"]`, `requiresDevelop()` true.
- **`release.test.ts` (extend)** — `prepareRelease` happy path on github-flow (no branch created, plan written, manifests bumped only after `finish`); happy path on gitflow (branch created, manifest + changelog on release branch, plan written); error paths: `NO_COMMITS`, `STRATEGY_DEVELOP_MISSING`, `STRATEGY_RELEASE_BRANCH_EXISTS`, `WORKING_TREE_DIRTY`. `finishRelease`: happy paths for both strategies (verify merges happen in `mergeTargets` order, single tag created, `gh` invoked once, plan deleted); validation failures (`STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `NO_RELEASE_PLAN`, `INVALID_PLAN_SCHEMA`). `abortRelease`: deletes plan; with `deleteBranch:true`, deletes release branch only when fully merged.
- **Legacy `release()` regression** — keep existing test suite green; add a single test asserting `gw release [version]` produces the same `package.json`, `CHANGELOG.md`, tag, and `gh` invocation as before.

**Mocking boundaries**: `git.*` and `github.*` are stubbed via existing test utilities; LLM via `MockLLMProvider`. Filesystem hits a per-test temp dir (already the convention).

### Integration Tests

Run from `packages/core/__tests__/integration/` (new directory; mirrors the unit folder layout). Each test spins up an isolated git repo via the existing test helpers.

- **GitFlow lifecycle** — Init repo with `main` + `develop` + a feature merged into develop; run `prepareRelease`; assert: `release/X.Y.Z` exists with bumped manifest, `release-plan.json` present, `.gitignore` updated, no tag yet. Run `finishRelease`; assert: tag created, both `main` and `develop` contain the release commit, plan file gone, release branch gone.
- **GitHub-flow lifecycle** — `prepareRelease` then `finishRelease` against a single-branch repo; assert no branch is created during prepare, manifest bumps happen in `finish` (matching today's behavior on the legacy path).
- **Resume after edited notes** — `prepare`, manually rewrite `.gitwise/release-X.Y.Z.md`, run `finish`; assert the GitHub release body matches the edited file, not the original LLM output.
- **Stale-plan recovery** — `prepare`, then manually create `vX.Y.Z` tag, then run `finish`; assert `STALE_PLAN_TAG_EXISTS` with the plan still on disk; `abort` cleans up.
- **Legacy one-shot** — `gw release --apply` flow end-to-end; assert behavior is byte-identical to current snapshot tests.

**Test data**: small fixture repos created in temp dirs; conventional commits seeded via the existing helpers. No network; `gh` is stubbed.

## Development Sequencing

### Build Order

1. **Config additions** — extend `RepoConfig` with `releaseStrategy` and `developBranch`. *No dependencies.*
2. **Git infra helpers** — add `mergeNoFf`, `branchExists`, `headSha`, `deleteBranch` to `infra/git.ts`. *No dependencies.*
3. **Strategy module** — implement `strategies/release.ts` with `ReleaseStrategy`, the two impls, and `createReleaseStrategy`. *Depends on step 1 (types).*
4. **Plan persistence module** — implement `commands/release-plan.ts` (`PersistedReleasePlan`, `saveReleasePlan`, `loadReleasePlan`, `deleteReleasePlan`, `ensureGitignored`). *Depends on step 3 for the `ReleaseStrategyName` import only.*
5. **`prepareRelease`** — new function in `commands/release.ts`. Reuses the existing `release()` planner for LLM calls; adds branch creation, manifest writes on the release branch, plan save. *Depends on steps 2, 3, 4.*
6. **`finishRelease`** — refactors `applyRelease()` into a consumer of `PersistedReleasePlan`; performs validation, merges per strategy, tag, push, gh release, plan delete, optional branch delete. *Depends on steps 2, 3, 4.*
7. **`abortRelease`** — small helper that deletes the plan and optionally the branch. *Depends on steps 2, 4.*
8. **Legacy one-shot wiring** — refactor the exported `release()` action and CLI root action so they call steps 5 → 6 in sequence against an in-memory plan that's also written/read from disk (keeps a single code path). *Depends on steps 5, 6.*
9. **Unit tests** — write/extend tests for every new module above. *Depends on steps 3–8.*
10. **Integration tests** — full lifecycle harnesses for both strategies plus stale-plan and legacy paths. *Depends on steps 5–8.*
11. **CLI subcommands** — add `prepare`, `finish`, `abort` under the existing `release` command in `packages/cli/src/commands/release.ts`; render typed errors with recovery hints. *Depends on steps 5–8.*
12. **Skill surface** — update `packages/skills/skills/release.md` and `packages/skills/scripts/release.ts` to expose the new subcommands. *Depends on step 11.*
13. **Docs** — update `README.md` and add a CHANGELOG entry. *Depends on step 11.*

### Technical Dependencies

- The existing `MockLLMProvider` covers LLM mocking — no new infra needed.
- The `@clack/prompts` interactive layer is already a CLI dep — no new packages.
- `gh` and local `git` are existing runtime deps; no version bumps required for the new git ops.

## Monitoring and Observability

Gitwise is a local-only CLI; no remote telemetry exists or is being added. Observability remains:

- **`debug()` logs** via the existing `infra/logger.ts` (gated by `DEBUG=gitwise:*`). Add structured debug events: `release.prepare.start`, `release.prepare.branch.created`, `release.prepare.plan.saved`, `release.finish.start`, `release.finish.validate.failed`, `release.finish.merge.target`, `release.finish.tag.pushed`, `release.abort.start`.
- **Token usage reporting** — each `prepareRelease` returns `tokens.input` / `tokens.output`, which the CLI already prints per the PRD's cost-transparency goal.
- **No metrics endpoints, no alert thresholds.** Failures surface as typed errors and non-zero exit codes; CI consumers can branch on the exit code.

## Technical Considerations

### Key Decisions

- **Decision**: Persist the plan to `.gitwise/release-plan.json` between phases.
  - **Rationale**: GitFlow's release model is multi-session; in-memory state can't cross processes.
  - **Trade-offs**: Adds an on-disk state file with its own lifecycle and integrity rules.
  - **Alternatives rejected**: Re-planning on `finish` (doubles LLM cost, drifts from approved output); custom git ref (heavier than needed). See [ADR-001](adrs/adr-001.md), [ADR-003](adrs/adr-003.md).
- **Decision**: Introduce a release-scoped `ReleaseStrategy` rather than the full `FlowStrategy` from the design doc.
  - **Rationale**: YAGNI — only release behavior changes in this task.
  - **Trade-offs**: A future broader pivot will rename or absorb this interface.
  - **Alternatives rejected**: Full `FlowStrategy` (5x surface, blocked on unrelated work); inline branching (no isolated tests). See [ADR-002](adrs/adr-002.md).
- **Decision**: Keep `gw release` one-shot as the default behavior.
  - **Rationale**: PRD's primary persona is a solo OSS maintainer for whom GitFlow is overkill; preserving the current UX avoids forcing a workflow change on anyone who doesn't opt in.
  - **Trade-offs**: One legacy code path persists; collapsed in a follow-up.
- **Decision**: `finish` reloads notes from `.gitwise/release-<version>.md` (file on disk), not from `plan.notes` (in-memory string).
  - **Rationale**: Lets users edit notes between phases — the original motivation for the split.
  - **Trade-offs**: `finish` now reads two artifacts (plan JSON + notes md) instead of one.

### Known Risks

- **User edits `release-plan.json` by hand and breaks the schema** — low likelihood, documented as "do not edit". Integrity check catches malformed JSON or unknown schema versions.
- **Long stabilization window: many new commits land on the release branch between `prepare` and `finish`** — the LLM-generated changelog drifts from reality. Mitigation: `finish` compares `plan.baseCommit` with the current HEAD of the release branch; if they differ, print a warning suggesting a `prepare --refresh` (deferred to a follow-up task — for now the warning is enough).
- **Merge conflicts during `finish`** — GitFlow merges into both `main` and `develop` can conflict if `main` advanced. We do not automate resolution; we abort the merge, leave the user in a clean state, and document the manual recovery in the error message. Conflict resolution is out of scope per this task's narrow framing.
- **`gh release` failure after tag is pushed** — current `applyRelease` already documents this graceful-degradation path; we carry it forward unchanged.

## Architecture Decision Records

- [ADR-001: Split `release` into explicit `prepare` and `finish` subcommands](adrs/adr-001.md) — Two phases backed by a persisted plan file; legacy one-shot preserved.
- [ADR-002: Minimal release-scoped strategy abstraction, not a full FlowStrategy](adrs/adr-002.md) — A 30-line `ReleaseStrategy` interface covering only release behavior; broader pivot deferred.
- [ADR-003: Release plan file lifecycle and integrity checks](adrs/adr-003.md) — Atomic write last in `prepare`, atomic delete first in `finish`, typed validation errors on stale state.
