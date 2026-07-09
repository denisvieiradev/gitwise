# PRD: Usage Telemetry

## Overview

gitwise collects no usage data today and advertises that fact. As a result, the maintainers have no visibility into which commands people actually run, on which surface, or where those commands fail. Roadmap and reliability decisions are made blind.

This feature adds **opt-in, anonymous usage telemetry** across all three gitwise surfaces — the `gw` CLI, the Claude Code plugin, and the Gemini skill mirrors. It answers two questions: *which commands get used* and *where users hit errors*. It is for the gitwise maintainers, so they can invest effort where it matters and fix the failures users actually encounter. It is valuable because it converts guesswork into evidence while preserving the trust of a privacy-sensitive developer audience — telemetry stays off until the user chooses to turn it on.

## Goals

- Learn the relative adoption of the `commit`, `review`, `pr`, `release`, and `config` commands, split by surface (CLI vs plugin vs Gemini).
- Learn which commands fail, how often, and with what error category, so reliability work can be prioritized.
- Ship without damaging gitwise's privacy reputation: consent is explicit, data is anonymous, and the off-switch is trivial and documented.
- Target: instrument all surfaces in a single release, with telemetry disabled by default and no measurable impact on command latency.

## User Stories

**Maintainer (primary persona)**
- As a maintainer, I want to see how often each command runs so that I can prioritize which commands to improve.
- As a maintainer, I want to compare command usage across CLI, plugin, and Gemini so that I know which surfaces matter.
- As a maintainer, I want to see which commands error out and their error category so that I can fix the most common failures.

**gitwise user (primary persona)**
- As a user, I want to be asked before any data is collected so that I stay in control.
- As a user, I want to know exactly what is and is not collected so that I can trust the tool.
- As a user, I want to disable telemetry with one command or an environment variable so that I can turn it off in scripts and CI.

**CI / automation operator (secondary persona)**
- As someone running gitwise in CI, I want telemetry to stay off unless explicitly enabled so that automated runs never phone home unexpectedly.

## Core Features

**1. Explicit opt-in consent (highest priority)**
Telemetry is off by default. On the CLI first-run flow, a one-time prompt explains what is collected and asks the user to enable it. Consent is stored as a single flag in the shared gitwise user config and honored by every surface. Users can enable or disable at any time via `gw config telemetry on|off` or the `GITWISE_TELEMETRY` environment variable (which overrides config for non-interactive contexts). No surface emits any event while the flag is off.

**2. Command usage events**
When enabled, each command run emits one anonymous event capturing: command name, surface (CLI / plugin / Gemini), success or failure, gitwise version, operating system, and a random anonymous install ID. This satisfies the adoption goal.

**3. Error and friction signal**
Failed command runs additionally capture an error category and a **sanitized** error message / stack trace. A scrubber strips file paths, repository names, branch names, and any identifying content before an event leaves the machine. This satisfies the error-tracking goal.

**4. Anonymous identity**
A random install ID is generated once on first run and persisted in the gitwise config directory. It contains no personal, machine, or repository identifiers and exists only to distinguish distinct installs from repeat usage. No user, email, repo, file, or diff content is ever collected.

**5. Documented off-switch and transparency**
The README and SECURITY.md are updated from "no telemetry" to "optional, anonymous telemetry, off by default," with a published list of exactly what is and is not collected and clear disable instructions.

## User Experience

**First contact (CLI):** On first run, after the existing setup prompts, the user sees a short, friendly telemetry prompt: what it helps with, what is and is not collected, and a yes/no choice defaulting to off. Their choice is saved.

**Plugin / Gemini users:** No prompt appears in these hosts. Telemetry activates on these surfaces only if the user has already enabled it (via the CLI or config). Absent that, these surfaces stay silent — the safe default.

**Ongoing use:** Telemetry is invisible and never blocks or slows a command. Events are best-effort; failures to send are silent and never surface to the user.

**Changing the setting:** `gw config telemetry on|off` flips it interactively; `GITWISE_TELEMETRY=0` disables it for a single invocation or an entire CI environment.

**Discoverability:** The first-run prompt, the `config` command, README, and SECURITY.md all make the setting and its scope easy to find.

## High-Level Technical Constraints

- **Privacy:** Only anonymous data may leave the machine. No diffs, file contents, repo/branch names, paths, user identity, or credentials. Error messages must pass through a scrubber before transmission.
- **Consent integrity:** A single shared consent flag governs all surfaces; no surface may emit events while it is off. An environment variable must be able to force-disable for non-interactive use.
- **Performance:** Telemetry must not add perceptible latency and must never block or fail a user command; sending is best-effort and asynchronous to the user-visible result.
- **Data residency:** The destination must offer an EU-residency option.
- **Cost:** Must operate within a free tier at expected volume (thousands of events/month).
- **Consistency:** All three surfaces must produce identical event shapes from identical inputs.

## Non-Goals (Out of Scope)

- Retention analytics and feature-adoption-over-time tracking (deferred; goal is adoption + errors only).
- Command duration, flags used, and repository-size metrics (explicitly excluded from data scope).
- Any personally identifying data, user accounts, or cross-tool identity linking.
- Collecting diffs, file contents, or repository/branch names.
- A user-facing analytics dashboard inside gitwise (analysis happens in the telemetry backend).
- Opt-out / default-on collection (rejected in ADR-001).
- Self-hosting the telemetry backend at launch (schema kept portable for later).

## Phased Rollout Plan

### MVP (Phase 1) — single release, all surfaces

- Explicit opt-in consent with CLI first-run prompt and shared config flag.
- `gw config telemetry on|off` and `GITWISE_TELEMETRY` env override.
- Command usage events on CLI, plugin, and Gemini surfaces.
- Error category + sanitized error message/stack-trace collection with a scrubber.
- Anonymous install ID.
- Updated README and SECURITY.md privacy language.
- **Success criteria to proceed:** telemetry verified off by default on all surfaces; scrubber verified to strip paths/repo names in tests; no measurable command-latency impact; events visible in the backend when enabled.

### Phase 2 (future, not committed)

- Revisit consent posture based on measured enrollment.
- Consider additional coarse, non-identifying context (e.g., duration buckets) if a concrete question requires it.
- Consider retention / feature-adoption analysis.

### Phase 3 (future, not committed)

- Evaluate self-hosting the backend for full data ownership if volume or policy warrants.

## Success Metrics

- **Consent safety:** 100% of runs emit zero events while telemetry is disabled (the default).
- **Enrollment:** measurable opt-in rate after launch (baseline to be established; informs any future posture change).
- **Answering the goals:** maintainers can rank commands by usage and by failure rate per surface within the first month of data.
- **Privacy integrity:** zero identifying data (paths, repo names, identity) present in collected events, verified by scrubber tests and spot audits.
- **Performance:** no perceptible added latency to any command.

## Risks and Mitigations

- **Reputational risk from introducing telemetry at all.** Mitigation: opt-in by default, transparent disclosure, trivial off-switch, anonymous-only data (ADR-001).
- **Low enrollment yields a small, self-selected sample.** Mitigation: clear value-oriented first-run prompt; treat data as directional; revisit posture with real numbers.
- **Larger blast radius from launching on all surfaces at once (ADR-003).** Mitigation: thorough scrubber and consent-gate test coverage; documented immediate off-switch available at launch.
- **Plugin/Gemini users never enroll (no prompt in those hosts).** Accepted as the safe default; enrollment there depends on prior CLI/config enablement.
- **Dependency on a third-party backend.** Mitigation: anonymous events, EU-residency option, portable schema for future migration or self-hosting (ADR-002).

## Architecture Decision Records

- [ADR-001: Opt-in consent for usage telemetry](adrs/adr-001.md) — Telemetry is off by default with an explicit first-run opt-in, preserving the tool's privacy reputation.
- [ADR-002: PostHog Cloud free tier as the telemetry destination](adrs/adr-002.md) — Anonymous events sent to a zero-cost, zero-infra managed backend with EU residency and a portable schema.
- [ADR-003: Big-bang rollout across all surfaces with a shared consent flag](adrs/adr-003.md) — All three surfaces ship telemetry in one release, gated by a single shared consent flag.

## Open Questions

- What exact copy should the first-run consent prompt use, and how prominent should it be?
- What is the concrete error-category taxonomy (e.g., auth, network, git-state, provider) for the error signal?
- Should the shared consent flag's absence (never prompted) be treated as "ask again next CLI run" or "silent until explicitly set"?
- Should there be a lightweight way for plugin/Gemini-only users to enable telemetry without ever touching the CLI, or is that acceptably out of scope for MVP?
