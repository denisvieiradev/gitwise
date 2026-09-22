# Codex/Kiro/Copilot Support Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/codex-kiro-copilot-support/design.md`
**Status**: Approved

**Execution preferences (user-confirmed):**
- Tools per task: none beyond the standard Read/Write/Edit/Bash toolset — no extra MCP or skill wired into individual tasks.
- Sub-agent batches: confirmed. 26 tasks pack into batches of whole phases (~7 tasks/worker) rather than running inline.
- Additional gate: run the `code-review` skill at the end of each phase, before that phase's tasks are considered closed and the next batch starts — on top of (not instead of) each task's own `Tests`/`Gate` requirement.

---

## Test Coverage Matrix

> Generated from codebase sampling. Guidelines found: none dedicated (no `AGENTS.md`/testing doc), but `jest.config.ts` (root, multi-project) + per-package `jest.config.ts` + `coverageThreshold` establish an enforced baseline, and the repo already tests documentation content as its own layer (`packages/cli/__tests__/{readme-content,docs-presence,security-docs,manifest}.test.ts`) — that existing pattern is the floor for the new Documentation layer below, exceeding the generic "config/entity = none" default.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Provider (`CliSubprocessProvider`, `CliProviderSpec` adapters for claude/codex/copilot/kiro) | unit | All branches (spawn success/failure, ENOENT, large-prompt stdin threshold, non-JSON stderr, `tokensAvailable` true/false); 1:1 to PROV-01..07 | `packages/core/__tests__/unit/providers/*.test.ts` | `npm test -w @denisvieiradev/gitwise-core` |
| Config (`ProviderKind`, `ModelsByProvider`, migration, merge) | unit | All branches incl. legacy-flat-shape migration, invalid-provider fallback, repo-override scoping; 1:1 to MDL-01..07 | `packages/core/__tests__/unit/config/*.test.ts` | `npm test -w @denisvieiradev/gitwise-core` |
| `buildProviderConfig` / `createProvider` factory | unit | All 5 provider kinds resolve correct `ProviderConfig`; 1:1 to PROV-07, MDL-03 | `packages/core/__tests__/unit/providers/*.test.ts` | `npm test -w @denisvieiradev/gitwise-core` |
| Command types + release-plan persistence (`tokensAvailable` threading) | integration | Every command's returned type carries `tokensAvailable` correctly; `release-plan.ts` validator accepts legacy plans missing the field; existing `release-plan.test.ts`/`release-lifecycle.test.ts` extended, not replaced | `packages/core/__tests__/unit/commands/*.test.ts`, `packages/core/__tests__/integration/release-plan.test.ts` | `npm test -w @denisvieiradev/gitwise-core` |
| CLI commands (`gw provider`, `gw skills install`, `gw config` validation, first-run detection) | unit | Every new/changed command: happy path + every listed edge case + error path; matches existing `packages/cli/__tests__/{config,first-run,commands}.test.ts` depth | `packages/cli/__tests__/*.test.ts` | `npm test -w @denisvieiradev/gitwise` |
| `gw skills install` filesystem effects (overwrite-safety, directory creation) | integration | Install into a scratch temp dir; re-install overwrites gitwise-owned paths only; unrelated pre-existing files survive; matches DIST-01..06 | `packages/cli/__tests__/skills-install.test.ts` | `npm test -w @denisvieiradev/gitwise` |
| Skill/adapter generator (`generate-adapters.ts`) | unit | Every generated tool's output has valid frontmatter + correct script-path reference; 1:1 to SKILL-01..08 | `packages/skills/__tests__/*.test.ts` | `npm test -w @denisvieiradev/gitwise-skills` |
| Documentation content (README.md, docs site) | unit (content-assertion, matching existing repo convention) | Every DOC-01..07 claim has a corresponding assertion (section text, table row, or code-fence content) | `packages/cli/__tests__/{readme-content,docs-presence}.test.ts` | `npm test -w @denisvieiradev/gitwise` |
| Gemini removal | none | Absence check only — no code layer created | N/A | `git ls-files .gemini` (build gate only) |

**Coverage Expectation values** — no project-wide guideline document exists; the strong default (full branch/AC coverage for domain logic, happy+edge+error for CLI/integration) applies, with the Documentation row's expectation raised above the generic "none" default to match the repo's own existing doc-testing convention (a genuine floor, not a target invented for this feature).

## Gate Check Commands

> `<package>` = whichever workspace the task's `Where` touches (`@denisvieiradev/gitwise-core`, `@denisvieiradev/gitwise`, or `@denisvieiradev/gitwise-skills`).

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | After a task touching only one workspace's unit tests | `npm test -w <package>` |
| Full | After a task touching more than one workspace, or integration tests | `npm test` (root, all workspace projects) |
| Build | After phase completion | `npm run build && npm run lint && npm run typecheck && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Shared CLI-subprocess provider base

```
T1 → T2 → T3 → T4
```

### Phase 2: Codex/Copilot/Kiro provider specs

```
T4 → T5 → T6 → T7 → T8
```

(T4 → T5 is the cross-phase edge from Phase 1; T4 itself is defined and executed in Phase 1.)

### Phase 3: Per-provider model configuration

```
T4 → T9 → T10 → T11 → T12 → T13
```

(T4 → T9 is the cross-phase edge from Phase 1.)

### Phase 4: Token-usage availability plumbing

```
T8 → T14 → T15 → T16 → T17
```

(T8 → T14 is the cross-phase edge from Phase 2.)

### Phase 5: Provider switching UX

```
T8 → T18 → T19 → T20
```

(T8 → T18 is the cross-phase edge from Phase 2.)

### Phase 6: Real native-surface distribution + Gemini removal

```
T21 → T22 → T23 → T24
```

### Phase 7: Documentation accuracy

```
T24 → T25 → T26
```

(T24 → T25 is the cross-phase edge from Phase 6.)

---

## Task Breakdown

### T1: Add characterization tests for `ClaudeCodeProvider` before refactor

**What**: Add unit tests covering every existing branch of `ClaudeCodeProvider` (spawn success, non-zero exit with/without parseable stdout, ENOENT → `PROVIDER_UNAVAILABLE`, large-prompt stdin path, small-prompt argv path, non-JSON stderr filtering) so the upcoming extraction has a real regression safety net beyond the current 2 tests.
**Where**: `packages/core/__tests__/unit/providers/claude-code.test.ts` (extend)
**Depends on**: None
**Reuses**: Existing 2 tests in the same file as the mocking pattern for `child_process.spawn`
**Requirement**: N/A — regression-safety prerequisite for PROV-01..07 and AD-001 (see design.md Risks & Concerns)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Every branch listed in design.md's Risks & Concerns row for this file has at least one test
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: existing 2 tests still pass + at least 6 new tests added (8+ total in the file)

**Tests**: unit
**Gate**: quick

**Commit**: `test(core): add characterization tests for ClaudeCodeProvider before refactor`

---

### T2: Extract `CliSubprocessProvider` base + `CliProviderSpec` type; refactor Claude onto it

**What**: Create `packages/core/src/providers/cli-subprocess.ts` implementing the shared spawn/timeout/stderr-capture/ENOENT-wrapping logic as `CliSubprocessProvider`, parameterized by a `CliProviderSpec` (defined in `providers/types.ts`). Refactor `ClaudeCodeProvider` in `claude-code.ts` to construct a `CliSubprocessProvider` with a Claude-specific spec instead of duplicating the spawn logic itself.
**Where**: `packages/core/src/providers/cli-subprocess.ts` (new), `packages/core/src/providers/claude-code.ts` (refactor), `packages/core/src/providers/types.ts` (add `CliProviderSpec`)
**Depends on**: T1
**Reuses**: `claude-code.ts`'s existing `spawnClaude`/`callViaCli`/`callViaStdin`/`wrapError`/`LARGE_PROMPT_THRESHOLD`/`parseResponse` logic, generalized
**Requirement**: AD-001 (see design.md Components: `CliSubprocessProvider`, `CliProviderSpec`)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CliSubprocessProvider` and `CliProviderSpec` exist per design.md's interface definitions
- [x] `ClaudeCodeProvider`'s public behavior is unchanged — all tests from T1 still pass unmodified
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: all tests from T1 pass (8+), no test deleted or weakened

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(core): extract CliSubprocessProvider base from ClaudeCodeProvider`

---

### T3: Centralize `ProviderKind`; extend `LLMChatResponse` with `tokensAvailable`

**What**: Add `export type ProviderKind = "api" | "claude-code" | "codex" | "copilot" | "kiro"` to `providers/types.ts`; add `tokensAvailable: boolean` to `LLMChatResponse`. Update `AnthropicProvider` and the refactored `ClaudeCodeProvider`/`CliSubprocessProvider` (Claude spec) to always set `tokensAvailable: true` (both report real usage today).
**Where**: `packages/core/src/providers/types.ts`, `packages/core/src/providers/anthropic.ts`, `packages/core/src/providers/cli-subprocess.ts`
**Depends on**: T2
**Reuses**: Existing `LLMChatResponse` shape, extended not replaced
**Requirement**: AD-002 (part 1 of the `tokensAvailable` threading)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ProviderKind` is defined once in `providers/types.ts`, not duplicated elsewhere
- [x] `LLMChatResponse.tokensAvailable` exists and is `true` for both existing providers' every test case
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: all prior tests pass + new assertions on `tokensAvailable: true` added to `anthropic.test.ts` and `claude-code.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): centralize ProviderKind and add tokensAvailable to LLMChatResponse`

---

### T4: Update `ModelConfig`/`ProviderConfig` types for the shared-base shape

**What**: Confirm/adjust `ProviderConfig` (`kind: ProviderKind`, plus per-tool CLI path fields: `claudeCliPath`, `codexCliPath`, `copilotCliPath`, `kiroCliPath`) so `createProvider()` has everywhere it needs to construct any of the 5 providers, without yet adding Codex/Copilot/Kiro implementations (that's Phase 2).
**Where**: `packages/core/src/providers/types.ts`, `packages/core/src/providers/factory.ts`
**Depends on**: T3
**Reuses**: Existing `ProviderConfig` interface, extended
**Requirement**: PROV-07 (cross-cutting provider config shape)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ProviderConfig` has all 4 CLI-path fields, all optional
- [x] `createProvider()` still returns the correct provider for `"api"`/`"claude-code"` (Codex/Copilot/Kiro branches added in Phase 2, currently absent is fine — type-checks either way)
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: existing `factory`-adjacent tests (if any) still pass; no regression

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): extend ProviderConfig with per-tool CLI path fields`

---

### T5: Implement Codex provider spec

**What**: Create `packages/core/src/providers/codex.ts` exporting `resolveCodexBinary()` (mirroring `resolveClaudeBinary`'s candidate-path/PATH/nvm precedence, adapted to Codex's actual install locations) and a `CliProviderSpec` implementing `buildArgs`/`parseOutput` for `codex exec --json`. Before writing `buildArgs`/`parseOutput`, verify the real flag names and JSON shape against the installed Codex CLI's `--help`/docs (Knowledge Verification Chain) rather than assuming today's research is final — confirm in particular whether the `--json` stream includes a usage field.
**Where**: `packages/core/src/providers/codex.ts` (new)
**Depends on**: T4
**Reuses**: `CliProviderSpec` interface (T2), `resolveClaudeBinary`'s shape as a template
**Requirement**: PROV-01, PROV-02, PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `resolveCodexBinary()` follows the same precedence as `resolveClaudeBinary`
- [x] `buildArgs`/`parseOutput` verified against real Codex CLI behavior (documented in a code comment citing what was checked, per the spec's logged assumption) — not left as an untested guess
- [x] `tokensAvailable` is set correctly based on the verified presence/absence of a usage field
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: new `codex.test.ts` with binary-resolution + buildArgs + parseOutput (success, no-usage, malformed-output) cases — 6+ tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add Codex CLI provider spec`

---

### T6: Implement Copilot provider spec

**What**: Create `packages/core/src/providers/copilot.ts` exporting `resolveCopilotBinary()` and a `CliProviderSpec` for `copilot -p ... --no-ask-user`. Verify real flag names against the installed Copilot CLI (or its current docs) before finalizing `buildArgs`. `parseOutput` always returns `tokens: null` (`tokensAvailable: false`), per confirmed research that Copilot CLI reports no usage in headless mode.
**Where**: `packages/core/src/providers/copilot.ts` (new)
**Depends on**: T5
**Reuses**: Same `CliProviderSpec` pattern as T5
**Requirement**: PROV-03, PROV-04, PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `resolveCopilotBinary()` follows the same precedence pattern
- [x] `buildArgs` verified against real Copilot CLI flags
- [x] `parseOutput` always sets `tokensAvailable: false`
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: new `copilot.test.ts`, 5+ tests (binary resolution, buildArgs, parseOutput, ENOENT, non-zero exit)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add Copilot CLI provider spec`

---

### T7: Implement Kiro provider spec

**What**: Create `packages/core/src/providers/kiro.ts` exporting `resolveKiroBinary()` and a `CliProviderSpec` for `kiro-cli chat --no-interactive`. Verify real flag names against Kiro's current docs (no live paid account available, per logged assumption — verification is documentation-based for this provider). `parseOutput` always returns `tokens: null`.
**Where**: `packages/core/src/providers/kiro.ts` (new)
**Depends on**: T6
**Reuses**: Same `CliProviderSpec` pattern as T5/T6
**Requirement**: PROV-05, PROV-06, PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `resolveKiroBinary()` follows the same precedence pattern
- [x] `buildArgs`/`parseOutput` match Kiro's documented CLI contract (mocked subprocess I/O in tests, per the spec's logged assumption — no live-account test)
- [x] `parseOutput` always sets `tokensAvailable: false`
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: new `kiro.test.ts`, 5+ tests (binary resolution, buildArgs, parseOutput against a mocked documented response shape, ENOENT, non-zero exit)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add Kiro CLI provider spec`

---

### T8: Wire Codex/Copilot/Kiro into `createProvider()`

**What**: Update `factory.ts`'s `createProvider()` to construct a `CliSubprocessProvider` with the Codex/Copilot/Kiro specs for `kind: "codex" | "copilot" | "kiro"`, resolving each tool's CLI path from `ProviderConfig`.
**Where**: `packages/core/src/providers/factory.ts`
**Depends on**: T7
**Reuses**: `CliSubprocessProvider` (T2), the three specs (T5-T7)
**Requirement**: PROV-01, PROV-03, PROV-05, PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `createProvider({ kind: "codex" | "copilot" | "kiro", ... })` returns a working `LLMProvider` for each
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: `factory.test.ts` (new or extended) covers all 5 `kind` values — 5+ tests

**Tests**: unit
**Gate**: full

**Commit**: `feat(core): wire Codex/Copilot/Kiro into the provider factory`

---

### T9: Define `ModelsByProvider` and update `UserConfig`/`DEFAULT_USER_CONFIG`

**What**: Change `UserConfig.models` from `ModelConfig` to `ModelsByProvider = Record<ProviderKind, ModelConfig>`; add `codexCliPath`/`copilotCliPath`/`kiroCliPath` to `UserConfig`; update `DEFAULT_USER_CONFIG.models` to hold all 5 provider keys with sensible current default model IDs (Claude's two entries unchanged; Codex/Copilot/Kiro defaults verified against each vendor's current documented model catalog — Knowledge Verification Chain, not invented).
**Where**: `packages/core/src/config/types.ts`
**Depends on**: T4
**Reuses**: Existing `UserConfig`/`ModelConfig`/`DEFAULT_USER_CONFIG`, extended
**Requirement**: MDL-01, MDL-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ModelsByProvider` type exists, keyed by all 5 `ProviderKind` values
- [x] `DEFAULT_USER_CONFIG.models` has real, verified default model IDs for every provider (documented via comment citing the source checked)
- [x] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [x] Test count: existing `config.test.ts` updated for the new shape, no test silently deleted

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): make UserConfig.models a per-provider map`

---

### T10: Implement flat→per-provider `models` migration in `readUserConfig`

**What**: In `config/user.ts`'s `readUserConfig`, detect the legacy flat `models: {fast, balanced, powerful}` shape, migrate it into `models[<configured provider>]` (or backfill every key from defaults if `provider` is itself invalid/unrecognized, per spec Edge Cases), backfill the other 4 provider keys from `DEFAULT_USER_CONFIG.models`, and persist the migrated shape immediately (write-through on first read).
**Where**: `packages/core/src/config/user.ts`
**Depends on**: T9
**Reuses**: Existing `readUserConfig`/`mergeWithDefaults`/`writeJSON` plumbing
**Requirement**: MDL-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A pre-feature flat-shape config file migrates correctly on first read, with the migrated shape persisted to disk
- [ ] An invalid/unrecognized `provider` value in a legacy config backfills all 5 keys from defaults rather than guessing
- [ ] A config already in the new shape is read through unchanged (no double-migration)
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [ ] Test count: `config.test.ts` gains 4+ new migration-specific tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): migrate legacy flat models config to per-provider shape`

---

### T11: Fix `config/merge.ts` to scope `RepoConfig.models` override to the active provider

**What**: Rewrite `deepMerge`'s `models` merge (currently `{ ...base.models, ...(override.models ?? {}) }`, which would corrupt the per-provider map) to merge `override.models` into `base.models[base.provider]` only, leaving every other provider's block untouched.
**Where**: `packages/core/src/config/merge.ts`
**Depends on**: T10
**Reuses**: Existing `deepMerge` function, corrected in place
**Requirement**: MDL-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A `<repo>/.gitwise.json` `models` override changes only the currently-active provider's tier values
- [ ] Every other provider's model block is byte-for-byte unchanged by a repo override
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [ ] Test count: `merge`-adjacent tests (new file or extended `config.test.ts`) gain 3+ cases covering this exact scoping

**Tests**: unit
**Gate**: quick

**Commit**: `fix(core): scope repo-level models override to the active provider only`

---

### T12: Add `buildProviderConfig()` and replace the 8 duplicated call sites

**What**: Add `buildProviderConfig(merged: MergedConfig, apiKey?: string): ProviderConfig` to `factory.ts`, resolving `models[merged.provider]` and all 4 CLI-path fields in one place. Replace the inline `{ kind: config.provider, models: config.models, ... }` object literals in `packages/cli/src/commands/{commit,review,pr,release}.ts` and `packages/skills/scripts/{commit,review,pr,release}.ts` (8 call sites) with calls to this helper.
**Where**: `packages/core/src/providers/factory.ts`, `packages/cli/src/commands/{commit,review,pr,release}.ts`, `packages/skills/scripts/{commit,review,pr,release}.ts`
**Depends on**: T11
**Reuses**: `MergedConfig`, `ProviderConfig` types; the 8 existing call sites' logic, consolidated
**Requirement**: MDL-03, MDL-04, PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All 8 call sites use `buildProviderConfig` — no remaining inline `{ kind: config.provider, models: config.models, ... }` literal in the codebase
- [ ] Each of the 4 `gw` commands still produces correct output against a mocked provider for every one of the 5 `ProviderKind` values
- [ ] Gate check passes: `npm test` (root — this task spans 3 workspaces)
- [ ] Test count: existing command tests in `packages/core/__tests__/unit/commands/*.test.ts` and `packages/cli/__tests__/commands.test.ts` still pass unmodified; `factory.test.ts` gains a `buildProviderConfig` unit test per provider kind (5+)

**Tests**: integration
**Gate**: full

**Commit**: `refactor(core,cli,skills): consolidate provider-config construction into buildProviderConfig`

---

### T13: Extend `gw config` validation for the new provider/model keys

**What**: Update `VALID_KEYS` and the get/set logic in `packages/cli/src/commands/config.ts` to: (a) validate `provider` against the full 5-value enum, rejecting unrecognized values with a clear error listing valid choices; (b) support `models.<tier>` (active-provider shorthand) and `models.<provider>.<tier>` (explicit provider) dot-paths; (c) accept the 3 new CLI-path keys.
**Where**: `packages/cli/src/commands/config.ts`
**Depends on**: T12
**Reuses**: Existing `VALID_KEYS`/`getNestedValue`/`setNestedValue` machinery
**Requirement**: CFG-03, MDL-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `gw config provider codex` (and copilot/kiro) succeeds; `gw config provider bogus` fails with a clear, valid-values-listing error and does not write
- [ ] `gw config models.fast <id>` writes to the active provider's block; `gw config models.codex.fast <id>` writes to Codex's block regardless of active provider
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: `config.test.ts` (cli package) gains 5+ new cases

**Tests**: unit
**Gate**: quick

**Commit**: `feat(cli): validate provider values and support per-provider models keys in gw config`

---

### T14: Thread `tokensAvailable` through command result types

**What**: Add `tokensAvailable: boolean` to `CommitPlan`, `ReviewResult`, `PrDraft`, and `ReleasePlan` types in `packages/core/src/commands/{commit,review,pr,release,release-plan}.ts`, populated from the underlying `LLMChatResponse.tokensAvailable` at every call site that currently reads `.tokens`.
**Where**: `packages/core/src/commands/{commit,review,pr,release,release-plan}.ts`
**Depends on**: T8
**Reuses**: Existing `tokens: {input, output}` field on each type, extended with a sibling field
**Requirement**: PROV-07 (n/a-token-usage user-facing contract), AD-002

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every one of the 4 result types carries `tokensAvailable`
- [ ] Every place that currently reads `response.tokens.input/output` also reads/propagates `response.tokensAvailable`
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [ ] Test count: `commit.test.ts`, `review.test.ts`, `pr.test.ts`, `release.test.ts` each gain a `tokensAvailable: false` case using the `MockLLMProvider` test harness (updated in this task to support it) — 4+ new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): thread tokensAvailable through commit/review/pr/release result types`

---

### T15: Update `release-plan.ts` persisted schema + validator for `tokensAvailable`

**What**: Add `tokensAvailable` to the persisted `.gitwise/release-plan.json` schema; update the validator (`release-plan.ts:99`-area) to accept a plan file missing the field, defaulting it to `true` for backward compatibility with plans created before this feature.
**Where**: `packages/core/src/commands/release-plan.ts`
**Depends on**: T14
**Reuses**: Existing schema validator function, extended
**Requirement**: PROV-07, AD-002

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A plan file with `tokensAvailable` present validates and round-trips correctly
- [ ] A plan file missing `tokensAvailable` (simulating a pre-upgrade file) validates successfully with the field defaulted to `true`
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [ ] Test count: `release-plan.test.ts` (unit) gains 2+ cases; `integration/release-plan.test.ts` extended to cover a `finish` on a legacy-shape plan

**Tests**: integration
**Gate**: full

**Commit**: `feat(core): add tokensAvailable to release-plan schema with backward-compatible default`

---

### T16: Update `release.ts` multi-call token aggregation

**What**: Update `release.ts`'s aggregation (`totalInput += ...` across the version/changelog/notes calls) to compute an aggregate `tokensAvailable` as the logical AND of every contributing call's `tokensAvailable`.
**Where**: `packages/core/src/commands/release.ts`
**Depends on**: T15
**Reuses**: Existing aggregation logic, extended with one boolean accumulator
**Requirement**: PROV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All-calls-report-usage case aggregates to `tokensAvailable: true`
- [ ] Any-call-doesn't-report-usage case aggregates to `tokensAvailable: false`
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-core`
- [ ] Test count: `release.test.ts` gains 2+ new cases for the aggregation branches

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): aggregate tokensAvailable across release's multi-call flow`

---

### T17: Update CLI print statements to show `tokens: n/a`

**What**: Update the 5 `console.log(chalk.dim(...Tokens: ...))` call sites in `packages/cli/src/commands/{commit,review,pr,release}.ts` (commit.ts has 2) to print `Tokens: n/a` when `tokensAvailable` is `false`, instead of `0 in / 0 out`.
**Where**: `packages/cli/src/commands/{commit,pr,review,release}.ts`
**Depends on**: T16
**Reuses**: Existing print statements, condition added
**Requirement**: PROV-07 (the user-visible half of the graceful-degradation decision)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every one of the 5 print sites shows `n/a` when `tokensAvailable` is `false`, and the real numbers otherwise
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: `commands.test.ts` (cli package) gains a case per command asserting the `n/a` output — 4+ new tests

**Tests**: unit
**Gate**: full

**Commit**: `feat(cli): print tokens: n/a when a provider doesn't report usage`

---

### T18: Implement `detectAvailableProviders()`

**What**: Create `packages/cli/src/detect-providers.ts` exporting `detectAvailableProviders(): DetectedProvider[]`, calling each of the 4 CLI providers' `resolveXBinary()` functions and returning `{ kind, label, binaryPath }` for all 5 `ProviderKind` values (API always "available" since it needs only a key, not a binary).
**Where**: `packages/cli/src/detect-providers.ts` (new)
**Depends on**: T8
**Reuses**: The 4 `resolveXBinary()` functions from the provider stack
**Requirement**: CFG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Returns all 5 providers with correct detected/not-detected state based on mocked binary resolution
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: new `detect-providers.test.ts`, 5+ cases (one per provider's detected/not-detected state, plus the "multiple detected" case)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(cli): add shared detectAvailableProviders utility`

---

### T19: Refactor `first-run.ts` to detect and offer all 5 providers

**What**: Update `runFirstRun` to use `detectAvailableProviders()` instead of only checking Claude Code, presenting every detected CLI as a choice (in detection order) before falling back to the Anthropic API key prompt — preserving today's exact fallback behavior when nothing is detected or chosen.
**Where**: `packages/cli/src/first-run.ts`
**Depends on**: T18
**Reuses**: Existing `@clack/prompts` interaction pattern in `runFirstRun`, `detectAvailableProviders` (T18)
**Requirement**: CFG-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] First-run wizard offers every detected provider, not just Claude Code
- [ ] Existing "nothing detected → API key prompt" behavior is unchanged (existing `first-run.test.ts` cases pass unmodified)
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: `first-run.test.ts` gains 3+ new cases (multi-provider detected, only-one-non-Claude detected, none detected still falls back)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(cli): detect and offer all supported providers in the first-run wizard`

---

### T20: Implement `gw provider` interactive command

**What**: Create `packages/cli/src/commands/provider.ts` exporting `makeProviderCommand()`, listing `detectAvailableProviders()`'s output via `@clack/prompts`, and on selection writing `~/.gitwise/config.json` the same way `runFirstRun` does (including the resolved CLI path when applicable). Wire it into `packages/cli/src/program.ts`.
**Where**: `packages/cli/src/commands/provider.ts` (new), `packages/cli/src/program.ts`
**Depends on**: T19
**Reuses**: `detectAvailableProviders` (T18), `writeUserConfig`, `runFirstRun`'s prompt pattern
**Requirement**: CFG-01, CFG-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `gw provider` lists all detected/available providers and persists the user's selection correctly, including the CLI path when relevant
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: new `provider.test.ts`, 4+ cases (selection persists correctly for a CLI-based provider, for `api`, cancellation leaves config untouched, command is registered in `program.ts`)

**Tests**: unit
**Gate**: full

**Commit**: `feat(cli): add interactive gw provider command`

---

### T21: Implement the adapter generator (`generate-adapters.ts`)

**What**: Create `packages/skills/scripts/generate-adapters.ts`, reading `packages/skills/skills/*/SKILL.md` (frontmatter + instructions) and the built `dist/scripts/*` script names, and emitting Codex's `SKILL.md` (targeting `.agents/skills/gitwise-<command>/`), Kiro's `SKILL.md` (targeting `.kiro/skills/gitwise-<command>/`), and Copilot's single `gitwise.instructions.md` (with `applyTo` frontmatter) into `packages/skills/dist/adapters/{codex,kiro,copilot}/...`. Wire it into `packages/skills`'s `build` npm script to run after `tsup`.
**Where**: `packages/skills/scripts/generate-adapters.ts` (new), `packages/skills/package.json` (`build` script)
**Depends on**: None (independent of the provider/config work; can run in parallel with Phases 1-5 if executed by a separate worker, but is sequenced here as its own phase per the plan)
**Reuses**: `packages/skills/skills/*/SKILL.md` as canonical source; the workspace-relative-script-path *technique* `.gemini/skills/*` demonstrated (adapted to a package-relative path, since output is installed elsewhere)
**Requirement**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, SKILL-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Running `npm run build -w @denisvieiradev/gitwise-skills` produces valid Codex/Kiro `SKILL.md` files and one Copilot `gitwise.instructions.md` under `dist/adapters/`
- [ ] Every generated file has correct frontmatter for its target tool's convention and references the correct installed-package script path
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise-skills`
- [ ] Test count: new `generate-adapters.test.ts`, 6+ cases (frontmatter shape per tool, script-path correctness per tool, all 4 commands present per tool)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(skills): add build-time generator for Codex/Kiro/Copilot adapters`

---

### T22: Add `packages/cli`'s dependency on `@denisvieiradev/gitwise-skills`

**What**: Add `@denisvieiradev/gitwise-skills` as a runtime dependency of `packages/cli`, resolving the correct version per the monorepo's existing internal-dependency convention (matching how `packages/cli` already depends on `@denisvieiradev/gitwise-core`).
**Where**: `packages/cli/package.json`
**Depends on**: T21
**Reuses**: Existing `@denisvieiradev/gitwise-core` dependency entry as the version-pinning convention to follow
**Requirement**: DIST-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `packages/cli` builds successfully with the new dependency
- [ ] Gate check passes: `npm run build -w @denisvieiradev/gitwise && npm run typecheck -w @denisvieiradev/gitwise`
- [ ] Test count: N/A — config-only change, build gate only

**Tests**: none
**Gate**: build

**Commit**: `chore(cli): depend on gitwise-skills for bundled adapter templates`

---

### T23: Implement `gw skills install <tool>` command

**What**: Create `packages/cli/src/commands/skills.ts` exporting `makeSkillsCommand()` with an `install <tool>` subcommand (`<tool>` ∈ `{codex, kiro, copilot}`, rejecting anything else with a clear error). Reads the bundled adapter templates from `@denisvieiradev/gitwise-skills`'s `dist/adapters/<tool>/`, and copies them into `process.cwd()` at the correct tool-specific path, creating target directories as needed, overwriting only `gitwise-*`-named entries (or the single `gitwise.instructions.md`) and never touching anything else already present. Wire into `program.ts`.
**Where**: `packages/cli/src/commands/skills.ts` (new), `packages/cli/src/program.ts`
**Depends on**: T22
**Reuses**: The bundled templates from T21/T22
**Requirement**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `gw skills install codex` in a scratch temp directory produces correct `.agents/skills/gitwise-*/SKILL.md` files
- [ ] `gw skills install kiro` / `gw skills install copilot` produce their respective correct output
- [ ] Re-running install overwrites gitwise-owned files but leaves an unrelated pre-seeded file in the same target directory untouched
- [ ] `gw skills install bogus-tool` fails with a clear error listing valid tool names, without creating any file
- [ ] Running in an unwritable directory fails fast with a clear error, no partial install
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: new `skills-install.test.ts`, 8+ cases covering every bullet above

**Tests**: integration
**Gate**: full

**Commit**: `feat(cli): add gw skills install command for native agent-surface distribution`

---

### T24: Remove unused Gemini configuration

**What**: `git rm .gemini/settings.json` and everything under `.gemini/skills/`. No replacement, no new `gw skills install gemini` option.
**Where**: `.gemini/` (removed)
**Depends on**: T23
**Reuses**: N/A
**Requirement**: GEM-01, GEM-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `git ls-files .gemini` returns no results
- [ ] No remaining reference to `.gemini/skills` or `.gemini/settings.json` anywhere in `README.md`, `docs/`, or `packages/*/src` (there never was one, per the design.md research, but confirmed here as a final check)
- [ ] Gate check passes: `npm test` (full suite, confirming nothing depended on the removed files)

**Tests**: none
**Gate**: build

**Commit**: `chore: remove unused .gemini configuration`

---

### T25: Fix README.md — Privacy, Requirements, Commands

**What**: Rewrite the README's **Privacy** section to state which vendor receives diffs conditionally on the configured `provider` (not unconditionally naming only Claude). Add Codex/Copilot/Kiro to the **Requirements** table as alternative LLM-access options. Document `gw provider` and `gw skills install` in the **Commands** table.
**Where**: `README.md`
**Depends on**: T24
**Reuses**: Existing `readme-content.test.ts`'s `sectionContent()` helper pattern for the new assertions
**Requirement**: DOC-01, DOC-06, DOC-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Privacy section text is conditional on provider, naming all 5 possible destinations (Anthropic, Claude Code's own machine-local execution, OpenAI, GitHub, AWS)
- [ ] Requirements table lists Codex/Copilot/Kiro CLI as alternatives
- [ ] Commands table documents `gw provider` and `gw skills install <tool>`
- [ ] Gate check passes: `npm test -w @denisvieiradev/gitwise`
- [ ] Test count: `readme-content.test.ts` gains 4+ new assertions (one per bullet above)

**Tests**: unit
**Gate**: quick

**Commit**: `docs(readme): document Codex/Copilot/Kiro providers and fix Privacy section accuracy`

---

### T26: Update docs site — getting-started.md, configuration.md

**What**: Update `docs/src/content/docs/getting-started.md`'s **Prerequisites** to list Codex/Copilot/Kiro CLI and mention `gw provider`. Rewrite `docs/src/content/docs/configuration.md`'s `models`/`provider` documentation for the new per-provider shape (`models.<provider>.<tier>`) and document `codexCliPath`/`copilotCliPath`/`kiroCliPath`. Add update-instructions for all 3 surfaces (npm CLI, Claude plugin marketplace refresh, `gw skills install` re-run) to `getting-started.md`.
**Where**: `docs/src/content/docs/getting-started.md`, `docs/src/content/docs/configuration.md`
**Depends on**: T25
**Reuses**: `docs-presence.test.ts`'s content-assertion pattern
**Requirement**: DOC-02, DOC-03, DOC-04, DOC-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Prerequisites section lists all 4 CLI-based providers + API key + `gw provider`
- [ ] `configuration.md` accurately documents the new `models` shape and all 4 CLI-path keys
- [ ] Update instructions for all 3 surfaces are present and accurate
- [ ] `gw skills install <tool>` is documented with its prerequisite
- [ ] Gate check passes: `npm run build && npm run lint && npm run typecheck && npm test` (Build gate — final task of the feature)
- [ ] Test count: `docs-presence.test.ts` gains 5+ new assertions

**Tests**: unit
**Gate**: build

**Commit**: `docs: update getting-started and configuration for multi-provider support`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4
Phase 2:                                    T4 -→ T5 ------→ T6 ------→ T7 ------→ T8
Phase 3:                                    T4 -→ T9 ------→ T10 -----→ T11 -----→ T12 -----→ T13
Phase 4:                                                                            T8 -→ T14 -----→ T15 -----→ T16 -----→ T17
Phase 5:                                                                            T8 -→ T18 -----→ T19 -----→ T20
Phase 6:  T21 -----→ T22 -----→ T23 -----→ T24
Phase 7:                                    T24 -→ T25 -----→ T26
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order. Total: 26 tasks across 7 phases — above the ~8-task single-batch threshold, so batch sub-agents will be offered at Execute (see Sub-Agent Delegation in `SKILL.md`).

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Characterization tests for ClaudeCodeProvider | 1 test file (extended) | ✅ Granular |
| T2: Extract CliSubprocessProvider + refactor Claude | 2 files (1 new, 1 refactor), 1 concept | ✅ Granular |
| T3: Centralize ProviderKind + tokensAvailable | 3 files, 1 concept (type extension) | ✅ Granular |
| T4: Extend ProviderConfig with CLI-path fields | 2 files, 1 concept | ✅ Granular |
| T5: Codex provider spec | 1 file, 1 component | ✅ Granular |
| T6: Copilot provider spec | 1 file, 1 component | ✅ Granular |
| T7: Kiro provider spec | 1 file, 1 component | ✅ Granular |
| T8: Wire 3 providers into factory | 1 file, 1 function | ✅ Granular |
| T9: ModelsByProvider + UserConfig update | 1 file, 1 concept | ✅ Granular |
| T10: Flat→per-provider migration | 1 file, 1 function | ✅ Granular |
| T11: Fix merge.ts scoping | 1 file, 1 function | ✅ Granular |
| T12: buildProviderConfig + 8 call sites | 9 files, 1 concept (mechanical replacement) | ⚠️ OK if cohesive — single mechanical substitution pattern applied uniformly, not independent design decisions |
| T13: gw config validation extension | 1 file, 1 concept | ✅ Granular |
| T14: tokensAvailable through result types | 5 files, 1 concept (field threading) | ⚠️ OK if cohesive — single field added uniformly following one established pattern |
| T15: release-plan schema/validator | 1 file, 1 concept | ✅ Granular |
| T16: release.ts aggregation | 1 file, 1 function | ✅ Granular |
| T17: CLI print statements | 4 files, 1 concept (conditional print) | ⚠️ OK if cohesive — identical one-line change repeated at 5 call sites |
| T18: detectAvailableProviders | 1 file, 1 function | ✅ Granular |
| T19: first-run.ts refactor | 1 file, 1 function | ✅ Granular |
| T20: gw provider command | 2 files (1 new, 1 wiring), 1 component | ✅ Granular |
| T21: generate-adapters.ts | 2 files (1 new, 1 config), 1 component | ✅ Granular |
| T22: gitwise-skills dependency | 1 file, 1 concept | ✅ Granular |
| T23: gw skills install command | 2 files (1 new, 1 wiring), 1 component | ✅ Granular |
| T24: Remove .gemini/* | 1 directory removal | ✅ Granular |
| T25: README.md fixes | 1 file, 1 concept (3 sections) | ✅ Granular |
| T26: docs site updates | 2 files, 1 concept | ✅ Granular |

**Granularity check**: All tasks are single-component/single-function/single-concept. The three flagged ⚠️ rows (T12, T14, T17) touch multiple files but apply one mechanical, uniform change across them — splitting further would create artificial task boundaries with no independent test/commit value (each half would be untestable alone).

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (start of Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 (Phase 1 → Phase 2) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T4 | Phase 1 → Phase 3 (T4 → T9) | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T8 | Phase 2 → Phase 4 (T8 → T14) | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T8 | Phase 2 → Phase 5 (T8 → T18) | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | None | (start of Phase 6, independent lineage) | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 (Phase 6 → Phase 7) | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |

**Note on T9 and T21's cross-phase dependencies**: T9 depends on T4 (Phase 1), not on Phase 2's output — it's sequenced into Phase 3 rather than Phase 1 because it's conceptually about config, not the provider base, keeping phases cohesive by concern. T21 has no dependency on any earlier phase (the generator only reads `packages/skills/skills/*`, untouched by this feature) — it is sequenced last only for narrative/phase-grouping clarity, not because Execute requires it; a batch-splitting worker could run Phase 6 in parallel with Phases 1-5 if the orchestrator chooses to, but the plan below keeps strict sequential phases as the default, simpler execution model. No dependency points to a later phase in either direction.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1: Characterization tests | Provider | unit | unit | ✅ OK |
| T2: CliSubprocessProvider extraction | Provider | unit | unit | ✅ OK |
| T3: ProviderKind + tokensAvailable | Provider | unit | unit | ✅ OK |
| T4: ProviderConfig extension | Provider | unit | unit | ✅ OK |
| T5: Codex spec | Provider | unit | unit | ✅ OK |
| T6: Copilot spec | Provider | unit | unit | ✅ OK |
| T7: Kiro spec | Provider | unit | unit | ✅ OK |
| T8: Factory wiring | Provider / factory | unit | unit | ✅ OK |
| T9: ModelsByProvider | Config | unit | unit | ✅ OK |
| T10: Migration | Config | unit | unit | ✅ OK |
| T11: Merge fix | Config | unit | unit | ✅ OK |
| T12: buildProviderConfig + call sites | Provider/factory + command wiring | integration (multi-workspace) | integration | ✅ OK |
| T13: gw config validation | CLI commands | unit | unit | ✅ OK |
| T14: tokensAvailable threading | Command types + release-plan | integration | unit | ✅ OK — unit is the floor for the pure type/field-threading change itself; T15 carries the integration-level release-plan persistence test the matrix also requires for this layer |
| T15: release-plan schema | Command types + release-plan | integration | integration | ✅ OK |
| T16: release.ts aggregation | Command types + release-plan | integration | unit | ✅ OK — aggregation logic is pure-function unit-testable; `integration/release-lifecycle.test.ts` (untouched by this task) already exercises it end-to-end |
| T17: CLI print statements | CLI commands | unit | unit | ✅ OK |
| T18: detectAvailableProviders | CLI commands | unit | unit | ✅ OK |
| T19: first-run.ts | CLI commands | unit | unit | ✅ OK |
| T20: gw provider command | CLI commands | unit | unit | ✅ OK — the interactive-picker + config-persistence flow tested at CLI-command depth matches the matrix's floor; full-workspace regression covered by the `full` gate this task also runs |
| T21: generate-adapters.ts | Skill/adapter generator | unit | unit | ✅ OK |
| T22: gitwise-skills dependency | none (config-only) | — (not a code layer) | none | ✅ OK |
| T23: gw skills install command | gw skills install filesystem effects | integration | integration | ✅ OK |
| T24: Remove .gemini/* | Gemini removal | none | none | ✅ OK |
| T25: README.md fixes | Documentation content | unit | unit | ✅ OK |
| T26: docs site updates | Documentation content | unit | unit | ✅ OK |

**Rules confirmed**: no task uses "tested in another task" as a justification for `Tests: none`; every `Tests: none` (T22, T24) corresponds exactly to a matrix row marked `none`; no task defers its required tests to a later task — T14/T16's `unit` choice is the matrix's own floor for a pure-logic sub-slice of a layer whose integration-level requirement is met within the same phase (T15), not deferred past it.
