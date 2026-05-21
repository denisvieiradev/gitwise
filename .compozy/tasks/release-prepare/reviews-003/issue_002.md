---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/core/src/commands/release.ts
line: 744
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: `finishRelease` silently bundles unrelated `.gitignore` edits into the release commit

## Review Comment

`finishRelease` step 2c (lines 617–622) unconditionally whitelists `.gitignore` from the working-tree-dirty check:

```ts
const expectedDirtyPaths = new Set<string>([
  ".gitwise/",
  ".gitwise/release-plan.json",
  `.gitwise/release-${plan.newVersion}.md`,
  ".gitignore",
]);
```

…and step 6 (lines 744–746) then stages whatever `.gitignore` contains:

```ts
if (await fileExists(join(cwd, ".gitignore"))) {
  stagePaths.push(".gitignore");
}
```

This is correct for the *intended* case (prepare's `ensureGitignored` left `.gitignore` dirty and finish needs to fold that change in). But it also silently bundles **any** other change the user made to `.gitignore` between `prepare` and `finish` — adding a build artifact pattern, ignoring a local config file, etc. — into the release commit (`chore(release): vX.Y.Z`), where it is invisible to anyone reviewing the diff with "should be a one-line release commit" in mind.

The risk is mild on small teams but real: a user editing `.gitignore` to silence noise from a local tool can find their personal hygiene change merged into `main` and `develop` under a release tag, with no log of the intent.

**Suggested fix**: stage exactly the line `prepareRelease` added. Two concrete shapes:

1. Snapshot `.gitignore` content before `ensureGitignored` runs and persist it on the plan; in `finish`, re-apply only the lines `prepare` would add (diff the snapshot vs current, take prepare's additions only, write back to `.gitignore`, then stage). Keeps unrelated user edits out of the release commit.
2. Tighten the allow-list to only accept `.gitignore` when its content equals "previous content + the exact lines prepare appended" — bail with `WORKING_TREE_DIRTY` otherwise. Easier to implement, surfaces the surprise to the user instead of silently swallowing it.

Either approach also avoids the related abort recovery problem in issue_001 if the snapshot is persisted on the plan.

## Triage

- Decision: `VALID`
- Root cause: `finishRelease` step 2c (release.ts:629-634) unconditionally
  whitelists `.gitignore` from the working-tree-dirty filter and step 6
  (release.ts:756-758) unconditionally stages whatever the current
  `.gitignore` happens to contain. The intent is to fold prepare's
  `ensureGitignored` mutation into the release commit on github-flow (where
  prepare cannot commit), but the implementation tolerates **any** dirty
  `.gitignore` — including extra user edits made between `prepare` and
  `finish` (e.g. adding `build/` to silence a local tool). Those edits ride
  silently into the `chore(release): vX.Y.Z` commit and onto `main` (and on
  gitflow, `develop`).
- Fix approach: chose the reviewer's Option 2 (tighten the allow-list and
  surface mismatches as `WORKING_TREE_DIRTY`). Concretely: in finish's
  step 2c, compute the exact `.gitignore` contents that prepare's two
  `ensureGitignored` calls would produce from HEAD's `.gitignore`, and only
  add `.gitignore` to `expectedDirtyPaths` when the working-tree file
  matches that prediction byte-for-byte. Mismatches now hit
  `WORKING_TREE_DIRTY` with the dirty `.gitignore` listed in the message,
  so the user sees the surprise instead of having it merged silently. The
  notes-file glob and plan path are still tolerated independently.
  Rejected Option 1 (snapshot pre-prepare content on the plan and restore
  in finish) — it widens the persisted-plan schema for a property that can
  already be reconstructed from `git show HEAD:.gitignore`.
- Files touched outside scope (documented per workflow):
  - `packages/core/src/commands/release-plan.ts` — extracted the pure
    string transform behind `ensureGitignored` as exported
    `applyGitignoreEntry(content, entry)` so prepare's writer and finish's
    validator share one source of truth. `ensureGitignored` now calls it.
    Touching this file is necessary to avoid duplicating coverage-detection
    logic that must stay byte-equivalent with prepare's output.
  - `packages/core/src/infra/git.ts` — added `showFileAtHead(cwd, path)`
    helper (`git show HEAD:<path>` → string | null) so the validator can
    read the pre-prepare `.gitignore` without inlining `execFile` in the
    command layer.
- Tests: added an integration case in
  `packages/core/__tests__/integration/release-lifecycle.test.ts` that runs
  the exact regression path — github-flow prepare, user appends an extra
  ignore line to `.gitignore`, finish — and asserts `WORKING_TREE_DIRTY`
  with the dirty `.gitignore` reported. Existing github-flow happy-path
  tests (lines 630-683) continue to cover the case where `.gitignore`
  matches prepare's output exactly and finish folds it into the release
  commit.
- Verification (cy-final-verify, fresh run after all edits):
  - `npm test` (gitwise workspace root) — Test Suites: 30 passed, Tests:
    476 passed (was 474 before; +2 from the two new github-flow finish
    integration cases). Wall time ~29s.
  - `npm run typecheck` (all three workspaces) — clean.
  - `npm run lint` — pre-existing environment failure (`jiti` library
    outdated under the deno-cached `eslint@9.39.4`); independent of this
    change, also documented in issue_001's verification block. My edits
    touched only TS source and a TS test file and added no new
    dependencies or eslint config.
