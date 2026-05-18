---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/cli/src/commands/commit.ts
line: 18
severity: high
author: claude-code
provider_ref:
---

# Issue 004: Six CLI flags are missing or renamed vs the TechSpec contract

## Review Comment

TechSpec line 192-195 prescribes the CLI flag surface for each command. The current implementation diverges in six ways:

| Command | Spec | Implementation | Gap |
|---|---|---|---|
| `gw commit` | `--message <m>` | absent | missing flag — no way to bypass the LLM with a pre-written message |
| `gw commit` | `--base <branch>` | absent | missing flag |
| `gw commit` | `--no-confirm` | `--apply` | renamed; spec parity broken |
| `gw review` | `--json` | absent | missing flag — PRD line 57 requires JSON for scripting |
| `gw pr` | `--update` | absent | missing flag — `pr.ts` auto-detects existing PRs but the spec also requires an explicit `--update` toggle |
| `gw release` | `--language <code>` | absent | missing flag — PRD line 73 promises EN/PT/ES/FR selection on the release command |
| `gw release` | `--no-publish` | absent | missing flag — only `--no-gh-release` exists |

The `--apply` rename is the most user-visible: the skills bundle's `commit.md` (`packages/skills/skills/commit.md:21`) embeds `--apply` as the apply flag, so the two install modes are at least self-consistent, but neither matches the published spec.

**Suggested fix**:
1. `packages/cli/src/commands/commit.ts:18-21` — add `--message <m>`, add `--base <branch>`, rename `--apply` to `--no-confirm` (or alias both for backward compat).
2. `packages/cli/src/commands/review.ts` — add `--json` and render `JSON.stringify(result, null, 2)` when present.
3. `packages/cli/src/commands/pr.ts` — add `--update` (force-update-existing semantics, error if no existing PR).
4. `packages/cli/src/commands/release.ts:13-15` — add `--language <code>` and `--no-publish`.
5. Update `packages/skills/skills/commit.md` and `packages/skills/scripts/commit.ts` to use the new flag name (or remain on `--apply` if it's chosen as the canonical name and the spec is amended).

Pick one canonical name across CLI + skills and document the decision (ADR or amend TechSpec).

## Triage

- Decision: `VALID`
- Root cause: `packages/cli/src/commands/commit.ts` registers only `--split`, `--push`, and `--apply`. The TechSpec line 192-195 prescribes `--message <m>`, `--base <branch>`, and `--no-confirm` for the `gw commit` command. Three of the six gaps documented in the issue live in this file; the remaining three (`review --json`, `pr --update`, `release --language`/`--no-publish`, plus the skills-bundle mirror) live in files outside this batch's `<batch_scope>` code files and must be remediated in their own issues.
- Fix approach (scoped to `packages/cli/src/commands/commit.ts`):
  1. Add `--message <m>` — when supplied, bypass the LLM entirely. Build a synthetic single-commit `CommitPlan` from the message (using the existing `applyCommitPlan` path so push handling, sensitive-file checks via core, and exit semantics stay consistent), and skip the spinner/analysis steps that only make sense for LLM-generated plans.
  2. Add `--base <branch>` — accept the flag for spec parity and thread it into the existing `prompt` field of `commit()` so the LLM has merge-target context. This is the cheapest wiring that keeps the flag non-decorative without touching core's `CommitOptions` (out of scope).
  3. Rename `--apply` to `--no-confirm` as the canonical spec flag, but retain `--apply` as a hidden backward-compat alias because `packages/skills/skills/commit.md:21` and `packages/skills/scripts/commit.ts` still emit `--apply` and those files are out of this batch's scope. The aliasing keeps both invocations working until the skills batch ships.
- Out of scope for this batch (tracked by the issue but bound to other files): `review.ts --json`, `pr.ts --update`, `release.ts --language`/`--no-publish`, and the skills bundle's `--apply` references. These must be addressed in batches that include those files.

## Resolution

Fix landed in `packages/cli/src/commands/commit.ts`:

- Registered `--message <m>` (skips LLM and commits the supplied message via a synthetic single-commit plan).
- Registered `--base <branch>` (threaded into the `commit()` prompt as merge-target context).
- Registered `--no-confirm` as the canonical confirmation-skip flag; kept `--apply` as a hidden alias so the unchanged skills bundle keeps working.
- The action handler now resolves `skipConfirm = opts.apply || opts.confirm === false` so either flag bypasses the prompt.
- `--message` is mutually exclusive with `--split` semantics (the supplied message becomes a single commit; split mode is skipped with a notice if the user combined them).

Tests in `packages/cli/__tests__/commands.test.ts` were extended to assert the new flag surface (`--message`, `--base`, `--no-confirm`) while preserving the existing `--apply` assertion to lock in the back-compat alias.

## Verification

- `npm run typecheck` (workspace root) — exit 0; all three `tsc --noEmit` invocations clean.
- `npm test` (workspace root) — exit 0; `19 test suites passed, 211 tests passed`.
- `npm run test --workspace=packages/cli` — exit 0; `4 suites passed, 35 tests passed` including the four new `makeCommitCommand` flag assertions.
