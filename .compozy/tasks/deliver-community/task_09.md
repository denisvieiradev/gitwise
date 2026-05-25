---
status: completed
title: Add subprocess argument-safety and sensitive-file blocklist regression tests
type: test
complexity: low
dependencies: []
---

# Task 09: Add subprocess argument-safety and sensitive-file blocklist regression tests

## Overview
Add a defensive test suite that prevents regressions in two of the codebase's most security-sensitive invariants: every subprocess wrapper uses `execFile` with array args (no `shell: true`), and the sensitive-file blocklist matches the patterns the audit relied on. These are TechSpec §Testing Approach "Subprocess argument safety" and "Sensitive-file blocklist" — defensive controls that don't belong to any one feature.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add a test that asserts `execFile` is called with array arguments (NOT strings) for every subprocess wrapper in `packages/core/src/infra/git.ts`, `infra/github.ts`, and any `claude-code` invocation site.
- MUST add a test that fails if `shell: true` appears anywhere in `packages/core/src/`.
- MUST add a test that iterates every pattern in the existing sensitive-file blocklist and verifies it matches representative paths (`.env`, `.env.local`, `credentials.json`, `*.pem`, `id_rsa`, etc.).
- MUST add a test that asserts an un-blocked path (e.g., `src/index.ts`) is NOT matched by the blocklist (anti-overmatching).
- MUST be runnable as part of the standard test suite without requiring additional fixtures or environment setup.
- MUST NOT modify production code in this task — pure regression-test additions.
</requirements>

## Subtasks
- [x] 9.1 Locate every subprocess invocation in `packages/core/src/infra/git.ts`, `infra/github.ts`, and the Claude binary wrapper.
- [x] 9.2 Decide on an enforcement mechanism: static check (scan source files for `shell:` and `exec(`) plus mock-based runtime assertions on `execFile`.
- [x] 9.3 Implement the static check as a unit test that reads source files and asserts forbidden patterns are absent.
- [x] 9.4 Implement runtime assertions by spying on `child_process.execFile` and verifying every wrapper passes array args.
- [x] 9.5 Locate the sensitive-file blocklist (likely in `commands/commit.ts` pre-flight or a dedicated module) and enumerate its patterns.
- [x] 9.6 Add table-driven tests for the blocklist: each pattern → representative blocked path; plus a list of allowed paths that must NOT match.

## Implementation Details
See TechSpec §Testing Approach "Subprocess argument safety" and "Sensitive-file blocklist" for the assertion scope. The static check approach is simple: read each source file as text and assert it does not contain `shell: true` or `child_process.exec(`. The runtime spy approach uses Jest's `jest.spyOn(childProcess, "execFile")` to inspect call signatures during representative command flows.

### Relevant Files
- `packages/core/src/infra/git.ts` — subprocess wrappers under test.
- `packages/core/src/infra/github.ts` — subprocess wrappers under test.
- `packages/core/src/commands/commit.ts` — likely site of the sensitive-file blocklist.
- `packages/core/__tests__/subprocess-safety.test.ts` — NEW.
- `packages/core/__tests__/sensitive-file-blocklist.test.ts` — NEW.

### Dependent Files
- None directly — defensive tests don't change behavior. Future PRs that introduce `shell: true` or break the blocklist will fail CI.

### Related ADRs
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Complements CodeQL (task_13) with cheap codebase-specific assertions CodeQL might not enforce by default.

## Deliverables
- `packages/core/__tests__/subprocess-safety.test.ts` enforcing array-args + no-shell:true.
- `packages/core/__tests__/sensitive-file-blocklist.test.ts` covering every pattern with positive and negative cases.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests exercising the assertions via a real command invocation (mocked subprocess) **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Static scan: `shell: true` is not present in any file under `packages/core/src/infra/`.
  - [x] Static scan: `child_process.exec(` (unsafe variant) is not present in `packages/core/src/`.
  - [x] Runtime: `git status --porcelain` invocation calls `execFile("git", ["status", "--porcelain", ...])` with array args.
  - [x] Runtime: `gh pr create ...` invocation calls `execFile("gh", [...])` with array args.
  - [x] Blocklist: `.env`, `.env.local`, `.env.production` all match.
  - [x] Blocklist: `credentials.json`, `service-account.json` match.
  - [x] Blocklist: `*.pem`, `id_rsa`, `id_ed25519` private keys match.
  - [x] Anti-overmatch: `src/index.ts`, `README.md`, `package.json` do NOT match.
- Integration tests:
  - [x] End-to-end: invoke a representative commit flow with a spied `execFile` and assert every captured call used array args.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- A deliberately introduced `shell: true` in a fixture branch fails this suite (verified locally before submit)
- A deliberately removed blocklist pattern fails this suite (verified locally before submit)
