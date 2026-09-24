# Codex/Kiro/Copilot Support Validation (iteration 3)

**Date**: 2026-09-23
**Spec**: `.specs/features/codex-kiro-copilot-support/spec.md`
**Diff range**: `6e1fd11..c3a007a` (HEAD `c3a007a`, 50 commits, 93 files, +7212/-593). Follow-ups since iteration 2's PASS at `7a92052`: `7a92052..c3a007a`, 8 commits (`244f435` .specs artifacts, `a1507cc` G1, `982d231` + `c3a007a` G2, `12f20e6` G3, `0553db0` G4, `d8d9ab9` G5, `6a7cd1f` G6).
**Verifier**: independent sub-agent, iteration 3 of 3. Author ≠ verifier. Everything below was re-derived from `spec.md` and the diff. Iteration 2's report was used only as an index of places to re-check.

**Verdict**: FAIL ❌

Every one of the 40 requirement IDs has `file:line` evidence, and in each case the asserted value matches the spec outcome. The gates behave as expected. The follow-up work (G1-G6) is correct, and every mutant aimed at it was killed. The FAIL comes from one narrow test gap. **MDL-02's Codex and Copilot default model IDs are not pinned by any test.** Reverting either one to the pre-F5 IDs, which the vendor CLIs do not list, passes the whole suite (mutants V1 and V2 survived). The Kiro block got exactly this pin in G2 because of a real guessed-ID incident, so the gap is inconsistent as well as open. The fix is two `toEqual` assertions. This is the last automatic iteration, so the gap is escalated to the user.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T27 | ✅ Done | `331ccaf`..`bb540ae`. The code was re-verified below. |
| F1-F6 | ✅ Done | `e71b436`..`95e748d` |
| G1 pins + lockfile + plugin.json | ✅ Done | `a1507cc`. The lockfile diff is exactly: the 2 pins changed, the 2 nested `gitwise-core@1.1.1` entries dropped, and the root `@anthropic-ai/sdk@0.109.0` dropped (only those entries needed it). Core's `^0.122.0` now resolves at `packages/core/node_modules/@anthropic-ai/sdk`. No other dependency changed. |
| G2 Kiro defaults | ✅ Done, with a note | `982d231` moved to guessed IDs, and `c3a007a` reverted to the listed IDs. `tasks.md:968-988` keeps the superseded first attempt's checked boxes (Done-when says `claude-sonnet-4.6` / `claude-opus-4.7`). A top note marks them superseded, but a reader skimming the checkboxes will get the wrong values. |
| G3 SECURITY subprocess line | ✅ Done | `12f20e6` |
| G4 timeouts | ✅ Done | `0553db0`. Marked `SPEC_DEVIATION` at `core/src/providers/types.ts:56`. `design.md` does not mention `timeoutMs`. |
| G5 Copilot usage research | ✅ Done, comment only | `d8d9ab9` |
| G6 argv[1] guard | ✅ Done | `6a7cd1f`. As the task notes, `scripts/generate-adapters.ts` keeps the old pattern. It is build-time only. |

---

## Spec-Anchored Acceptance Criteria

Test paths are relative to `packages/`. Citations in files that changed after iteration 2 were re-located. Core `config.test.ts` shifted by +8 lines after line 33, and `cli-subprocess.test.ts` by +1.

### P1: Codex as an LLM provider (PROV-01, PROV-02)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `codex exec`, combined prompt, tier model → content | argv `exec … --model <tier> -- "<sys>\n\n<user>"`; content = final message | `core/__tests__/unit/providers/codex.test.ts:146` `expect(argv).toEqual([...])`; `:177` `expect(res.content).toBe("PONG")` | ✅ |
| AC2 usage reported → exact counts | exact counts | `codex.test.ts:194` `toEqual({ input: 18049, output: 6 })`, `:195` `tokensAvailable).toBe(true)` | ✅ |
| AC3 no usage → `{0,0}` + `tokens: n/a` | `{0,0}`, false, CLI prints n/a | `codex.test.ts:207-208`; `core/__tests__/unit/commands/token-format.test.ts:10` `toBe("n/a")`; CLI print sites under PROV-07 | ✅ (E5 killed) |
| AC4 missing binary → `PROVIDER_UNAVAILABLE` + tool + `gw provider` | code, tool, hint | `codex.test.ts:223` `err.code).toBe("PROVIDER_UNAVAILABLE")`, `:226` `toContain("gw provider")` | ✅ |
| AC5 non-zero exit → CLI error unmodified | verbatim | `codex.test.ts:234` `toBe(\`Codex CLI exited with code 1: ${REAL_FAILURE_MESSAGE}\`)` | ✅ |
| AC6 resolve precedence + `codexCliPath` | explicit → common → PATH → nvm | `codex.test.ts:65,75,85,95,106,116,127`; `cli/__tests__/config.test.ts:258` `toHaveBeenCalledWith({ [key]: "/usr/local/bin/tool" }, …)`; `core/__tests__/unit/providers/factory.test.ts:154` | ✅ |
| (G4) agent-turn timeout | not in spec (`SPEC_DEVIATION`) | `core/__tests__/unit/providers/cli-subprocess.test.ts:172` Codex `options.timeout).toBe(300_000)` asserted on the real `spawn` options | ✅ (G4a killed) |

### P1: Copilot as an LLM provider (PROV-03, PROV-04)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `copilot -p … --no-ask-user` + model | argv + content | `core/__tests__/unit/providers/copilot.test.ts:128` `argv).toEqual(["--prompt=You are gitwise.\n\nthe diff","--no-ask-user","--silent","--model","cp-pow"])` | ✅ (`--prompt=` is the long form of `-p`, and the source comment explains it) |
| AC2 no usage → `{0,0}` + n/a | `{0,0}`, false | `copilot.test.ts:166-167` | ✅ See the G5 check below. |
| AC3 missing binary → PROVIDER_UNAVAILABLE | code + hint | `copilot.test.ts:175`, `:178` | ✅ |
| AC4 non-zero exit → stderr verbatim | verbatim | `copilot.test.ts:190-191` `toBe('Copilot CLI exited with code 1: Error: Model "no-such-model-xyz" …')` | ✅ |
| AC5 precedence + `copilotCliPath` | same precedence | `copilot.test.ts:47,57,67,77,88,98,109`; `factory.test.ts:154` | ✅ |
| (G4) timeout | 300 s | `cli-subprocess.test.ts:177` `toBe(300_000)` | ✅ (G4d killed) |

**G5 / Copilot n/a check against the spec text.** AC2 applies when "the Copilot CLI's output contains no token-usage data". gitwise runs `--silent`. It never passes `--usage-output-file`, so the output it reads has no usage data. The spec and the code agree, and AC2 describes current behavior accurately. Nothing in the spec requires the optional usage file; the Codex edge case, which does require reading usage when present, is Codex-only. I confirmed the comment's facts on this machine: `copilot --help` (1.0.88) lists `--usage-output-file <file>` with the description "Write final usage statistics as JSON to the specified file". The claims about docs.github.com and the single failed live run could not be re-checked from here, and the comment says so itself ("unverified").

### P1: Kiro as an LLM provider (PROV-05, PROV-06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `kiro-cli chat --no-interactive` + combined prompt | argv + content | `core/__tests__/unit/providers/kiro.test.ts:129` `argv).toEqual(["chat","--no-interactive",…])`, `:151` | ✅ |
| AC2 no usage → `{0,0}` + n/a | `{0,0}`, false | `kiro.test.ts:187-188` | ✅ |
| AC3 missing → PROVIDER_UNAVAILABLE; auth failure → verbatim | two distinct outcomes | `kiro.test.ts:196`, `:199`; `:210` `err.code).toBeUndefined()`, `:211` verbatim message | ✅ |
| AC4 precedence + `kiroCliPath` | same precedence | `kiro.test.ts:48,58,68,78,89,99,110`; `factory.test.ts:154` | ✅ |
| (G4) timeout | 300 s | `cli-subprocess.test.ts:182` `toBe(300_000)` | ✅ (G4c killed) |

**Claude Code timeout unchanged**: `cli-subprocess.test.ts:167` asserts `claudeCodeSpec`'s spawn gets `timeout` `toBe(120_000)` (G4b killed), and `:162` asserts the default with no `timeoutMs` is `120_000`. `claude-code.ts` sets no `timeoutMs`. `anthropic.ts:7` keeps its own 120 s constant.

### PROV-07 (cross-cutting): system-prompt folding + `tokens: n/a` at every print site

| Site | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| System prompt folded | `sys + "\n\n" + user` | `cli-subprocess.test.ts:49` `toBe("SYS\n\nUSER")`, `:50-51` `{0,0}` / false | ✅ |
| `gw commit` plan | `Tokens: n/a` | `cli/__tests__/commands.test.ts:326` | ✅ (stub only, see Gate) |
| `gw commit` alternatives | n/a when unavailable; real counts otherwise | `commands.test.ts:380-381`, `:387-388` | ✅ (stub only) |
| `gw review` / `gw pr` / `gw release` | `Tokens: n/a` | `commands.test.ts:411`, `:438`, `:479` | ✅ (stub only) |
| release three-call AND | any call unavailable → false | `core/__tests__/unit/commands/release.test.ts:204`, `:220-221`, `:235-236`; `:180` all true | ✅ (E3 killed) |
| Skills markdown `**Tokens used:** n/a` | n/a | `skills/__tests__/token-output.test.ts:74,97,119,150,173` | ✅ |
| Legacy release plan | absent → true | `core/__tests__/unit/commands/release-plan.test.ts:67` `toBe(true)` | ✅ |

### P1: Easy provider switching (CFG-01..03)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 detect the 4 CLIs + API | all detected + api | `cli/__tests__/detect-providers.test.ts:115`; `cli/__tests__/provider.test.ts:68` `toEqual(["claude-code","codex","api"])` | ✅ |
| AC2 persisted with CLI path | `{provider, <tool>CliPath}` | `provider.test.ts:75` `toEqual({ provider: "codex", codexCliPath: "/bin/codex" })`, `:81` | ✅ (payload asserted) |
| AC3 `gw config provider <valid>` | persisted for all 5 | `cli/__tests__/config.test.ts:92` `toHaveBeenCalledWith({ provider: value }, …)` | ✅ |
| AC4 invalid rejected, lists values, no write | error + no write | `config.test.ts:107` `stringContaining("Unknown provider 'bogus'")`, `:111` `not.toHaveBeenCalled()` | ✅ (E4 killed) |
| AC5 first-run offers all, falls back to API | detected + api; fallback | `cli/__tests__/first-run.test.ts:125,133,144,153,160` | ✅ |

### P1: `gw skills install` (DIST-01..06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 copy to tool location | files at 3 roots | `cli/__tests__/skills-install.test.ts:52` (codex), `:60` (kiro), `:67` (copilot) `readFile(...)).toBe(...)` | ✅ |
| AC2 bundled in `gitwise-skills` `files`; cli depends on it | `dist/adapters` in tarball; dep declared | `skills/__tests__/generate-adapters.test.ts:87` build runs generator; `skills-install.test.ts:174` resolves `dist/adapters`; `npm pack --dry-run -w packages/skills` (scratch build) ships 9 `dist/adapters/**` files; `cli/package.json` depends on `gitwise-skills: 1.2.0` | ✅ |
| AC3 re-run overwrites | v2 replaces v1 | `skills-install.test.ts:88`, `:108`, `:129` `toBe("… v2")` | ✅ |
| AC4 only gitwise-owned paths | unrelated files byte-identical, exact listing, all 3 roots | `skills-install.test.ts:89-93` (codex), kiro and copilot reinstall tests (`:102-113`, `:123-134`), owned-path guard `:162` | ✅ (E2 killed: 3 tests) |
| AC5 create missing dirs | created | `skills-install.test.ts:52`, `:67` (fresh project) | ✅ |
| AC6 invalid tool | error lists `codex, kiro, copilot` | `skills-install.test.ts:138` `toThrow("Valid tools: codex, kiro, copilot")` | ✅ |

### P1: Codex/Kiro skill bundles, Copilot instructions (SKILL-01..08), incl. G6

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SKILL-01/04 frontmatter | `name`, `description` | `generate-adapters.test.ts:45-46` | ✅ |
| SKILL-02/05 script from installed package | package path, no `CLAUDE_PLUGIN_ROOT` | `generate-adapters.test.ts:51`, `:53` | ✅ |
| SKILL-02/05 (G6) installed scripts importable, still runnable | absent/unresolvable argv[1] → import resolves, script not run; argv[1] = script → runs | `skills/__tests__/invoked-directly.test.ts:53-54`, `:63-64` `getMergedConfig).not.toHaveBeenCalled()`, `:90` `expect(await exited).toBe(1)`, run for each of the 4 scripts | ✅ (G6a-d killed) |
| SKILL-03 Codex `.agents/skills` discovery | live discovery | structural only (`skills-install.test.ts:52`) | ⚠️ Spec-precision gap (live check is outside automated reach, per Assumptions) |
| SKILL-06 `applyTo`, 4 commands | frontmatter + sections | `generate-adapters.test.ts:66` `/^applyTo: "\*\*"$/m`, `:71` | ✅ |
| SKILL-07 never touch `copilot-instructions.md` | unchanged | `skills-install.test.ts:76`, `:124`, `:131`; `generate-adapters.test.ts:77` | ✅ |
| SKILL-08 Copilot modular-instructions discovery | live discovery | structural only (`skills-install.test.ts:67`) | ⚠️ Spec-precision gap (same as SKILL-03) |

### P1: Retire Gemini (GEM-01, GEM-02)

| Criterion | Evidence | Result |
| --- | --- | --- |
| GEM-01 removed | `git ls-files .gemini` is empty | ✅ |
| GEM-02 no replacement | `skills-install.test.ts:138` accepts exactly `codex, kiro, copilot` | ✅ |

### P1: Per-provider model configuration (MDL-01..07)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 map keyed by 5 kinds | 5 keys | `core/__tests__/unit/config/config.test.ts:295` `Object.keys(config.models).sort()).toEqual(...)` | ✅ |
| AC2 defaults: Claude unchanged | pre-feature Claude IDs | `config.test.ts:30-31` `toEqual(preFeatureClaude)` | ✅ |
| AC2 defaults: Kiro = vendor-listed IDs | `claude-haiku-4.5` / `claude-sonnet-4.5` / `claude-sonnet-4.5` | `config.test.ts:35` `DEFAULT_USER_CONFIG.models.kiro).toEqual({...})` | ✅ (G2a, G2b killed) |
| AC2 defaults: Codex, Copilot = vendor-documented IDs | F5 Done-when values (`gpt-6-luna/sol/astra`; `claude-haiku-4.5/sonnet-4.6/opus-4.7`) | only `config.test.ts:46-49` (3 non-empty string tiers) | ❌ **GAP**: no test pins them. **V1 and V2 survived.** |
| AC3 resolve from active block only | `models[active]` | `factory.test.ts:162-170` | ✅ |
| AC4 `gw provider` leaves `models` untouched | no `models` in payload | `provider.test.ts:94` `not.toHaveProperty("models")` | ✅ |
| AC5 flat → `models[provider]`, backfill, persist | migrated on disk | `config.test.ts:342-355` (on-disk `toEqual(loaded.models)`), `:398-402` no double migration | ✅ |
| AC5 edge: unknown provider | exactly 5 keys, all defaults | `config.test.ts:369-379` | ✅ |
| AC6 repo override → active only | others untouched | `config.test.ts:258-262`, `:275-278`, `:290-295` | ✅ (E1 killed) |
| AC7 `models.<tier>` / `models.<provider>.<tier>` | targeted block | `cli/__tests__/config.test.ts:126`, `:149`, `:155`, `:167`, `:170` | ✅ |

**MDL-02 source-comment audit (`core/src/config/types.ts:52-73`).** I checked every claim read-only against the CLIs installed here (no model calls).
- **codex** `codex-cli 0.156.1`: `~/.codex/models_cache.json` lists `gpt-6-astra` ("Frontier intelligence…"), `gpt-6-sol` ("Workhorse model for coding…"), and `gpt-6-luna` ("Fast and affordable…"), and has no `gpt-5.1-codex*`. **Accurate.**
- **copilot** `1.0.88`: the `model` list in `copilot help config` includes `claude-haiku-4.5`, `claude-sonnet-4.6`, and `claude-opus-4.7`, and does not include `claude-sonnet-4.5` or `claude-opus-4.1`. **Accurate.**
- **kiro** `kiro-cli 2.23.1`: `kiro-cli chat --list-models` lists `claude-sonnet-4.5`, `claude-sonnet-4`, and `claude-haiku-4.5`, with no Opus. **Accurate.** I fetched `https://kiro.dev/docs/cli/chat/model-selection/`: it uses display names only and gives no `--model` ID strings. It names Sonnet 4.6 and Opus 4.7, plus others (Opus 4.8, Opus 5, Sonnet 5, …). The comment is **accurate**; it names only the two models relevant to the tiers. "The only source that lists exact --model IDs" holds for the two sources consulted.
- `docs/src/content/docs/configuration.md:20-24` shows the same five blocks as the code. No test enforces this (V3 survived). The example is labeled "User config example", not "defaults", so DOC-03 (shape) is still met.

### P1/P2: Documentation (DOC-01..07)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DOC-01 README Privacy conditional | vendor per provider | `cli/__tests__/readme-content.test.ts:132` `not.toMatch(/Diffs are sent to Claude/)`, `:138…` per-provider rows | ✅ (D1 killed) |
| DOC-01 SECURITY.md egress consistent | same claim | `cli/__tests__/security-docs.test.ts:117`, `:121`, `:133` (5 provider→vendor pairs) | ✅ (G3b killed) |
| DOC-01 (G3) SECURITY subprocess claim names every provider CLI | `gh`, `claude`, `codex`, `copilot`, `kiro-cli`, no `shell: true` | `security-docs.test.ts:153` no-shell regex, `:157` `toContain(\`\`${binary}\`\`)` for each of 5 | ✅ (G3a killed). `SECURITY.md:106` matches: `CliSubprocessProvider` spawns each spec's `defaultCommand` as argv arrays. |
| DOC-02 getting-started Prerequisites | options + `gw provider` | `cli/__tests__/docs-presence.test.ts:82-86`, `:90` | ✅ |
| DOC-03 configuration.md shape + 4 CLI paths | `models.<provider>.<tier>`, no flat example, 4 keys | `docs-presence.test.ts:121-122`, `:126`, `:131`, `:137-139` | ✅ |
| DOC-04 three update paths | npm `@latest`, `/plugin marketplace update`, re-run install | `docs-presence.test.ts:101`, `:105`, `:109` | ✅ |
| DOC-05 install command + prerequisite | 3 commands + package | `docs-presence.test.ts:94-97` | ✅ |
| DOC-06 README Requirements | CLIs as LLM access | `readme-content.test.ts:145` | ✅ |
| DOC-07 README Commands | `gw provider`, `gw skills install <tool>` | `readme-content.test.ts:155`, `:160` | ✅ |

**"Diffs go to Claude" sweep.** I ran `git grep` over README, SECURITY, CONTRIBUTING, `docs/`, `packages/*/README.md`, and the site content, excluding `.compozy/` and `.specs/`. No shipped doc still claims diffs go only to Claude. The only hits are the two negative assertions in tests. The package READMEs defer to the root README. One stale sentence remains, but it is not a privacy claim and no AC covers it: `docs/migrating-from-devflow.md:37` says first run "prompts once for a provider (Claude Code subprocess or Anthropic API)". First run now offers all five.

**Status**: 39/40 requirement IDs are fully matched. MDL-02 is partially matched: Claude and Kiro are pinned, Codex and Copilot are not. There are 2 spec-precision gaps (SKILL-03, SKILL-08).

---

## Edge Cases

- [x] Multiple CLIs → all listed: `detect-providers.test.ts:131` `toEqual(["codex","copilot","api"])`
- [x] Uninstalled CLI → same `PROVIDER_UNAVAILABLE`: `factory.test.ts:102` (each kind)
- [x] `.github/instructions/` absent → created: `skills-install.test.ts:67`
- [x] Outside a git repo or unwritable → clear error, no partial write: `skills-install.test.ts:142`, plus the unwritable case
- [x] Codex usage present → used: `codex.test.ts:194-195`
- [x] Legacy flat config + unknown provider → 5 default keys, no stray key: `config.test.ts:369-379`

---

## Discrimination Sensor

**Isolation**: a detached `git worktree` of HEAD `c3a007a` under the scratchpad. The root and `packages/*/node_modules` were symlinked in, because G1 moved `@anthropic-ai/sdk` under `packages/core/node_modules`. A scripted exact-string replace applied each mutant, the targeted suites ran, and `git checkout -- <file>` restored the file. The script aborts if the scratch has tracked changes after a restore; it never did. cli suites ran under a scratchpad-only chalk-stub jest config, which was never committed. Unmutated baselines in the scratch: core 655/655, skills 123/123, cli (stub) 394 passed / 1 failed / 7 skipped. The 1 failure is the stub artifact in `program.test.ts`, and no mutant targeted that suite. Both scratch worktrees (HEAD and base) were removed. The real tree's `git status --porcelain` matched the pre-sensor baseline (checked with `diff`: only `?? .agents/`, `?? .claude/`, `?? .cursor/`).

### Mutants on code changed since iteration 2

| # | File | Mutation | Result |
| - | ---- | -------- | ------ |
| G4a | `core/src/providers/cli-subprocess.ts:104` | `spec.timeoutMs` ignored (always 120 s) | ✅ Killed (4) |
| G4b | `core/src/providers/claude-code.ts:24` | Claude Code given `timeoutMs: 300_000` | ✅ Killed (1) |
| G4c | `core/src/providers/kiro.ts:41` | Kiro timeout back to 120 s | ✅ Killed (1) |
| G4d | `core/src/providers/copilot.ts:47` | Copilot `timeoutMs` removed | ✅ Killed (1) |
| G2a | `core/src/config/types.ts` kiro block | Kiro reverted to the guessed docs IDs `claude-sonnet-4.6` / `claude-opus-4.7` | ✅ Killed (1) |
| G2b | `core/src/config/types.ts` kiro block | Kiro fast ID drifts to `claude-haiku-4-5` | ✅ Killed (1) |
| G6a | `skills/scripts/pr.ts` | try/catch guard removed | ✅ Killed (1) |
| G6b | `skills/scripts/release.ts` | unresolvable argv[1] → treated as invoked (`catch` returns `true`) | ✅ Killed (jest run fails: the script runs on import and calls `process.exit(1)`) |
| G6c | `skills/scripts/review.ts` | absent argv[1] → treated as invoked | ✅ Killed (same mechanism as G6b) |
| G6d | `skills/scripts/commit.ts` | path equality inverted (direct run no longer runs) | ✅ Killed (1) |
| G1a | `skills/.claude-plugin/plugin.json` | version `1.2.1` | ✅ Killed (1) |
| G1b | `cli/package.json` | core pin back to `1.1.1` | ✅ Killed (1) |
| G1c | `skills/package.json` | core pin back to `1.1.1` | ✅ Killed (1) |
| G3a | `SECURITY.md:106` | subprocess line reverted to "`gh` and `claude`" | ✅ Killed (3) |
| G3b | `SECURITY.md:105` | egress claim reverted to "Diffs are sent to Claude" | ✅ Killed (2) |
| D1 | `README.md:117` | Privacy reverted to "Diffs are sent to Claude" | ✅ Killed (1) |
| **V1** | `core/src/config/types.ts` copilot block | Copilot reverted to pre-F5 `claude-sonnet-4.5` / `claude-opus-4.1` (not in the CLI's list) | ❌ **Survived** → fix task |
| **V2** | `core/src/config/types.ts` codex block | Codex fast reverted to `gpt-5.1-codex-mini` (not in the catalog) | ❌ **Survived** → fix task |
| V3 | `docs/src/content/docs/configuration.md:24` | example Kiro block drifts from the code defaults | ⚪ Survived. Spec-equivalent for DOC-03, which requires the shape, and the block is labeled an example. Advisory. |

### Mutants on earlier areas

| # | File | Mutation | Result |
| - | ---- | -------- | ------ |
| E1 | `core/src/config/merge.ts:21-27` | `deepMerge` models → flat spread | ✅ Killed (2) |
| E2 | `cli/src/commands/skills.ts:124` | `rmSync` each target root before copying | ✅ Killed (3: codex, kiro, copilot reinstall preservation) |
| E3 | `core/src/commands/release.ts:240` | AND drops the changelog call | ✅ Killed (1) |
| E4 | `cli/src/commands/config.ts:103` | `gw config provider bogus` accepted | ✅ Killed (1) |
| E5 | `core/src/commands/token-format.ts:7` | `formatTokens` never prints n/a | ✅ Killed (1) |

**Sensor depth**: expanded (24 mutations)
**Result**: 21/24 killed. V3 is spec-equivalent. **V1 and V2 survived and are not spec-equivalent**: MDL-02 requires "each vendor's current documented model names", and F5's Done-when (`tasks.md:909-910`) fixes the verified values. **FAIL ❌**

---

## Gate Check

Build gate from tasks.md: `npm run build && npm run lint && npm run typecheck && npm test`. build, lint, typecheck, and the root test ran in the **real tree** at HEAD `c3a007a`. The build regenerated the tracked `packages/skills/dist` (7 modified files, plus untracked `dist/adapters/` and `generate-adapters.*`). All of it was restored with `git checkout` + `rm`, and porcelain matched the baseline afterwards. The base run used a scratch worktree of `6e1fd11`. `rtk proxy` bypassed the shell hook's output filtering.

| Step | HEAD `c3a007a` | Base `6e1fd11` | Classification |
| ---- | -------------- | -------------- | -------------- |
| `npm run build` | exit 0 | exit 0 (iteration 2) | ✅ |
| `npm run lint` | **exit 0** | exit 0 | ✅ G1 cleared iteration 2's 24 TS errors |
| `npm run typecheck` | **exit 0** | exit 0 | ✅ |
| `npm test` (root) | **1092 passed / 28 failed / 7 skipped** (1127 tests, 75 suites, 5 failed) | 850 / 31 / 7 (888 tests, 63 suites) | All 28 HEAD failures also fail at base. I diffed the failing-test sets from `--json`: 0 fail only at HEAD, 28 fail in both, and 3 fail only at base (the version-lockstep tests G1 fixed). |

**The 28 root failures (environmental, pre-existing):** chalk 5.6.2's `ReferenceError: Cannot access 'supportsColor' before initialization` load-order failure, in 5 cli suites: `run-cli` (15), `release-wiring` (10), and `readme-doc-snippets` (3) fail per test; `commands.test.ts` and `program.test.ts` fail at module load and contribute 0 counted tests.

**The official gate does not run the chalk-blocked suites.** This includes all five `Tokens: n/a` CLI print tests (`commands.test.ts:326, 380-381, 387-388, 411, 438, 479`) and the `gw commit` alternatives test. Their evidence above comes **only** from a scratchpad-only chalk-stub jest config (moduleNameMapper `^chalk$` → a Proxy stub, never committed):
- HEAD: **394 passed / 1 failed / 7 skipped (402)**. `commands.test.ts` 43/43, `run-cli` 15/15, `release-wiring` 10/10, `readme-doc-snippets` 3/3, `program.test.ts` 9/10. The 1 failure, "invoking a subcommand without --no-color leaves chalk untouched", is an artifact of the stub.
- Base: 306 / 2 / 7 (315). The same stub artifact, plus the cli lockstep test.

**Test count**: 888 → 1127 (+239). Passing: 850 → 1092 (+242). Skipped: 7, the same as base. `7a92052..HEAD` added 25 tests (`config.test` +1, `cli-subprocess.test` +6, `security-docs.test` +6, `invoked-directly.test` +12) and deleted or weakened none; the only modified test line is the new `jest` import.

**Pack check** (scratch build, `npm pack --dry-run`): `@denisvieiradev/gitwise-skills@1.2.0` has 41 files, including all 9 `dist/adapters/**` files. `exports` includes `./package.json`, so `require.resolve("@denisvieiradev/gitwise-skills/package.json")` in `cli/src/commands/skills.ts:66` works against the published layout. `@denisvieiradev/gitwise@1.2.0` pins `gitwise-core 1.2.0` and `gitwise-skills 1.2.0`, both equal to the workspace version.

---

## Release risks (not spec failures)

- **R1: npm has no 1.2.0 of any package.** The registry lists only `0.1.0` and `1.1.1` for `gitwise`, `gitwise-core`, and `gitwise-skills`, but tag `v1.2.0` already exists on `73b0c09` (`chore(release): v1.2.0`). The pins now say `1.2.0`. Before merging, choose one path: (a) republish 1.2.0 through the `release.yml` manual dispatch with a moved tag, or (b) bump to the next version. **With (b), `scripts/release.mjs` does not bump the cross-package pins** (`cli` → core/skills, `skills` → core). It also looks for `packages/<name>/plugin.json`, so it **misses `packages/skills/.claude-plugin/plugin.json`**. After a plain `release.mjs minor`, the 3 lockstep tests fail again, and the published `gw` would pin a `gitwise-core@1.2.0` that does not exist on npm. The pins and plugin.json must be bumped by hand, or the script extended.
- **R2: `release.yml` runs `npm test` before publishing**, and root `npm test` exits 1 on the 28 chalk failures, at base as well as HEAD. Any tag-triggered publish fails until chalk is fixed or pinned. This is pre-existing.
- **R3: tracked `packages/skills/dist` is stale**: it has no `adapters/`, and its scripts predate G6 and the token-output changes. The npm tarball is built fresh at publish time. The Claude Code plugin, which installs by git clone, gets whatever the `plugin-dist-guard` / "rebuild bundled dist" flow commits on `main`.
- **R4**: the chalk 5.6.2 load-order failure hides 5 cli suites, including every PROV-07 print test, from CI (see Gate).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ G4 adds one optional field and one `??`. G6 uses an inline IIFE per script; the task explains why there is no shared module (tsup entries). |
| Surgical changes | ✅ G5 changes only a comment. G1 changes only config. |
| No scope creep | ✅ No Out-of-Scope item was built. The timeout (G4) is outside the spec, but it is marked `SPEC_DEVIATION` and supports PROV-01/03/05. `design.md` should record it. |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ❌ MDL-02: Codex and Copilot defaults are unpinned |
| Per-layer coverage | ✅ |
| Every test maps to a requirement | ✅ |
| Documented guidelines | none beyond spec/design/STATE; strong defaults applied |

**Housekeeping (non-blocking):** `spec.md:274-321` traceability still says every ID is `Pending`, with "0 mapped". The superseded G2 checkboxes are at `tasks.md:979-983`. `docs/migrating-from-devflow.md:37` describes the old two-option first run.

---

## Fix Plans

### Fix 1 (Major): pin the Codex and Copilot default model IDs

- **Root cause**: after F5 and G2, only the Claude blocks (`config.test.ts:30-31`) and the Kiro block (`:35`) are pinned. Codex and Copilot are checked only for non-empty strings (`:46-49`), so reverting them to IDs the vendor CLIs do not list goes undetected (V1, V2).
- **Fix task**: in `packages/core/__tests__/unit/config/config.test.ts`, next to the Kiro test, add `expect(DEFAULT_USER_CONFIG.models.codex).toEqual({ fast: "gpt-6-luna", balanced: "gpt-6-sol", powerful: "gpt-6-astra" })` and `expect(DEFAULT_USER_CONFIG.models.copilot).toEqual({ fast: "claude-haiku-4.5", balanced: "claude-sonnet-4.6", powerful: "claude-opus-4.7" })`. Name each test after its source, as the Kiro test does.
- **Done when**: V1 and V2 fail the core suite, and the core suite is 657/657.

### Fix 2 (Minor, optional): docs example parity

- Add a `docs-presence.test.ts` assertion that `configuration.md`'s example `models` blocks equal `DEFAULT_USER_CONFIG.models`, or reword the heading to make clear the values are illustrative. This kills V3.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| PROV-01..07, CFG-01..03, MDL-01, MDL-03..07, DIST-01..06, SKILL-01, 02, 04..07, GEM-01, GEM-02, DOC-01..07 | ✅ Verified |
| MDL-02 | ❌ Needs fix: Codex and Copilot defaults unpinned (Fix 1) |
| SKILL-03, SKILL-08 | ⚠️ Spec-precision gap: live discovery cannot be automated; the structure is verified |

---

## Lessons (candidates; not recorded, since this pass may only write `validation.md`)

1. When a fix pins one member of a parallel set (the Kiro defaults), pin every sibling in the same change. A guess that was caught for one vendor goes uncaught for the others.
2. When a spec defers concrete values to implementation ("resolved during implementation"), the task's Done-when values become the test oracle. Assert them exactly; a shape or non-empty check is not enough.

---

## Summary

**Overall**: ❌ Not ready: one narrow MDL-02 test gap. Everything else is verified.

**Spec-anchored check**: 39/40 IDs matched, with MDL-02 partial. 2 spec-precision gaps (SKILL-03, SKILL-08).
**Sensor**: 21/24 killed. V1 and V2 survived (fix task). V3 is spec-equivalent.
**Gate**: build, lint, and typecheck exit 0. Root test: 1092 passed / 28 failed / 7 skipped. All 28 are the chalk 5.6.2 load-order failures and also fail at base `6e1fd11`. The chalk-blocked suites pass under a scratch stub (394/1/7, where the 1 is a stub artifact), but CI never runs them.

**Completion gate**: `python3 .claude/skills/tlc-spec-driven/scripts/validate_state.py codex-kiro-copilot-support` → exit 1: `ERROR codex-kiro-copilot-support: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)` / `validate_state: 1 error(s)`. That is the correct result for a FAIL report.
