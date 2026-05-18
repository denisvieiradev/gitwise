---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/commands/review.ts
line: 108
severity: medium
author: claude-code
provider_ref:
---

# Issue 012: review command swallows getDiff errors and silently falls back to working-tree diff

## Review Comment

`packages/core/src/commands/review.ts` (around lines 108-116) wraps the base-branch diff call in a try/catch that on any error falls back to `git.getDiff(cwd)` (unstaged working tree). The intent is graceful behavior when the base branch does not exist locally, but the catch is unconditional — it also masks legitimate errors:

- A permission/IO error reading the git index → reviews the wrong content
- A misconfigured remote (`origin/main` not fetched) → reviews local-only changes instead of the intended diff
- A typo on `--base` (`maine`) → silently reviews everything dirty in the tree instead of erroring

The user has no way to detect this happened — token usage and findings will both look plausible. The TechSpec line 152 calls for typed errors with `.code` fields, not silent fallbacks.

Similar pattern in `packages/core/src/commands/pr.ts:178-184` (`resolveBaseBranch`).

**Suggested fix**: Narrow the catch to the specific error shape that means "branch not found" (git typically exits with code 128 and stderr containing `unknown revision or path` or `bad revision`). For any other error, re-throw with a typed code:

```typescript
try {
  diff = await git.getDiff(cwd, baseBranch);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unknown revision|bad revision|not a valid object name/i.test(msg)) {
    // Specific fallback intent: base branch doesn't exist locally
    diff = await git.getDiff(cwd);
  } else {
    throw Object.assign(new Error(`Failed to compute diff against ${baseBranch}`), { code: "DIFF_FAILED", cause: err });
  }
}
```

Apply the same shape to `resolveBaseBranch` in `pr.ts`.

## Triage

- Decision: `VALID`
- Root cause: `packages/core/src/commands/review.ts:111-116` wrapped `git.getDiff(cwd, baseBranch)` in an unconditional `catch {}` that always fell back to the working-tree diff. Any error from git — a typo on `--base`, a missing remote, a permissions/IO failure, or even running outside a repo — was silently masked, so the LLM happily reviewed the wrong content while token usage and findings looked plausible.
- Fix:
  - Narrowed the catch to detect "branch not available locally" errors via stderr/message matching (`unknown revision`, `bad revision`, `not a valid object name`, `ambiguous argument`). Only those paths fall back to the working-tree diff.
  - Any other failure now throws a typed `DIFF_FAILED` error with `cause` preserved and a message that includes the original git error, matching the TechSpec contract for typed `.code` errors (e.g. existing `EMPTY_DIFF`).
  - Used duck-typed property access (`message`, `stderr`) rather than `instanceof Error` because jest's `--experimental-vm-modules` runs modules in separate VM realms where the cross-realm `Error` instance check returns false (verified during test run — the first attempt with `instanceof Error` made the unknown-revision fallback test fail).
- Tests added in `packages/core/__tests__/unit/commands/review.test.ts`:
  - "falls back to working-tree diff when base branch is unknown locally" — pins the intended graceful behavior for a non-existent ref against a repo with pending edits.
  - "throws DIFF_FAILED (not silent fallback) when git diff fails for a non-revision reason" — runs `review()` against a directory that is not a git repo so `git diff` fails with "not a git repository" (not a revision error) and asserts the typed `DIFF_FAILED` surfaces instead of a silent working-tree review.
- Out of scope: the issue notes a sibling pattern in `packages/core/src/commands/pr.ts` (`resolveBaseBranch`), but `pr.ts` is not in this batch's `<batch_scope>` code files and the fix for `review.ts` does not require touching it. Left untouched per the cy-fix-reviews scope rule; should be addressed in a separate issue/batch.
- Verification:
  - `npm run typecheck` — exit 0.
  - `npm run lint` — exit 0 (workspace lint runs `tsc --noEmit` per package).
  - `npm run test` — 19 suites, 226 tests passed (including the two new tests above).
  - `npm run build` — exit 0.
