# PRD: gitwise — AI Git Toolbelt

## Overview

`gitwise` is an AI-powered git assistant that helps developers ship cleaner commits, reviews, pull requests, and releases. It is installable in two equally-supported modes: as a Claude Code skills bundle for users already living inside Claude Code, and as a standalone `gw` CLI that connects to Claude (auto-detecting an installed Claude Code, falling back to a user-supplied `ANTHROPIC_API_KEY`).

The product solves a recurring problem: developers waste time on git hygiene that doesn't change the code — writing conventional commit messages, splitting noisy diffs, drafting PR descriptions, reviewing their own work before push, and cutting versioned releases. Existing AI tools (aicommits, OpenCommit, the Claude Code commit-commands plugin) mostly stop at commit message generation. `gitwise` covers the full pre-ship surface — commit, review, PR, release — and adds a multi-context commit splitter that no popular OSS competitor offers.

The primary audience is solo open-source and indie developers (the adoption wedge), with explicit design choices that keep small-team usage (2–10 engineers) frictionless for a future phase. Users keep their existing git workflow; `gitwise` augments individual high-friction moments with AI, without prescribing a pipeline.

## Goals

- **Adoption wedge**: become the default "AI git assistant" choice for solo OSS / indie developers within the Claude ecosystem.
- **Quality**: produce commit messages, PR bodies, and reviews that ship-grade users accept with zero or one edit ≥ 70% of the time.
- **Parity**: ship both install modes (Claude Code skills + `gw` CLI) at launch with identical command surface and equivalent output quality.
- **Differentiation**: own "multi-context commit splitting" as the headline feature in AI-git tooling.
- **Coverage**: deliver the full pre-ship workflow (commit → review → PR → release) in one tool — no need for users to compose three different OSS tools.
- **Performance from a user perspective**: any single `gw` command completes in under 30 seconds on a typical diff using a balanced-tier model.

## User Stories

**Primary persona — Mira, solo OSS maintainer with multiple side projects**

- As Mira, I want to run one command and get a conventional commit message that reflects what I actually changed, so I stop hand-writing them between context-switches.
- As Mira, I want my noisy "fix a few things" diff to be split into clean per-concern commits, so my git history stays readable when someone reads my repo six months later.
- As Mira, I want to review my own branch before I push, so embarrassing bugs and TODOs don't get caught later by reviewers (or by me reading prod logs).
- As Mira, I want a PR description that summarizes the actual change set (not a hand-written paragraph that drifts from reality), so reviewers grok the diff fast.
- As Mira, I want my release notes and changelog generated in plain English from my commits, so I stop dreading cutting versions.

**Primary persona — Alex, mid-level engineer on a 6-person startup team using Claude Code**

- As Alex, I want to install one Claude Code plugin and have AI git tooling that integrates with the conversation I'm already having, so I never leave the Claude Code window.
- As Alex, I want the same outputs I'd get from the CLI when I run it inside Claude Code, so I can switch contexts without changing tools.
- As Alex, I want the tool to follow my team's existing commit convention (set in a per-repo file), so I don't have to fight every commit message.

**Secondary persona — Sam, devflow-cli existing user**

- As Sam, when I look for `devflow-cli` and find it archived, I want a clear pointer to `gitwise` and an honest note about what changed (the pipeline parts are gone), so I can decide whether to migrate.

## Core Features

Four orthogonal commands. Each works standalone; none requires init or persistent state.

### `gw commit` — Smart commit with multi-context splitting

- Analyzes the staged diff (or, if nothing is staged, offers an interactive file picker).
- Detects whether the diff spans **one logical change or multiple**. If multiple, presents a commit plan and lets the user accept the split, accept as a single commit, or cancel.
- Generates Conventional Commits-style messages (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `style:`, `docs:`) honoring any repo-level commit convention.
- Drafts by default — does NOT auto-commit. User confirms before any commit is created.
- Optional `--push` flag commits and pushes in one step.
- Sensitive-file filtering (env files, credentials, keys) refuses to stage them or warns prominently.

### `gw review` — Pre-push AI review

- Reviews the current branch against the base branch (auto-detected: `main` or `master`, override with `--base`).
- Produces categorized findings: **Critical** (likely bugs, security issues, broken contracts), **Suggestions** (correctness / readability / patterns), **Nitpicks** (style / minor).
- Output is human-readable markdown by default; `--json` available for scripting.
- No auto-fix in MVP; users decide what to act on.

### `gw pr` — AI-drafted Pull Request

- Generates a PR title and description from the commits on the current branch (compared to base).
- Creates the PR via `gh` CLI if available; otherwise prints the title and body for manual creation.
- Supports `--base <branch>` and `--draft`.
- Detects existing PRs on the branch and updates the description instead of erroring.

### `gw release` — Versioned release with notes

- Inspects commits since the last tag and recommends a semver bump (patch / minor / major) based on commit types.
- Lets the user accept the recommendation or override.
- Updates `CHANGELOG.md` (Keep a Changelog format) and writes a client-facing release notes file.
- Bumps the version in `package.json` (or supported equivalents — detected on demand), commits, tags, pushes, and creates a GitHub release via `gh` if available.
- Localizable release notes (English default; Portuguese, Spanish, French at launch).

### Cross-cutting capabilities

- **Per-repo config** (`.gitwise.json`, optional): overrides model tier, language, commit convention, base branch, custom prompt templates.
- **Customizable templates**: users can override the default prompt templates for commit / pr / release using `{{variable}}` interpolation.
- **Token usage reporting**: every LLM call prints input/output tokens so users see what they're spending.
- **Model tier routing** (configurable): `commit`/`pr`/`release` default to fast tier (Haiku); `review` defaults to powerful tier (Opus).
- **Retry with backoff** on transient API errors.

## User Experience

### Install paths

**CLI users:**
```
npm install -g @denisvieiradev/gitwise
gw commit            # works immediately if Claude Code is installed
                     # otherwise prompts for ANTHROPIC_API_KEY (env or one-time setup)
```

**Claude Code users:**
- Install the `gitwise` plugin from the Claude Code marketplace (or via discover-plugins).
- Each command appears as a discoverable skill — `gitwise:commit`, `gitwise:review`, `gitwise:pr`, `gitwise:release`.
- Skills inherit Claude Code's auth; no API key prompt.

### Primary flow — daily commit

1. User makes some changes, runs `gw commit` (or invokes `gitwise:commit` inside Claude Code).
2. Tool reads staged diff; if nothing is staged, offers file picker.
3. Tool decides single-context vs multi-context.
4. **Single-context**: shows the drafted message, user accepts / edits / cancels.
5. **Multi-context**: shows a commit plan (numbered commits with file lists and proposed messages), user picks "split", "all-in-one", or "cancel".
6. On accept, commits are created. With `--push`, the branch is pushed.
7. Token usage is printed.

### Primary flow — pre-ship

1. User finishes a branch, runs `gw review`. Reads the Critical / Suggestions / Nitpicks output, makes fixes (or not).
2. User runs `gw pr`. PR opens with auto-drafted title and body.
3. After merge, on `main`, user runs `gw release`. Picks the suggested bump, picks the language, gets a tagged release with notes and changelog.

### Discoverability & onboarding

- No required `init`. `gw --help` lists the four commands with one-line descriptions and example invocations.
- First-time auth flow: `gw commit` detects Claude Code if installed; otherwise prints a single, copy-pasteable instruction to set `ANTHROPIC_API_KEY`.
- The Claude Code skills bundle ships with discovery metadata so each command surfaces in the plugin browser.

### Accessibility

- All output is plain text / markdown; no required color or animation.
- CLI respects `NO_COLOR` and `--no-color`.
- All interactive prompts are keyboard-navigable.

## High-Level Technical Constraints

- **Claude as the only LLM**: gitwise connects exclusively to Claude (via Claude Code subprocess or Anthropic API). Multi-provider support is out of scope.
- **Privacy**: diffs are sent to Claude for processing; the product must be explicit about this in README and `gw --help`. Sensitive-file filtering (env / credentials / keys) must run before any LLM call.
- **GitHub-first**: PR and release flows use the `gh` CLI; non-GitHub remotes get a graceful fallback (print outputs, skip create).
- **Performance target**: single-command latency under 30 seconds on a typical diff using the configured model.
- **Cross-platform**: macOS, Linux, Windows (via Node ≥ 18).
- **No telemetry**: no usage data leaves the user's machine except the LLM calls themselves (visible by design).

## Non-Goals (Out of Scope)

- **PRD / techspec / tasks / run-tasks / test / done / status** commands — the entire pipeline surface from devflow-cli is dropped.
- **Multi-provider LLMs** (OpenAI, Gemini, Ollama, local models) — Claude only.
- **`gw ship` orchestrator** that auto-chains commit → review → pr → release — deferred to phase 2 if usage data justifies it.
- **Auto-fix in `gw review`** — review is read-only in MVP.
- **Server-side / hosted PR review** like CodeRabbit — out of scope for this product.
- **Web dashboard** for tracking features / commits / releases.
- **Monorepo-aware** behaviors (per-package release, etc.) — single-package repos only in MVP.
- **Conflict resolution narration**, **branch naming**, **blame search** — interesting but out of MVP scope.
- **Migration tooling from devflow-cli** — clean break with a final notice release on the old package.
- **Team policy / enforcement / audit logs** — enterprise concerns deferred.

## Phased Rollout Plan

### MVP (Phase 1)

- `gw commit` (with multi-context splitting), `gw review`, `gw pr`, `gw release` — all four working in both install modes.
- Claude Code auto-detect → `ANTHROPIC_API_KEY` fallback.
- Per-repo `.gitwise.json` overrides for model, language, base branch, commit convention.
- Customizable templates.
- Conventional Commits, Keep a Changelog, semver detection.
- English-default release notes, with PT/ES/FR available.
- Token usage reporting.
- `devflow-cli` archived with a final deprecation release.

**Success criteria to proceed to Phase 2:**
- ≥ 500 weekly active CLI installs OR ≥ 200 unique skills-mode users
- ≥ 70% accept-on-first-edit rate on commit/PR outputs (based on opt-in survey or telemetry-free heuristics in docs feedback)
- < 5 open Critical-severity bugs

### Phase 2

- `gw ship` orchestrator that interactively chains commit → review → pr (→ release) with shared context.
- Optional `gw auth login` flow for one-time API key setup (replaces env-only).
- Team-friendly: shared `.gitwise.json` conventions committed to repo; per-team prompt templates.
- Privacy mode: explicit "redact-before-send" pre-processor for diffs with secrets/PII patterns.
- Additional release language packs.

**Success criteria to proceed to Phase 3:**
- Phase 2 features in use by ≥ 30% of weekly active users.
- ≥ 1 team account adopting `.gitwise.json` via shared config.

### Phase 3

- Local-model fallback (Ollama / on-device) for privacy-sensitive flows.
- `gw branch` (AI branch naming), `gw resolve` (conflict explainer), `gw why` (blame / history narrator).
- Monorepo support.
- Optional hosted team tier for review aggregation (paid).

## Success Metrics

- **Adoption**: weekly active users across both install modes (CLI + skills bundle).
- **Distribution**: weekly npm downloads of `@denisvieiradev/gitwise`; weekly installs of the Claude Code skills bundle.
- **Quality**: accept-on-first-edit rate for `gw commit`, `gw pr`, `gw review` outputs (≥ 70% target).
- **Latency**: p95 command latency under 30 seconds.
- **Reliability**: < 1% command-failure rate (excluding user-side git errors).
- **Differentiator usage**: percentage of `gw commit` invocations where multi-context splitting was offered and accepted by the user. Target ≥ 15% of multi-file commits.
- **Cost transparency**: 100% of LLM calls include a token usage line.

## Risks and Mitigations

- **Risk**: positioning collision with Claude Code's built-in commit plugin and OSS competitors (aicommits, OpenCommit).
  - **Mitigation**: lead with multi-context commit splitting as the headline; reinforce with the breadth of `review`/`pr`/`release` in one tool.
- **Risk**: existing devflow-cli users feel abandoned by the clean break.
  - **Mitigation**: final devflow-cli release prints a deprecation banner with the gitwise install command and a one-paragraph migration note (toolbelt vs pipeline framing).
- **Risk**: skills-mode adoption depends on Claude Code's still-evolving plugin ecosystem.
  - **Mitigation**: CLI is fully first-class and not dependent on the skills surface; if skills adoption is slow, the CLI carries the product.
- **Risk**: Anthropic API price changes or model deprecations break the cost model or quality assumptions.
  - **Mitigation**: model tier mapping is configurable in `.gitwise.json`; defaults can be updated in patch releases.
- **Risk**: privacy backlash from users uncomfortable with diffs going to a cloud LLM.
  - **Mitigation**: explicit documentation; sensitive-file filter on by default; Phase 2 redaction + Phase 3 local-model option.
- **Risk**: branding clash — "gitwise" may already exist as a name on npm or GitHub.
  - **Mitigation**: confirm `@denisvieiradev/gitwise` namespace before launch; the scoped npm package mitigates collision. Tracked in Open Questions.

## Architecture Decision Records

- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](adrs/adr-001.md) — keep all four current commands as independent subcommands and skills; no required workflow or init; reject the orchestrator and skills-first alternatives in favor of true parity and minimum state.

## Open Questions

- Is the `gitwise` name available on npm (unscoped) and as a GitHub repo / org-friendly handle, in case scoped-only ever proves limiting?
- Should the Claude Code skills bundle ship as a single plugin (one install, four skills) or as four separately installable skills? Default assumption: single plugin, four skills.
- How should the `gw release` flow behave in non-Node repos (Python, Go, Rust) — on-demand language detection vs. user-configured file in `.gitwise.json`? Default assumption: detect on demand, fall back to config.
- What is the minimum acceptable accept-on-first-edit rate to call MVP "done"? Currently set to 70% — needs validation with early users.
- Should there be a `gw --version` self-update hint when a new release is available? Default assumption: yes, non-intrusive, matches current devflow-cli behavior.
