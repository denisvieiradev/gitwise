---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/cli/src/commands/commit.ts
line: 97
severity: high
author: claude-code
provider_ref:
---

# Issue 005: CLI friendly-error branches match err.message substrings that never appear

## Review Comment

Core commands throw errors with structured `.code` properties (`Object.assign(new Error("..."), { code: "NOTHING_STAGED" | "EMPTY_DIFF" | "NO_COMMITS" | ... })`). The CLI tries to map them to friendly messages by `msg.includes("<CODE_STRING>")` — but the messages themselves do not contain the code token, so the friendly branches are dead code and every user sees the generic `Error: <message>` fallback. Affected sites:

- `packages/cli/src/commands/commit.ts:97-103` — checks `msg.includes("NOTHING_STAGED")` against thrown message `"No staged changes to commit"` (no match). Same for `SENSITIVE_FILE_STAGED`, which only matches because that core message happens to be prefixed with the literal string `"SENSITIVE_FILE_STAGED: ..."` (see `packages/core/src/commands/commit.ts:212`).
- `packages/cli/src/commands/pr.ts:51-56` — checks `msg.includes("EMPTY_DIFF")` but `packages/core/src/commands/pr.ts:91-94` throws `"No commits found on this branch relative to <base>"` with `.code = "NO_COMMITS"`. Wrong literal AND wrong code.
- `packages/cli/src/commands/review.ts:48-53` — checks `msg.includes("EMPTY_DIFF")` against thrown message `"No changes found between current branch and <base>"`. Correct code, no substring match.

Suggested fix: switch every guard from message-substring matching to code matching:

```ts
const code = (err as { code?: unknown })?.code;
if (code === "NOTHING_STAGED") { ... }
else if (code === "SENSITIVE_FILE_STAGED") { ... }
else { p.cancel(`Error: ${msg}`); }
```

Apply to the three files listed above. Update `packages/cli/__tests__/commands.test.ts` so it asserts the friendly cancel message fires for each known code, not just the generic fallback (the current dead-code path means the test, if it exists, is actually testing the generic branch).

## Triage

- Decision: `VALID`
- Root cause: `packages/cli/src/commands/commit.ts:97` branches on
  `msg.includes("NOTHING_STAGED")`, but the core throws
  `Error("No staged changes to commit")` with `code: "NOTHING_STAGED"` attached
  to the error object (see `packages/core/src/commands/commit.ts:198`). The
  message string never contains the token `NOTHING_STAGED`, so the friendly
  branch is dead and users hit the generic `Error: <message>` fallback. The
  `SENSITIVE_FILE_STAGED` branch only works by accident — the core error
  message happens to start with the literal token
  (`packages/core/src/commands/commit.ts:212`) — but it shares the same
  fragile shape and would silently break if the message text changed.
- Fix:
  - Replaced the substring matching in
    `packages/cli/src/commands/commit.ts` with a structured `.code` check.
  - Extracted the mapping into a pure helper `formatCommitErrorCancel(err)`
    exported from the same module so it can be unit-tested without booting
    Commander, mocking `@clack/prompts`, or stubbing `process.exit`.
  - Added unit tests in `packages/cli/__tests__/commands.test.ts` covering
    `NOTHING_STAGED`, `SENSITIVE_FILE_STAGED`, the generic fallback, a
    regression case proving substring matching no longer triggers the
    friendly branch, and non-`Error` throwables.
- Out of scope for this batch: the parallel bugs in
  `packages/cli/src/commands/pr.ts` and `packages/cli/src/commands/review.ts`
  noted in the original review comment are real but live in files not
  listed in `<batch_scope>`. Per the `cy-fix-reviews` rule "Keep code
  changes constrained to the files listed in `<batch_scope>`", they are
  not touched here and should be tracked as separate issues.
- Notes: friendly message strings preserved verbatim so the change is a pure
  bug fix with no UX drift.
- Pre-existing pipeline issue: `npm run lint` fails before any changes in this
  batch with `ESLint: The 'jiti' library is required for loading TypeScript
  configuration files. Make sure to install it.` Verified by stashing my
  changes and rerunning ESLint on `packages/cli/src/commands/commit.ts` —
  same failure. Unrelated to this fix; flagged here per cy-final-verify
  guidance. Typecheck, full test suite, and build all pass.
