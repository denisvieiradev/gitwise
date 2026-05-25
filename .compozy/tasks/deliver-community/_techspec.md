# TechSpec: deliver-community

## Executive Summary

This TechSpec defines the technical work required to deliver `gitwise` to the open-source community at a credible 1.0 hardening bar, with security and reliability as primary goals. The codebase already has a strong baseline (no shell-injection sites, atomic secret writes, LLM output never executed, retry/backoff on the Anthropic API, sensitive-file blocklist, 80% coverage threshold). The remaining gaps cluster in three areas: supply-chain integrity for npm releases, automated security gates in CI, and reliability of multi-step git workflows. A fourth, smaller area covers community-facing governance documentation.

The chosen approach is to harden the existing pipeline rather than restructure it: adopt npm provenance with OIDC, CycloneDX SBOM, and signed tags (ADR-001); add CodeQL, Dependabot, and OSV-Scanner as CI gates (ADR-002); introduce a `GitwiseError` class with stable exit codes that double as the contract for shell-script integrations (ADR-003); wrap multi-step git flows (release prepare, workspace version bump, commit-split) in a `Transaction` primitive that records compensating actions (ADR-004); and document the project under a BDFL governance model with Contributor Covenant 2.1 (ADR-005). Every decision must be surfaced in `README.md` and the dedicated docs site under `docs/`. The primary technical trade-off is build/CI complexity in exchange for verifiable provenance, predictable failure modes, and a documented contract for downstream automation.

## System Architecture

### Component Overview

The work spans every workspace and adds two new shared primitives. No new package is introduced; YAGNI applies.

**Existing components touched:**

| Component | Workspace | Role in this work |
|-----------|-----------|-------------------|
| `core/src/commands/release.ts` | core | Adopt `Transaction` for prepare; throw `GitwiseError` with stable codes |
| `core/src/commands/commit.ts` | core | Adopt `Transaction` for commit-split; throw `GitwiseError` |
| `core/src/infra/git.ts` | core | Throw `GitwiseError({ code: "GIT_FAILED" })` on non-zero exits |
| `core/src/infra/github.ts` | core | Throw `GitwiseError({ code: "GH_FAILED" })` on non-zero exits |
| `core/src/infra/env.ts` | core | Throw `GitwiseError({ code: "API_KEY_MISSING" \| "CONFIG_INVALID" })` |
| `core/src/providers/anthropic.ts` | core | Throw `GitwiseError({ code: "API_FAILED" \| "API_RATE_LIMITED" })` |
| `cli/src/index.ts` | cli | Exit-code dispatch, `--json` error envelope, hint footer |
| `cli/src/program.ts` | cli | Global `--json` flag; remove `--api-key` flag (deprecated, see Risks) |
| `.github/workflows/ci.yml` | repo | Pin Actions to SHAs |
| `.github/workflows/release.yml` | repo | Replace `NPM_TOKEN` with OIDC; `--provenance`; SBOM upload; signed tag |

**New components (kept minimal, added inside existing packages):**

| Component | Workspace | Purpose |
|-----------|-----------|---------|
| `core/src/errors.ts` | core | `GitwiseError` class, `EXIT_CODES` table, `wrapError` helper |
| `core/src/infra/transaction.ts` | core | `Transaction` class with apply/compensate steps |
| `core/src/infra/lockfile.ts` | core | Advisory `.gitwise/.lock` for concurrent-invocation safety |
| `.github/workflows/codeql.yml` | repo | CodeQL SAST workflow |
| `.github/workflows/osv-scanner.yml` | repo | Daily + PR dependency scan |
| `.github/workflows/dependabot-auto-merge.yml` | repo | Merge minor/patch updates after tests pass |
| `.github/dependabot.yml` | repo | npm + github-actions update config |
| `.github/CODEOWNERS` | repo | Route every path to `@denisvieiradev` |
| `CODE_OF_CONDUCT.md` | repo | Contributor Covenant 2.1 |
| `GOVERNANCE.md` | repo | BDFL model, decision process, succession |
| `KEYS.asc` | repo | Maintainer GPG public key |
| `docs/exit-codes.md` | docs site | Public exit-code contract |
| `docs/recovery.md` | docs site | Manual recovery steps for `ROLLBACK_PARTIAL` |
| `docs/supply-chain.md` | docs site | How to verify provenance, SBOM, signed tags |

**Data flow** is unchanged: the CLI invokes a core command, which orchestrates infra calls (git, gh, env, providers). The Transaction primitive intercepts side-effectful steps and accumulates compensating actions; the `GitwiseError` class flows from any layer to the CLI's top-level handler, which translates `code` → exit code and optional `--json` payload.

### External system interactions

Unchanged from current architecture: Anthropic API, local `git`, optional `gh`, optional `claude` binary, user filesystem under `~/.gitwise/`. New supply-chain interactions are CI-only: npm registry (via OIDC token), Sigstore (via npm provenance), OSV.dev (via OSV-Scanner), GitHub Advisory Database (via CodeQL/Dependabot).

## Implementation Design

### Core Interfaces

**`GitwiseError` and `EXIT_CODES`** (see [[adr-003]]):

```ts
export class GitwiseError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;

  constructor(args: { code: string; message: string; exitCode?: number; cause?: unknown; details?: Record<string, unknown> }) {
    super(args.message);
    this.name = "GitwiseError";
    this.code = args.code;
    this.exitCode = args.exitCode ?? EXIT_CODES[args.code] ?? 1;
    this.cause = args.cause;
    this.details = args.details;
  }
}

export const EXIT_CODES: Readonly<Record<string, number>> = Object.freeze({
  OK: 0, UNKNOWN: 1,
  NOTHING_STAGED: 10, INVALID_INTENT: 11,
  GIT_FAILED: 20, GH_FAILED: 21, REPO_STATE_INVALID: 22,
  API_FAILED: 30, API_KEY_MISSING: 31, API_RATE_LIMITED: 32,
  USER_ABORT: 40, CONFIG_INVALID: 50,
  RELEASE_PLAN_STALE: 60, RELEASE_BRANCH_CONFLICT: 61,
  SENSITIVE_FILE_BLOCKED: 70, REPO_LOCKED: 80, ROLLBACK_PARTIAL: 81,
});
```

**`Transaction` primitive** (see [[adr-004]]):

```ts
export interface Step<T> {
  name: string;
  apply: () => Promise<T>;
  compensate: (result: T) => Promise<void>;
}

export class Transaction {
  private applied: Array<{ step: Step<unknown>; result: unknown }> = [];

  async run<T>(step: Step<T>): Promise<T> {
    const result = await step.apply();
    this.applied.push({ step: step as Step<unknown>, result });
    return result;
  }

  async rollback(reason: GitwiseError, logger: Logger): Promise<void> {
    for (const { step, result } of [...this.applied].reverse()) {
      try { await step.compensate(result); }
      catch (err) { logger.warn("compensate-failed", { step: step.name, reason: err }); }
    }
  }
}
```

**Advisory lockfile** (see [[adr-004]]):

```ts
export async function acquireRepoLock(repoPath: string): Promise<() => Promise<void>> {
  const lockPath = path.join(repoPath, ".gitwise", ".lock");
  // Stale-lock detection: if existing lock's PID is dead or older than 10 minutes, reclaim.
  // Throws GitwiseError({ code: "REPO_LOCKED" }) if another live gitwise holds it.
}
```

### Data Models

No new persisted data models. The release-plan file format (`.gitwise/release-plan.json`) is unchanged. The lockfile is a small JSON document:

```json
{ "pid": 12345, "host": "host-id", "command": "release prepare", "acquiredAt": "2026-05-21T10:00:00Z" }
```

The `--json` CLI error envelope is the only new wire format:

```json
{ "error": { "code": "GIT_FAILED", "message": "git push refused: non-fast-forward", "exitCode": 20, "details": { "stderr": "..." } } }
```

### API Endpoints

Not applicable — `gitwise` is a CLI/library, not a service.

## Integration Points

| Integration | Purpose | Auth | Failure handling |
|-------------|---------|------|------------------|
| npm registry (publish) | Release publication | OIDC (id-token: write) | Workflow fails; manual rerun. No partial-publish handling — npm publishes are workspace-scoped; if one workspace fails mid-loop, re-run the workflow with the same tag |
| Sigstore (via npm) | Provenance attestation | OIDC | Captured inside `npm publish --provenance`; failure aborts publish |
| OSV.dev | Vulnerability lookup | None | CI failure on HIGH/CRITICAL; manual ack via `osv-scanner.toml` |
| GitHub Advisory DB | CodeQL + Dependabot | GitHub-native | Surface as PR checks; no runtime impact |
| GitHub OIDC | npm auth | Built-in | Workflow-level trust policy scopes by repo + branch + workflow |

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|-----------|-------------|---------------------|-----------------|
| `core/src/errors.ts` | new | Foundation for all error-handling changes. Low risk in isolation. | Add file, unit tests, parity test against `docs/exit-codes.md` |
| All `throw Object.assign(new Error(...), { code })` sites in core (~40) | modified | Mechanical migration to `new GitwiseError(...)`. Risk of behavioral drift if codes are dropped silently. | Codemod-style PR; assertions on `code` field; CI parity test |
| `cli/src/index.ts` | modified | New exit-code dispatch + `--json` envelope. Risk: a non-GitwiseError leak produces a bare stack trace. | Wrap all top-level catches; `wrapError(err)` helper |
| `cli/src/program.ts` | modified | Global `--json` flag; **deprecate** `--api-key` CLI flag (audit-flagged risk: appears in `ps aux`, shell history). | Print deprecation warning; remove in v0.next+1 |
| `core/src/infra/transaction.ts` | new | Shared transactional primitive. Risk: incorrect compensate logic worsens partial state. | Per-step apply + compensate unit tests; integration tests deliberately fail at each step boundary |
| `core/src/infra/lockfile.ts` | new | Concurrent-invocation guard. Risk: stale lock blocks legitimate use. | 10-minute stale-lock detection + PID-liveness check |
| `core/src/commands/release.ts` | modified | Adopt Transaction for prepare. Risk: rollback path itself fails. | `ROLLBACK_PARTIAL` non-fatal warning + recovery doc |
| `core/src/commands/commit.ts` | modified | Adopt Transaction for commit-split. Risk: stash compensate loses uncommitted work if pop fails. | Pre-flight stash → tag stash with `gitwise/split-<timestamp>` → recovery doc references stash name |
| `.github/workflows/release.yml` | modified | OIDC replaces NPM_TOKEN; `--provenance`; SBOM; signed tag. Risk: misconfig blocks releases. | Test in a sibling fork before cutting first hardened release |
| `.github/workflows/ci.yml` | modified | Pin Actions to SHAs. | Mechanical; covered by Dependabot |
| `.github/workflows/codeql.yml` | new | Adds 3–5 min to PR CI. Risk: false positives block PRs. | Documented hotfix exception in CONTRIBUTING.md |
| `.github/workflows/osv-scanner.yml` | new | Daily + PR scan. Risk: unfixable findings stall releases. | `osv-scanner.toml` ignore list with expiry enforcement |
| `.github/dependabot.yml` | new | Generates update PRs. Risk: malicious dep auto-merges. | Auto-merge gated on full test matrix + OSV-Scanner pass; major bumps require manual review |
| `.github/CODEOWNERS` | new | Auto-routes review requests to maintainer. | One-line file |
| `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `KEYS.asc` | new | Community-facing docs. | Verbatim Contributor Covenant; bespoke GOVERNANCE; published GPG fingerprint |
| `README.md` | modified | Surface all five decisions: badges (CI, CodeQL, provenance), Security/Supply Chain/Governance/Exit Codes sections each linking to canonical doc. | New top-level sections; badges in header |
| `docs/exit-codes.md`, `docs/recovery.md`, `docs/supply-chain.md` | new | Authoritative docs for each public contract. | Generated where possible; hand-written prose around tables |
| `CONTRIBUTING.md` | modified | Document transactional-flow pattern, hotfix exception process, security-test expectations. | New subsections |
| `SECURITY.md` | modified | Add GPG fingerprint reference, supply-chain verification one-liner, link to `docs/supply-chain.md`. | Append section |

## Testing Approach

### Unit Tests

- **`GitwiseError`**: construction, default exit-code lookup, override, JSON serialization shape.
- **Exit-code parity**: a single test parses `docs/exit-codes.md`, asserts the documented table equals `EXIT_CODES` from code (no drift in either direction).
- **`Transaction`**: apply + compensate ordering (LIFO); compensate failures logged but non-fatal; `ROLLBACK_PARTIAL` surfaced after underlying error.
- **`lockfile`**: acquire/release happy path; stale-lock reclaim after 10 min; live-lock rejection with `code: "REPO_LOCKED"`.
- **Subprocess argument safety** (new): assert `execFile` is called with array args (not strings) for every wrapper in `git.ts`, `github.ts`, `claude-code.ts`. A future refactor introducing `shell: true` fails this test.
- **Sensitive-file blocklist** (new): assert every pattern in the blocklist matches representative paths; assert un-blocked paths still flow through.

### Integration Tests

- **`release prepare` failure boundaries**: simulate failure after branch creation, after gitignore mutation, after notes write, after plan write. Assert end-state = pre-prepare state for each.
- **`release prepare` happy path**: existing integration test extended with rollback-fired assertion (negative case).
- **`commit-split` failure boundaries**: simulate `git commit` failure at i=0, i=middle, i=last. Assert pre-split working tree is restored via the named stash.
- **Workspace version-bump failure**: simulate write failure on packages[1].package.json. Assert packages[0] is reverted.
- **Concurrent invocation**: spawn two gitwise commands; assert the second fails fast with `code: "REPO_LOCKED"`.
- **`--json` mode**: every `code` in `EXIT_CODES` is producible by some test scenario and emits the documented envelope shape.

### CI/Release pipeline tests

- **Provenance smoke test**: a publish to a `--dry-run` npm registry from a release-candidate tag asserts the provenance step runs without auth-config errors.
- **SBOM smoke test**: `cdxgen` runs on the workspace and produces a non-empty CycloneDX 1.5 document; the file is uploaded as a workflow artifact in CI for inspection.

## Development Sequencing

### Build Order

1. **`errors.ts` + `EXIT_CODES` + tests** — no dependencies. Establishes the contract.
2. **Migrate core throw sites to `GitwiseError`** — depends on step 1. Single mechanical PR.
3. **Update `cli/src/index.ts` exit-code dispatch and `--json` envelope** — depends on step 2.
4. **`docs/exit-codes.md` + parity test** — depends on step 1. Locks the contract.
5. **`transaction.ts` + `lockfile.ts` + tests** — depends on step 1 (uses `GitwiseError` codes). Independent of steps 2–4.
6. **Migrate `commands/release.ts` prepare to Transaction** — depends on step 5.
7. **Migrate `commands/commit.ts` commit-split to Transaction** — depends on step 5.
8. **Migrate workspace version-bump to Transaction** — depends on step 5.
9. **Subprocess argument-safety tests + sensitive-file blocklist tests** — depends on nothing. Can run parallel to step 1.
10. **`.github/CODEOWNERS`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`** — no code dependencies. Drop early to set tone.
11. **`KEYS.asc` + GPG signing setup + `SECURITY.md` update** — depends on step 10.
12. **`.github/dependabot.yml` + pinned-SHA action sweep** — depends on nothing.
13. **`.github/workflows/codeql.yml`** — depends on nothing.
14. **`.github/workflows/osv-scanner.yml` + `osv-scanner.toml`** — depends on nothing.
15. **`.github/workflows/dependabot-auto-merge.yml`** — depends on steps 12–14 (auto-merge gates on these).
16. **Refactor `.github/workflows/release.yml`: OIDC + `--provenance` + SBOM step + signed tag** — depends on steps 11 (GPG key) and 12 (pinned actions).
17. **`docs/recovery.md` + `docs/supply-chain.md`** — depends on steps 6–8 (recovery) and step 16 (supply-chain).
18. **README.md overhaul: badges + Security/Supply Chain/Governance/Exit Codes sections** — depends on steps 4, 10, 16, 17. **README must link out to every canonical doc** per user requirement; nothing decided in this TechSpec lands without a README pointer.
19. **CONTRIBUTING.md updates: transactional flow pattern, hotfix exception, security-test expectations** — depends on step 6.
20. **Deprecate `--api-key` CLI flag (warning only this release; removal next)** — depends on step 3.

### Technical Dependencies

- A maintainer GPG key generated and stored before step 11.
- npm OIDC trust policy configured on the npm side before step 16. Requires npm 2FA-equivalent account configuration.
- GitHub repo settings: enable "Required status checks" for CodeQL, CI, OSV-Scanner before announcing to community.

## Monitoring and Observability

`gitwise` is a CLI; there is no central service to monitor. Operational visibility takes three forms:

- **Structured logs**: every `GitwiseError` is logged at the CLI exit point with `{ code, exitCode, stack }` to stderr. The `--debug` flag (already present) surfaces full stacks; without it, stacks are hidden but `code` is always shown.
- **Telemetry**: none added. The privacy section in README is explicit that the only data leaving the user's machine is the diff sent to Claude (per existing `SECURITY.md`). This is not changed.
- **CI-side metrics**: GitHub Insights dashboards already track PR throughput and check pass rate. The new CodeQL/OSV-Scanner workflows surface their own findings in the Security tab.

The release pipeline emits per-step timing as workflow annotations so a regression in build/SBOM/publish time is visible per-release.

## Technical Considerations

### Key Decisions

- **Decision**: Adopt npm provenance + Sigstore + signed tags + SBOM (ADR-001).
  - **Rationale**: Downstream consumers need verifiable build provenance; long-lived NPM_TOKEN is a top supply-chain compromise vector.
  - **Trade-offs**: Release workflow length increases; maintainer must hold a GPG key.
  - **Alternatives rejected**: SLSA L3 (too heavy pre-1.0); provenance-only (below the bar).

- **Decision**: CodeQL + Dependabot + OSV-Scanner as CI gates (ADR-002).
  - **Rationale**: Catches injection-style regressions and dependency CVEs that the current pipeline misses.
  - **Trade-offs**: ~3–5 min PR CI overhead; ongoing ignore-list maintenance.
  - **Alternatives rejected**: CodeQL-only (misses supply chain); Snyk/Socket (SaaS dependency); `npm audit` (too noisy, narrower DB).

- **Decision**: `GitwiseError` class + stable exit-code table (ADR-003).
  - **Rationale**: Stable exit codes are a usability requirement for a CLI invoked from scripts and pre-commit hooks; rollback dispatch needs typed errors.
  - **Trade-offs**: ~50 call-site migration; exit-code table is a public contract that constrains renumbering.
  - **Alternatives rejected**: Documentation-only (unverifiable); `Result<T, E>` refactor (too wide); Node-idiom-only (no `instanceof` check).

- **Decision**: `Transaction` primitive with apply/compensate for multi-step git flows (ADR-004).
  - **Rationale**: Partial-state hazards are the most likely source of "gitwise broke my repo" issues at community scale.
  - **Trade-offs**: ~1.5x code-line cost per flow; `ROLLBACK_PARTIAL` introduces a third state.
  - **Alternatives rejected**: Idempotent retry (some steps have no external footprint); document-and-dry-run (pushes burden to user); atomic-rewrites (impossible for some flows).

- **Decision**: BDFL + Contributor Covenant + CODEOWNERS (ADR-005).
  - **Rationale**: Honest about current bus-factor of 1; sets behavioral expectations; routes review requests reliably.
  - **Trade-offs**: Single point of CoC enforcement until a co-maintainer is added.
  - **Alternatives rejected**: Multi-maintainer-ready (misrepresents reality); README-note-only (below the floor); foundation/TSC (premature).

- **Cross-cutting decision**: Every decision above must be reflected in `README.md` and a dedicated `docs/*.md` page. Per user instruction, no architectural decision lands without user-visible documentation. The build order in §Development Sequencing makes README the last gate before public announcement.

### Known Risks

- **Risk: OIDC misconfig blocks the first hardened release**. Likelihood: medium for first cutover. **Mitigation**: dry-run against a sibling fork; document rollback to NPM_TOKEN for emergency releases (kept in a sealed env var, used only with explicit toggle in workflow).
- **Risk: Rollback path itself fails, producing `ROLLBACK_PARTIAL` with the user's repo in an unknown state**. Likelihood: low but non-zero. **Mitigation**: each compensate is unit-tested in isolation; `docs/recovery.md` enumerates per-flow recovery; the lockfile prevents concurrent corruption.
- **Risk: CodeQL false positive blocks a hotfix**. Likelihood: low. **Mitigation**: documented hotfix exception in CONTRIBUTING.md (single-PR exception, must be followed by a fix-or-suppress PR within the next release cycle).
- **Risk: Dependabot auto-merge accepts a maliciously-published version of a legitimate package**. Likelihood: low but the attack pattern is real. **Mitigation**: auto-merge requires full test matrix + OSV-Scanner pass on the PR; major bumps always manual; the OSV feed publishes malicious-package advisories within hours of disclosure.
- **Risk: GPG key loss disrupts releases until a new key is published and trusted**. Likelihood: low. **Mitigation**: keys stored in two locations (password manager + offline backup); key-rotation procedure in `SECURITY.md`.
- **Risk: The exit-code contract becomes a maintenance burden as new failure modes are added**. Likelihood: medium over time. **Mitigation**: the parity test catches drift; the table reserves number ranges per category (10s/20s/30s) so new codes slot in cleanly.
- **Areas requiring further research**: GPG signing UX inside GitHub-hosted runners (some prior reports of `gpg --batch` quirks); the precise CycloneDX schema version the GitHub release-asset attestation expects.

## Architecture Decision Records

- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](adrs/adr-001.md) — Adopt provenance, OIDC, signed tags, and per-release CycloneDX SBOM as the baseline supply-chain controls.
- [ADR-002: Automated security and dependency gates in CI](adrs/adr-002.md) — Add CodeQL, Dependabot, and OSV-Scanner; defer OSSF Scorecard.
- [ADR-003: GitwiseError class with stable exit codes and machine-readable error envelope](adrs/adr-003.md) — Introduce a typed error class, a stable exit-code table, and a `--json` error envelope.
- [ADR-004: Transactional rollback for multi-step git workflows](adrs/adr-004.md) — Wrap release prepare, commit-split, and workspace version-bump in a `Transaction` primitive with compensating actions.
- [ADR-005: BDFL governance with CODEOWNERS and Contributor Covenant](adrs/adr-005.md) — Adopt a single-maintainer model, route reviews via CODEOWNERS, and add Contributor Covenant 2.1.
