---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/commands/pr.ts
line: 147
severity: high
author: claude-code
provider_ref:
---

# Issue 008: applyPr returns url: "" for gh-missing and PR-update paths

## Review Comment

`ApplyPrResult` is declared as `{ url: string }` (non-optional) in `packages/core/src/commands/pr.ts:37-39`, but `applyPr` returns `{ url: "" }` in two paths:

- Line 147: `gh` CLI is not installed — the function prints title/body to stdout and returns an empty URL.
- Line 152: `draft.existingPrNumber !== undefined` — the function calls `updatePR` (which doesn't return a URL) and returns `{ url: "" }`.

The CLI wrapper at `packages/cli/src/commands/pr.ts:94` defensively checks `if (result.url)` before printing, so the user-facing flow doesn't crash — but it does silently produce "PR updated successfully" with no link, and downstream programmatic callers receive an empty string they have to special-case. The type signature lies about what the function returns.

**Suggested fix**: Either (a) change the return type to `{ url: string | null }` and update callers, or (b) actually look up the URL in both paths:
- For the gh-missing branch, do not return at all — throw a `GitwiseError` with code `GH_UNAVAILABLE` so the CLI knows to render the fallback message but core stays honest.
- For the update branch, fetch the PR URL after `updatePR` via `gh pr view <number> --json url -q .url` (or modify `updatePR` to return it).

Adding a `gh pr view` round-trip costs one extra subprocess call but lets the CLI print a real link after `--update`, which is the common case.

## Triage

- Decision: `VALID`
- Root cause: `ApplyPrResult.url` is typed as non-optional `string`, but `applyPr` returns `{ url: "" }` in two paths (gh-missing fallback at line 147 and the existing-PR update path at line 152 because `updatePR` returns `void`). The type signature does not reflect the runtime contract, forcing callers to special-case `""`.
- Fix approach (option **b** from the suggestion):
  - `infra/github.ts`: add `getPrUrl(prNumber, cwd)` (calls `gh pr view <n> --json url -q .url`) and change `updatePR` to return `PRResult` by composing `gh pr edit` + `getPrUrl`. One extra subprocess call per update, gains a real URL after `--update`.
  - `commands/pr.ts`:
    - gh-missing branch: throw `Object.assign(new Error("gh CLI is not installed"), { code: "GH_UNAVAILABLE", draft })` so core stays honest and the CLI can render the fallback message itself (with title/body) from the attached draft. Remove the in-core `console.log` to keep core IO-free.
    - update branch: forward the URL returned by `updatePR`.
  - CLI `commands/pr.ts`: catch the `GH_UNAVAILABLE` error code, render the title/body fallback to stdout, and warn that the URL cannot be retrieved without `gh`. Remove the now-redundant defensive `if (result.url)` branch.
- Constrained to: `packages/core/src/commands/pr.ts`, `packages/core/src/infra/github.ts` (helper + return type), `packages/cli/src/commands/pr.ts` (error handling), and the related tests. The `infra/github.ts` and CLI edits are out of the listed batch scope file but unavoidable for an honest fix that still produces a fallback message — limited to the minimum needed for this issue.
- Notes:
  - `infra/github.ts`: `updatePR` now returns `PRResult`; new `getPrUrl(prNumber, cwd)` exported for callers/tests.
  - `commands/pr.ts`: gh-missing path throws `Object.assign(new Error(...), { code: "GH_UNAVAILABLE", draft })`; update path forwards the URL from `updatePR`. `console.log` removed from core.
  - `cli/commands/pr.ts`: catches `code === "GH_UNAVAILABLE"`, prints the title/body fallback + a "install gh CLI" outro, and unconditionally prints the green `PR: <url>` line on success (the defensive `if (result.url)` branch is gone).
  - Tests: `pr.test.ts` now mocks `infra/github.js` via `jest.unstable_mockModule` to assert (a) GH_UNAVAILABLE is thrown with the draft attached and (b) the update path forwards the URL returned by `updatePR`. Kept a defensive "honest contract" test that asserts `applyPr` either throws or returns a non-empty URL — never `{ url: "" }`.
- Verification (full pipeline, just run):
  - `tsc --noEmit` across all 3 workspaces → exit 0.
  - `jest --passWithNoTests` across all 3 workspaces → 19 suites / 224 tests passing.
