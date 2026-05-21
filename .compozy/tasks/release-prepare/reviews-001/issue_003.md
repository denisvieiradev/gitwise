---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/core/src/commands/release.ts
line: 680
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Github-flow `finishRelease` never commits the `.gitignore` change made by `prepareRelease`

## Review Comment

On github-flow, `prepareRelease` calls `ensureGitignored` (step 10,
`release.ts:358`) which modifies `.gitignore` to cover
`.gitwise/release-plan.json` — and unlike gitflow there is no commit at the
end of prepare, so the `.gitignore` change sits in the working tree.

`finishRelease` then runs the github-flow branch (`release.ts:641-688`) and
stages only `package.json` + `CHANGELOG.md` (plus optionally `packages/`):

```ts
await git.add(cwd, ["package.json", "CHANGELOG.md"]);
if (workspacePropagation) {
  try {
    await git.add(cwd, ["packages"]);
  } catch { /* … */ }
}
await git.commit(cwd, `chore(release): v${plan.newVersion}`);
```

`.gitignore` is excluded, so after `finishRelease` returns successfully the
working tree is still dirty with ` M .gitignore`. The next `gw release
prepare` then trips its own `WORKING_TREE_DIRTY` precondition
(`release.ts:257`) until the user notices and commits the `.gitignore` by
hand. This compounds with issue_001 — between the leftover notes file and
the dangling `.gitignore` change, the second prepare always fails.

The gitflow path doesn't have this bug because `prepareRelease` already
folds `.gitignore` into the version-bump commit (`release.ts:361-366`). The
github-flow path needs the equivalent: when `await fileExists(join(cwd,
".gitignore"))` and the file is dirty, include it in the `git add` list
before the release commit.

The `finishRelease` `expectedDirtyPaths` filter masks this issue inside its
own preflight, but that filter exists for the first prepare/finish pair —
it cannot hide a `.gitignore` mutation that has now become permanent
between releases.

## Triage

- Decision: `VALID`
- Root cause: `prepareRelease` calls `ensureGitignored` (release.ts:366-367)
  which mutates `.gitignore` on every strategy. On gitflow the version-bump
  commit already includes `.gitignore` (release.ts:370-375). On github-flow,
  prepare has nothing else to commit and `finishRelease`'s github-flow branch
  (release.ts:694) only staged `package.json` + `CHANGELOG.md` (plus
  optionally `packages/`), so the `.gitignore` modification was left dirty in
  the working tree forever. `finishRelease`'s clean-tree allow-list filters
  `.gitignore` for its own preflight, but cannot suppress that dirtiness for
  the next prepare, which then trips `WORKING_TREE_DIRTY` until the user
  commits `.gitignore` manually.
- Fix approach: In `finishRelease`'s github-flow branch (the
  `!plan.releaseBranchCreated` block), include `.gitignore` in the staged
  paths when it exists on disk, mirroring the pattern `prepareRelease` already
  uses for gitflow (release.ts:370-374). `ensureGitignored` always writes the
  file when an entry is missing, so the existence check is conservative
  rather than load-bearing — `git add` on a clean tracked file is a no-op, so
  this is safe when prepare had nothing to append.
- Verification: updated the back-to-back github-flow integration test in
  `packages/core/__tests__/integration/release-lifecycle.test.ts` to remove
  the manual `git add .gitignore` workaround and assert that the release
  commit's tree contains `.gitignore` and that the working tree is clean
  after `finishRelease` returns.
