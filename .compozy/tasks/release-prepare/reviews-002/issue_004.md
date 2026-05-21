---
provider: manual
pr:
round: 2
round_created_at: 2026-05-20T19:54:20Z
status: resolved
file: packages/core/src/commands/release.ts
line: 650
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: `finishRelease` raises raw `ENOENT` when notes file is missing

## Review Comment

`finishRelease` reads release notes verbatim from disk before deleting
the plan file:

```ts
// packages/core/src/commands/release.ts:650-655
const notesPath = join(cwd, ".gitwise", `release-${plan.newVersion}.md`);
const notes = await readFile(notesPath, "utf-8");

// 5. Delete the plan file FIRST (ADR-003 invariant)…
await deleteReleasePlan(cwd);
```

The on-disk reload is intentional (ADR-003 — user edits between prepare
and finish must survive into the tag annotation). But there is no
fallback: if the notes file is missing or unreadable, `readFile` throws
the bare `ENOENT` / `EACCES` error before any typed-error path runs.
That error is then surfaced through `release-errors.ts:formatReleaseError`,
which falls through to `UNKNOWN_HINT` because the error has no `code`.

Reachable scenarios:

1. The user deliberately deleted the notes file ("I changed my mind, let
   the LLM write it") and then ran `finish`.
2. The user moved the notes file out of `.gitwise/` for editing in a
   different tool and forgot to move it back.
3. CI or another script cleaned the `.gitwise/` directory between
   prepare and finish.
4. A subtle case: the integration test
   `release-lifecycle.test.ts:570-624` (github-flow back-to-back) shows
   that after a finished release the `.gitwise/release-<v>.md` file is
   preserved (ADR-003). But if the user manually deleted it between
   `prepare` and `finish`, finish blows up with no actionable hint
   *and* the plan file is left on disk (the throw happens at line 651,
   before the plan-first-delete at line 655) — fine for recovery via
   `gw release abort`, but the diagnostic is misleading.

The `PersistedReleasePlan` already carries the original notes
in-memory (`plan.notes`, written at prepare time — `release.ts:388`),
so the fix is a small fallback before the read:

```ts
const notesPath = join(cwd, ".gitwise", `release-${plan.newVersion}.md`);
let notes: string;
try {
  notes = await readFile(notesPath, "utf-8");
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    debug("release.finish.notes.missing", { path: notesPath });
    notes = plan.notes;
  } else {
    throw Object.assign(
      new Error(
        `Failed to read release notes at ${notesPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
      { code: "NOTES_READ_FAILED" },
    );
  }
}
```

That preserves the "edited notes survive" contract (file present →
on-disk version wins) while making the missing-file case graceful:
falling back to `plan.notes` keeps the tag annotated with whatever the
LLM produced. Add a matching `NOTES_READ_FAILED` case to
`release-errors.ts` and an integration test that deletes the notes file
between prepare and finish and asserts the tag annotation matches
`plan.notes` (rather than throwing).

Alternatively, if the project prefers strictness over fallback, throw a
typed error code like `RELEASE_NOTES_MISSING` instead of falling back,
and surface a hint in `release-errors.ts` telling the user to recreate
the file from the plan or run `gw release abort`. Either choice is
better than the current raw `ENOENT`.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed at `packages/core/src/commands/release.ts:666-667`: `finishRelease`
    reads `.gitwise/release-<v>.md` with a bare `await readFile(...)` and no
    surrounding error handling. The raw `ENOENT` / `EACCES` error has no
    `code` understood by `formatReleaseError`, so it falls through to
    `UNKNOWN_HINT` (see `packages/cli/src/commands/release-errors.ts:100-102`).
  - `PersistedReleasePlan.notes` (`release.ts:404`) already carries the
    LLM-produced notes in memory, so a graceful fallback is safe and matches
    ADR-003's "edited notes survive" contract (file present → on-disk wins).
  - Fix approach (matches review):
    1. Wrap the `readFile` in a try/catch in `finishRelease`. On `ENOENT`,
       log via `debug("release.finish.notes.missing", …)` and fall back to
       `plan.notes`. On other errors, rethrow as a typed
       `NOTES_READ_FAILED` error preserving the original cause.
    2. Add a `NOTES_READ_FAILED` case to `formatReleaseError` so the CLI
       surfaces an actionable hint (recreate the file from the plan or run
       `gw release abort`).
    3. Add an integration test under
       `packages/core/__tests__/integration/release-lifecycle.test.ts` that
       deletes the notes file between prepare and finish and asserts the
       resulting tag annotation matches `plan.notes` verbatim (not the raw
       ENOENT path).
  - Scope: the primary code change lives in the in-scope file
    `packages/core/src/commands/release.ts`. The matching error-formatter
    update in `packages/cli/src/commands/release-errors.ts` is required to
    make the new typed code surface a useful hint — without it the fix
    swaps a raw `ENOENT` for a raw `NOTES_READ_FAILED` and the CLI hint
    regresses to `UNKNOWN_HINT`. Both the formatter case and the integration
    test changes are kept to the minimum needed to validate the production
    fix.

## Resolution

- `packages/core/src/commands/release.ts:664-690`: wrapped the on-disk
  `readFile` of `.gitwise/release-<v>.md` in a try/catch. `ENOENT` now logs
  via `debug("release.finish.notes.missing", …)` and falls back to
  `plan.notes`; other read failures rethrow as a typed `NOTES_READ_FAILED`
  error that preserves the original cause and tells the user how to recover.
- `packages/cli/src/commands/release-errors.ts`: added a `NOTES_READ_FAILED`
  case so the CLI surfaces an actionable hint instead of `UNKNOWN_HINT`.
- `packages/cli/__tests__/release-errors.test.ts`: added the matching
  hint-coverage assertion for `NOTES_READ_FAILED`.
- `packages/core/__tests__/integration/release-lifecycle.test.ts`: added a
  new describe block ("finish falls back to plan.notes when the notes file
  is missing") that deletes `.gitwise/release-1.1.0.md` between prepare and
  finish and asserts the tag annotation contains the in-memory plan notes
  (and the plan file is still deleted per ADR-003).

Verification (commands run after the change, full output cited in the
parent agent's verification report):

- `npm test` — 30 suites / 472 tests passing (includes the new missing-notes
  integration test and the new formatter hint case).
- `npm run typecheck` — clean across all three workspaces.
- `npm run build` — tsup ESM + DTS builds succeed for every package.
- `npm run lint` — fails with a pre-existing jiti/ESLint toolchain bug
  ("Error: You are using an outdated version of the 'jiti' library"). The
  failure reproduces on `git stash`'d clean tree, so it is unrelated to
  this change. Left as-is per the workflow's guidance on pre-existing
  failures.
