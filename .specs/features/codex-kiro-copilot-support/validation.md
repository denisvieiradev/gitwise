# Codex/Kiro/Copilot Support Validation (iteration 2)

**Date**: 2026-09-23
**Spec**: `.specs/features/codex-kiro-copilot-support/spec.md`
**Diff range**: `6e1fd11..95e748d` (HEAD `95e748d`, 44 commits, 84 files, +5683/-540). The fix batch F1-F6 is `d8f6dca..95e748d` (6 commits).
**Verifier**: independent sub-agent, iteration 2 of 3 (author ≠ verifier; this pass re-derived everything from the spec and diff and did not rely on iteration 1's conclusions)

**Verdict**: PASS ✅

All 40 requirement IDs have `file:line` evidence, and the asserted values match the spec outcome. Two spec-precision gaps remain (SKILL-03, SKILL-08). Both concern live in-tool discovery, which the spec's Assumptions put out of automated reach. All 5 mutants that survived iteration 1 are now killed. 20 of 21 fresh mutants were killed. The one survivor (N10) changes behavior only in a case the spec itself classifies the same way, so I judged it spec-equivalent (see Sensor). Every root test failure also fails at base `6e1fd11`. The lint/typecheck failure has one cause: a dependency pin that must be fixed before publishing (see Release risks). It is not a spec failure.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T21, T23-T25, T27 | ✅ Done | `331ccaf`..`bb540ae` |
| T22, T26 | ⚠️ Done, gate box marked NOT MET | The code is correct. The gate fails only on the cli `tsc` pin issue (R1). **Inaccurate note:** `tasks.md:691` says typecheck "fails identically at baseline". It does not: base `6e1fd11` typechecks with exit 0 (re-verified). The feature's new core imports are what expose the stale nested copy. |
| F1-F6 | ✅ Done | `e71b436`, `2f53e87`, `b4ef62f`, `e7fc824`, `b17c29b`, `95e748d`. Each claimed mutant kill was re-checked independently below. |

---

## Spec-Anchored Acceptance Criteria

Test paths are relative to `packages/`.

### P1: Codex as an LLM provider (PROV-01, PROV-02)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `codex exec` + combined prompt + tier model → content | argv `exec … --model <tier> -- "<sys>\n\n<user>"`, content = final message | `core/__tests__/unit/providers/codex.test.ts:146` argv `toEqual([...,"--model","gpt-pow","--","You are gitwise.\n\nthe diff"])`; `:177` `res.content).toBe("PONG")` | ✅ (mutant N19 killed) |
| AC2 usage reported → exact counts | tokens = exact counts | `codex.test.ts:194` `toEqual({ input: 18049, output: 6 })`, `:195` `tokensAvailable).toBe(true)` | ✅ |
| AC3 no usage → `{0,0}` + `tokens: n/a` | `{0,0}`, available false, print `n/a` | `codex.test.ts:207-208`; `core/__tests__/unit/commands/token-format.test.ts:10` `formatTokens({0,0}, false)).toBe("n/a")`; CLI prints below (PROV-07) | ✅ |
| AC4 missing binary → `PROVIDER_UNAVAILABLE`, names tool, `gw provider` | code + tool + hint | `codex.test.ts:223-226` | ✅ |
| AC5 non-zero exit → CLI error unmodified | CLI text verbatim | `codex.test.ts:234` `toBe(\`Codex CLI exited with code 1: ${REAL_FAILURE_MESSAGE}\`)`, `:242` | ✅ |
| AC6 resolve precedence + `codexCliPath` | explicit → common → PATH → nvm | `codex.test.ts:72,82,92,113,124,134`; `cli/__tests__/config.test.ts:258`; `core/__tests__/unit/providers/factory.test.ts:149-154` | ✅ |

### P1: Copilot as an LLM provider (PROV-03, PROV-04)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `copilot -p … --no-ask-user` + model | argv + content | `core/__tests__/unit/providers/copilot.test.ts:128-129` argv `toEqual(["--prompt=You are gitwise.\n\nthe diff","--no-ask-user","--silent","--model","cp-pow"])`; `:153` content | ✅ (`--prompt=` is the long form of `-p`) |
| AC2 no usage → `{0,0}` + n/a | `{0,0}`, false | `copilot.test.ts:166-167` | ✅ |
| AC3 missing binary → PROVIDER_UNAVAILABLE | code + tool + hint | `copilot.test.ts:175-178` | ✅ |
| AC4 non-zero exit → stderr verbatim | stderr verbatim | `copilot.test.ts:190-191` | ✅ |
| AC5 precedence + `copilotCliPath` | same precedence | `copilot.test.ts:54,64,74,95,106,116`; `factory.test.ts:149-154` | ✅ |

### P1: Kiro as an LLM provider (PROV-05, PROV-06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `kiro-cli chat --no-interactive` + combined prompt | argv + content | `core/__tests__/unit/providers/kiro.test.ts:129-130,151` argv `toEqual(["chat","--no-interactive",…])`; `:158` content | ✅ (mutant N20 killed) |
| AC2 no usage → `{0,0}` + n/a | `{0,0}`, false | `kiro.test.ts:187-188` | ✅ |
| AC3 missing → PROVIDER_UNAVAILABLE; auth failure from invocable binary → verbatim, not PROVIDER_UNAVAILABLE | two distinct outcomes | `kiro.test.ts:196-199`; `:210-211` `err.code).toBeUndefined()` + verbatim subscription stderr | ✅ |
| AC4 precedence + `kiroCliPath` | same precedence | `kiro.test.ts:55,65,75,96,107,117`; `factory.test.ts:149-154` | ✅ |

### PROV-07 (cross-cutting): system-prompt folding + `tokens: n/a` at every print site (AD-002)

| Site | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| System prompt folded | `sys + "\n\n" + user` | `core/__tests__/unit/providers/cli-subprocess.test.ts:48` `toBe("SYS\n\nUSER")` | ✅ |
| Missing usage → `tokensAvailable:false` | false, never true | `factory.test.ts` / providers (mutant N4 killed, 6 tests) | ✅ |
| CLI `gw commit` plan print (`cli/src/commands/commit.ts:151`) | `Tokens: n/a` | `cli/__tests__/commands.test.ts:326` | ✅ (N16c killed) |
| CLI `gw commit` alternatives print (`commit.ts:236`) | `Tokens: n/a`, no `0 in / 0 out`; real counts when available | `commands.test.ts:380-381`, `:387-388` (initial plan reports 11/22, so the asserted line can only come from this site) | ✅ (M6b killed) |
| CLI `gw review` (`review.ts:94`) | `Tokens: n/a` | `commands.test.ts:411` | ✅ |
| CLI `gw pr` (`pr.ts:69`) | `Tokens: n/a` | `commands.test.ts:438` | ✅ (N16a killed) |
| CLI `gw release` (`release.ts:49`) | `Tokens: n/a` | `commands.test.ts:479` | ✅ (N16b killed) |
| `release.ts` three-call AND aggregation (`core/src/commands/release.ts:220,240,259`) | any call unavailable → plan false | `core/__tests__/unit/commands/release.test.ts:204` (changelog), `:220-221` (version), `:235-236` (notes); `:180` all true | ✅ (both M3b variants killed) |
| Skills scripts markdown `**Tokens used:** n/a` | n/a for commit/review/pr/release prepare/legacy | `skills/__tests__/token-output.test.ts:74,97,119,150,173` | ✅ (N15a-c killed) |
| Persisted release-plan legacy default | absent key → valid, defaults to `true`; wrong type → invalid | `core/__tests__/unit/commands/release-plan.test.ts:61-67` `loaded?.tokensAvailable).toBe(true)` | ✅ (N6, N7 killed) |

### P1: Easy provider switching (CFG-01..03)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `gw provider` detects the 4 CLIs + API option | all detected + api | `cli/__tests__/detect-providers.test.ts:115`; `cli/__tests__/provider.test.ts:68` `toEqual(["claude-code","codex","api"])` | ✅ (N8 killed) |
| AC2 persisted like `runFirstRun`, with CLI path | `{provider, <tool>CliPath}` | `provider.test.ts:75` `toEqual({ provider: "codex", codexCliPath: "/bin/codex" })`, `:81` | ✅ payload asserted |
| AC3 `gw config provider <valid>` persists | `{provider: v}` for all 5 | `cli/__tests__/config.test.ts:92` (it.each over 5) | ✅ |
| AC4 invalid rejected, lists valid values, no write | error + list + no write | `config.test.ts:107-111` | ✅ (N3 killed) |
| AC5 first-run offers all five, falls back to API key | detected CLIs + api; fallback | `cli/__tests__/first-run.test.ts:125,132-133,143-144,151-153,159-160` | ✅ (N18 killed) |

### P1: `gw skills install` (DIST-01..06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 copy adapter files into tool location | files at the 3 locations | `cli/__tests__/skills-install.test.ts:48,56,64` (readFile `toBe`) | ✅ |
| AC2 bundled in `gitwise-skills` `files`; cli depends on it | `dist/adapters` in package; dep declared | `skills/__tests__/generate-adapters.test.ts:87` (build runs generator); `skills-install.test.ts:172` resolves `dist/adapters` inside the package; `skills/package.json:13-14` `files: ["dist", …]`; `cli/package.json:31` dep | ✅ (the dep declaration is checked by inspection; see R2 for the version) |
| AC3 re-run overwrites with current content | v2 replaces v1 | `skills-install.test.ts:88` (codex), `:108` (kiro), `:129` (copilot) `toBe(... v2)` | ✅ |
| AC4 only gitwise-owned paths; unrelated files survive install **and** reinstall, in every target root | unrelated content byte-identical, exact dir listing | codex `:79-93`; **kiro `:102-113`** (`my-skill`, `README.md` after both installs + exact listing); **copilot `:123-134`** (`team.instructions.md` and `.github/copilot-instructions.md` after both installs + exact listing); owned-path guard `:162` | ✅ (M2b, N5, N11 killed) |
| AC5 create missing target dir | dir created | `skills-install.test.ts:48,64` (fresh project) | ✅ |
| AC6 invalid tool rejected with list | error lists `codex, kiro, copilot` | `skills-install.test.ts:137-138`, `:202-209` | ✅ |

### P1: Codex/Kiro skill bundles, Copilot instructions (SKILL-01..08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SKILL-01/04 per-command SKILL.md, `name`/`description` | frontmatter | `skills/__tests__/generate-adapters.test.ts:45-46` | ✅ |
| SKILL-02/05 script from the installed package, not `CLAUDE_PLUGIN_ROOT` | package + `dist/scripts/<cmd>.js` | `generate-adapters.test.ts:51-53` | ✅ (N21 killed, 12 tests) |
| SKILL-03 discoverable by Codex's `.agents/skills` walk | live discovery | structural only: target path `skills-install.test.ts:48` | ⚠️ Spec-precision gap (live check is outside automated reach) |
| SKILL-06 `gitwise.instructions.md`, 4 commands, `applyTo` | `applyTo`, 4 sections | `generate-adapters.test.ts:66` `/^applyTo: "\*\*"$/m`, `:71-74` | ✅ (N12 killed) |
| SKILL-07 never modify `.github/copilot-instructions.md` | content unchanged | `skills-install.test.ts:76`, `:124`, `:131`; `generate-adapters.test.ts:77` never emitted | ✅ (N5 killed) |
| SKILL-08 discovered via `.github/instructions/**/*.instructions.md` | live discovery | structural only: `skills-install.test.ts:64` | ⚠️ Spec-precision gap (same as SKILL-03) |

### P1: Retire Gemini (GEM-01, GEM-02)

| Criterion | Evidence | Result |
| --- | --- | --- |
| GEM-01 `.gemini/*` removed | `git ls-files .gemini` → 0 (commit `8f68ab3`) | ✅ |
| GEM-02 no Gemini replacement | `skills-install.test.ts:138` valid tools = exactly `codex, kiro, copilot`; no `gemini` in `packages/*/src` or `packages/skills/scripts` | ✅ |

### P1: Per-provider model configuration (MDL-01..07)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 map keyed by 5 kinds | keys = 5 kinds | `core/__tests__/unit/config/config.test.ts:287` `Object.keys(config.models).sort()).toEqual([...5])` | ✅ |
| AC2 defaults for 5 keys; Claude unchanged; vendor IDs current | Claude IDs pinned; vendor IDs from vendor sources | `config.test.ts:30-31` pin `api`/`claude-code` to `claude-haiku-4-5-20251001`/`claude-sonnet-4-6`/`claude-opus-4-7` (identical to base `6e1fd11`); `:34-44` 3 non-empty tiers for all 5 | ✅. The vendor IDs are not pinned by tests; I checked them against the installed CLIs (see MDL-02 citation audit). |
| AC3 resolve from the active provider's block only | `models[active]` | `factory.test.ts:162-172` | ✅ (N2 killed) |
| AC4 `gw provider` leaves `models` untouched | no `models` in payload | `provider.test.ts:94` `not.toHaveProperty("models")`; `:75,:81` exact payloads | ✅ (N9 killed) |
| AC5 flat → `models[provider]`, backfill, persist | migrated + on disk | `config.test.ts:335-347` (on-disk `toEqual`), `:374-390` no double migration | ✅ (N13 killed) |
| AC5 exact key set (edge: unknown provider) | exactly 5 keys, in memory **and** on disk; all defaults | `config.test.ts:363` + `:369` `Object.keys(loaded.models).sort()).toEqual(PROVIDER_KEYS)`, `:371` on-disk same | ✅ (M4d, N17 killed) |
| AC6 repo override → active provider only | other blocks untouched | `config.test.ts:239-290` | ✅ (N1 killed) |
| AC7 `models.<tier>` → active; `models.<provider>.<tier>` → that provider | targeted block written | `cli/__tests__/config.test.ts:126-135`, `:149-155`, `:167-170` | ✅ |

**MDL-02 citation audit.** The F5 code comment (`core/src/config/types.ts:52-70`) was checked against the CLIs on this machine, read-only:
- **codex** `codex-cli 0.156.1`: `~/.codex/models_cache.json` lists `gpt-6-astra` ("Frontier intelligence…"), `gpt-6-sol` ("Workhorse model for coding…"), and `gpt-6-luna` ("Fast and affordable…"). `gpt-5.1-codex*` is absent. The comment also says the catalog is fetched per account. It is accurate.
- **copilot** `GitHub Copilot CLI 1.0.88`: the `model` list in `copilot help config` includes `claude-haiku-4.5`, `claude-sonnet-4.6`, and `claude-opus-4.7`, and does not include `claude-sonnet-4.5` or `claude-opus-4.1`. Accurate.
- **kiro** `kiro-cli 2.23.1`: `kiro-cli chat --list-models` lists `claude-sonnet-4.5`, `claude-sonnet-4`, and `claude-haiku-4.5`, and no Opus. Accurate. The comment's claim about the kiro.dev docs page was not re-checked, since this pass made no web call. The comment already marks the Opus 4.5+ model_id as unverified.

The comments say what was checked and what was not. The values match the sources, and `docs/src/content/docs/configuration.md` shows the same values.

### P1/P2: Documentation (DOC-01..07)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DOC-01 README Privacy conditional on provider | vendor per provider; no unconditional Claude claim | `cli/__tests__/readme-content.test.ts:132` `not.toMatch(/Diffs are sent to Claude/)`, `:138-140…` per-provider rows | ✅ |
| DOC-01 SECURITY.md consistent (iteration-1 G5) | same conditional claim | `cli/__tests__/security-docs.test.ts:117` (no Claude-only claim), `:121` ("vendor behind the `provider` you configure"), `:133` (it.each maps 5 providers to Anthropic/Anthropic/OpenAI/GitHub/AWS) | ✅. `SECURITY.md:105` and `README.md:117-125` agree. `git grep` finds no remaining "sent to Claude" in shipped docs; the only hits are in historical `.compozy/` planning files. |
| DOC-02 getting-started Prerequisites | all options + `gw provider` | `cli/__tests__/docs-presence.test.ts:80`, `:89` | ✅ |
| DOC-03 configuration.md per-provider + 4 CLI paths | `models.<provider>.<tier>`, no flat example | `docs-presence.test.ts:120,125,129,135` | ✅ |
| DOC-04 three update paths | npm `@latest`; `/plugin marketplace update`; re-run install | `docs-presence.test.ts:100,104,108` | ✅ |
| DOC-05 install command + prerequisite | 3 commands + package prerequisite | `docs-presence.test.ts:93` | ✅ |
| DOC-06 README Requirements | CLIs as LLM access | `readme-content.test.ts:145` | ✅ |
| DOC-07 README Commands | `gw provider`, `gw skills install <tool>` | `readme-content.test.ts:155`, `:160` | ✅ |

**Status**: 40/40 requirement IDs have evidence that matches the spec outcome. 2 spec-precision gaps (SKILL-03, SKILL-08), both non-automatable per the spec's Assumptions.

---

## Edge Cases

- [x] Multiple CLIs → all listed: `detect-providers.test.ts:131` `toEqual(["codex","copilot","api"])`; `provider.test.ts:68` (N8 killed)
- [x] Previously valid CLI uninstalled → same `PROVIDER_UNAVAILABLE`: `factory.test.ts:102` (each kind, configured path missing)
- [x] `.github/instructions/` absent → created: `skills-install.test.ts:64`
- [x] Outside a git repo or unwritable dir → clear error, no partial write: `skills-install.test.ts:142`, plus the unwritable-dir case (`itUnlessRoot`)
- [x] Codex usage present → used: `codex.test.ts:194-195`
- [x] Legacy flat config + unrecognized provider → all 5 keys get defaults, no stray key: `config.test.ts:363-371` (M4d, N17 killed)

---

## Discrimination Sensor

**Isolation**: a detached `git worktree` of HEAD (`95e748d`) under the scratchpad, with `node_modules` symlinked in. Each mutant was applied by a scripted exact-string replace, the targeted suites ran, and `git checkout -- <file>` restored the file. The script confirmed the scratch had no tracked modifications after every run. cli suites ran under a scratchpad-only chalk-stub jest config, which was never committed. Before mutating, the unmutated baseline of every targeted suite was green: core 310/310, skills 30/30, cli (stub) 97/97. Both scratch worktrees (HEAD and base) were then removed. The real tree's `git status --porcelain` matched the pre-sensor baseline exactly (checked with `diff`).

### Re-injected mutants from iteration 1

| # | File | Mutation | Result |
| - | ---- | -------- | ------ |
| M2b | `cli/src/commands/skills.ts` (before copy loop) | `rmSync` the `.kiro/skills` / `.github/instructions` root before copying | ✅ Killed (2: kiro and copilot reinstall-preservation tests) |
| M6b | `cli/src/commands/commit.ts:236` | alternatives print passes `true` instead of `alts.tokensAvailable` | ✅ Killed (1) |
| M3b-v | `core/src/commands/release.ts:220` | drop the version-call AND term | ✅ Killed (1) |
| M3b-n | `core/src/commands/release.ts:259` | drop the notes-call AND term | ✅ Killed (1) |
| M4d | `core/src/config/user.ts:37` | unknown provider: flat block stored as stray `models.<unknown>` | ✅ Killed (1) |

### Fresh mutants (this iteration)

| # | File | Mutation | Result |
| - | ---- | -------- | ------ |
| N1 | `core/src/config/merge.ts:21-27` | `deepMerge` models → flat spread | ✅ Killed (2) |
| N2 | `core/src/providers/factory.ts:44` | `buildProviderConfig` reads `models["claude-code"]` | ✅ Killed (4) |
| N3 | `cli/src/commands/config.ts:103` | `gw config provider bogus` accepted | ✅ Killed (1) |
| N4 | `core/src/providers/cli-subprocess.ts:96` | missing usage → `tokensAvailable: true` | ✅ Killed (6) |
| N5 | `cli/src/commands/skills.ts` | copilot install overwrites `.github/copilot-instructions.md` | ✅ Killed (2) |
| N6 | `core/src/commands/release-plan.ts:113` | legacy plan without `tokensAvailable` rejected | ✅ Killed (2) |
| N7 | `core/src/commands/release-plan.ts:87` | legacy default `?? true` → `?? false` | ✅ Killed (1) |
| N8 | `cli/src/commands/provider.ts` | `gw provider` offers only the first detected CLI + api | ✅ Killed (2) |
| N9 | `cli/src/commands/provider.ts:56` | `gw provider` writes `models: {}` | ✅ Killed (4) |
| N10 | `core/src/providers/cli-subprocess.ts:157` | **every** spawn `error` event → `PROVIDER_UNAVAILABLE` (not only ENOENT) | ⚪ Survived, spec-equivalent. See note. |
| N11 | `cli/src/commands/skills.ts` | owned-path guard bypassed | ✅ Killed (1) |
| N12 | `skills/scripts/generate-adapters.ts:74` | Copilot `applyTo` frontmatter dropped | ✅ Killed (1) |
| N13 | `core/src/config/user.ts` | migration not persisted | ✅ Killed (2) |
| N14 | `core/src/commands/token-format.ts:7` | `formatTokens` condition inverted | ✅ Killed (2) |
| N15a | `skills/scripts/release.ts:61` | release-prepare markdown ignores the flag | ✅ Killed (1) |
| N15b | `skills/scripts/commit.ts:76` | commit markdown ignores the flag | ✅ Killed (1) |
| N15c | `skills/scripts/pr.ts:55` | pr markdown ignores the flag | ✅ Killed (1) |
| N16a | `cli/src/commands/pr.ts:69` | `gw pr` print ignores the flag | ✅ Killed (1) |
| N16b | `cli/src/commands/release.ts:49` | `gw release` print ignores the flag | ✅ Killed (1) |
| N16c | `cli/src/commands/commit.ts:151` | `gw commit` plan print ignores the flag | ✅ Killed (1) |
| N17 | `core/src/config/user.ts` | unknown provider: guess `api` for the flat block | ✅ Killed (1) |
| N18 | `cli/src/first-run.ts:62` | first-run offers only Claude Code | ✅ Killed (3) |
| N19 | `core/src/providers/codex.ts:73-74` | Codex drops `--model <tier id>` | ✅ Killed (1) |
| N20 | `core/src/providers/kiro.ts:45` | Kiro drops `--no-interactive` | ✅ Killed (2) |
| N21 | `skills/scripts/generate-adapters.ts:28` | skills resolve the wrong package's scripts | ✅ Killed (12) |

**N10 note (spec-equivalent, not a fix task).** A non-zero CLI exit, which covers the Kiro auth/subscription case, is handled in the `close` handler, not in `wrapError`, so N10 cannot reach it. N10 only changes spawn `error` events other than ENOENT, such as EACCES on a non-executable binary. Kiro AC3 says the two failure cases are "distinguished by whether the binary was invocable at all", which puts a non-invocable binary on the `PROVIDER_UNAVAILABLE` side. The mutant's behavior therefore satisfies the spec. The branch was also untested at base in `ClaudeCodeProvider.wrapError`. Advisory, optional: add a test that pins the non-ENOENT spawn-error message, so an EACCES binary is not reported as "not found".

**Sensor depth**: expanded (26 mutations: config migration, merge scoping, and install overwrite-safety are data-integrity paths)
**Result**: 25/26 killed. The 1 survivor is spec-equivalent. All 5 iteration-1 survivors are killed. **PASS ✅**

---

## Gate Check

Build gate from tasks.md: `npm run build && npm run lint && npm run typecheck && npm test`. Every step ran in scratch worktrees at HEAD `95e748d` and base `6e1fd11`. `rtk proxy` was used where the shell hook rewrote `npm run lint` into an ESLint filter.

| Step | HEAD `95e748d` | Base `6e1fd11` | Classification |
| ---- | -------------- | -------------- | -------------- |
| `npm run build` | exit 0 | exit 0 | ✅ |
| `npm run lint` (`tsc --noEmit` per package) | exit 2, 24 TS errors, all in cli | exit 0 | Pin issue R1, exposed by the feature. Every error is a missing export (`buildProviderConfig`, `formatTokens`, …) from the stale nested `packages/cli/node_modules/@denisvieiradev/gitwise-core@1.1.1`. With the nested copies removed in scratch: **exit 0** |
| `npm run typecheck` | exit 2 (same 24) | exit 0 | Same as lint. Stale copies removed: **exit 0** |
| `npm test` (root) | **1064 passed / 31 failed / 7 skipped** (1102 tests, 74 suites, 7 failed suites) | 850 / 31 / 7 (888 tests, 63 suites) | All 31 failures appear in both runs: I diffed the failing-test sets from `--json` output, and they are **identical** (0 only-at-HEAD, 0 only-at-base) |

**The 31 root failures (identical at base):**
- 28 from the chalk 5.6.2 TDZ (`ReferenceError: Cannot access 'supportsColor' before initialization`), in `run-cli` (15), `release-wiring` (10), and `readme-doc-snippets` (3). `commands.test.ts` and `program.test.ts` fail at module load and add 0 counted tests.
- 3 version-lockstep tests: `cli/__tests__/manifest.test.ts` (core pin 1.1.1 vs 1.2.0), and in `skills/__tests__/skills.test.ts` the core pin plus `.claude-plugin/plugin.json` 1.1.1 vs 1.2.0.

**Chalk-stub run (scratchpad-only config, cli project):** HEAD **387 passed / 2 failed / 7 skipped** (396). Base 306 / 2 / 7 (315). The 2 failures are the same at both commits: `program.test.ts` "leaves chalk untouched", an artifact of the stub, and the lockstep test. Under the stub, `commands.test.ts` runs 43/43, including all 6 PROV-07 print tests. **These print tests never execute under the official root gate** because of the chalk load failure. Real signal for them needs the stub or a chalk fix.

- **Test count**: 888 → 1102 (+214). Passing: 850 → 1064 (+214). The fix batch added 17 of these (the iteration-1 HEAD had 1085).
- **Skipped**: 7, the same as base.
- **Integrity**: no test was deleted or weakened in `d8f6dca..HEAD`. The only modified line is `config.test.ts:351` (`await writeLegacyConfig` → `const path = await writeLegacyConfig`), which captures the path for the new on-disk assertion.
- `packages/skills/dist` was never built in the real tree. The scratch builds were thrown away with the scratch worktrees.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ One shared `CliSubprocessProvider` (AD-001), one `formatTokens`, one `buildProviderConfig` |
| Surgical changes | ✅ F1-F4 and F6 are test/doc-only. F5 changes only default strings, a comment, and docs. |
| No scope creep | ✅ Nothing from Out of Scope was built: no vendor auth handling, no Gemini provider or install option, no `gw skills update` or diff UI, no new UI toolkit. Changes in `core/src/commands/*` only thread `tokensAvailable` (AD-002); command logic is unchanged. |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅, with 2 spec-precision gaps |
| Per-layer coverage | ✅ All 5 CLI print sites, all 3 release calls, all 3 install roots |
| Every test maps to a requirement | ✅ Hardening tests map to AD-001 |
| Documented guidelines | none beyond spec/design/STATE; strong defaults applied |

---

## Release risks (not spec failures)

- **R1: cli/skills → core pin.** `packages/cli/package.json:30` and `packages/skills/package.json:27` pin `@denisvieiradev/gitwise-core: 1.1.1`, while the workspace is 1.2.0. Under npm workspace semantics, a fresh `npm install` therefore nests a registry 1.1.1 copy, which is what breaks cli `tsc` above. cli externalizes core, and the feature's cli code imports exports that 1.1.1 lacks. Published with this pin, `gw` would fail at import. **Bump both pins to the release version before publishing.** The same fix clears the 3 lockstep tests.
- **R2: cli → skills pin.** `packages/cli/package.json:31` pins `@denisvieiradev/gitwise-skills: 1.2.0`. If the already-published 1.2.0 has no `dist/adapters`, `gw skills install` fails against it with "No bundled … adapter found". The pin must move to the release that ships the adapters.
- **R3: tracked `packages/skills/dist` is stale.** A fresh build adds `dist/adapters/` and `generate-adapters.*`. The npm tarball is built at publish time, so this only matters for the plugin-dist guard on `main`.
- **R4: chalk 5.6.2 TDZ** hides 5 cli suites from the root gate, including the PROV-07 print tests. This predates the feature.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| PROV-01..07, CFG-01..03, MDL-01..07, DIST-01..06, SKILL-01, 02, 04..07, GEM-01, GEM-02, DOC-01..07 | ✅ Verified |
| SKILL-03, SKILL-08 | ⚠️ Spec-precision gap: live discovery is not automatable; structure verified |

---

## Lessons (candidates, not recorded)

These are distilled from iteration 1's grounded failures (M2b, M6b, M3b, M4d, and the SECURITY.md contradiction). `lessons.py` was not run, per the brief.
1. For "leaves unrelated files untouched" criteria, write one preservation test per target root and cover both install and reinstall. One representative root is not enough.
2. For AND/OR aggregation across N calls, test each call as the lone dissenter.
3. Migration tests should assert the exact key set, in memory and on disk, not only that the expected keys are present.
4. A doc-accuracy criterion should include a grep of every shipped doc (README, SECURITY, docs site) for the old claim, not only the file the AC names.

---

## Summary

**Overall**: ✅ Ready per spec. Fix the release pins (R1/R2) before publishing.

**Spec-anchored check**: 40/40 requirement IDs have spec-matched evidence. 2 spec-precision gaps (SKILL-03, SKILL-08).
**Sensor**: 25/26 killed. 1 survivor is spec-equivalent (N10). All 5 iteration-1 survivors are killed.
**Gate**: root 1064 passed / 31 failed / 7 skipped. All 31 are pre-existing (identical set at `6e1fd11`). Build exit 0. Lint and typecheck exit 2 from the core pin (R1) and are clean once the stale nested copy is gone.

**Completion gate**: `python3 .claude/skills/tlc-spec-driven/scripts/validate_state.py codex-kiro-copilot-support` → exit 0, `validate_state: 0 error(s) across [codex-kiro-copilot-support]`.
