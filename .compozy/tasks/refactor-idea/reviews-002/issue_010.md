---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/core/src/commands/release.ts
line: 200
severity: medium
author: claude-code
provider_ref:
---

# Issue 010: applyRelease has no clean-tree preflight; mixes user edits into the release commit

## Review Comment

`packages/core/src/commands/release.ts:200-254` performs `git.add` and `git.commit` without first checking that the working tree is clean. The Phase 0 manual script `scripts/release.mjs:188-195` has the check explicitly:

```ts
if (typeof git.statusPorcelain === "function") {
  const dirty = git.statusPorcelain().trim();
  if (dirty) {
    throw new Error(
      `Working tree must be clean before releasing — commit or stash first.\n${dirty}`,
    );
  }
}
```

When the dogfooded `gw release` path runs through `applyRelease`, a user with unrelated staged edits (e.g., a half-finished fix they meant to commit separately) gets those edits silently swept into the `chore(release): vX.Y.Z` commit because step 5 in applyRelease just runs `git add package.json CHANGELOG.md` — any *already-staged* files outside that list remain staged and are picked up by the subsequent `git commit` (which defaults to staged contents). Worse, if `workspacePropagation` is enabled (see related issue) and the user happens to have unrelated edits inside `packages/`, those get added too via `git.add(cwd, ["packages"])`.

Suggested fix: at the top of `applyRelease`, call `git.status(cwd)` (already exported from `packages/core/src/infra/git.ts:73-75`). If it returns a non-empty string, throw a typed error:

```ts
const dirty = await git.status(cwd);
if (dirty.trim()) {
  throw Object.assign(
    new Error("Working tree must be clean before releasing"),
    { code: "WORKING_TREE_DIRTY", details: dirty },
  );
}
```

Map the `WORKING_TREE_DIRTY` code in `packages/cli/src/commands/release.ts` to a friendly `p.cancel("Working tree is dirty — commit or stash before releasing.")` cancel message (using the code-based pattern recommended in the CLI error-matching issue).

## Triage

- Decision: `INVALID`
- Root cause: Duplicate of `reviews-002/issue_006.md` (also flagged at
  `packages/core/src/commands/release.ts:200`), which raised the same concern
  ("`applyRelease` has no preflight; if the operator's tree is dirty the
  release commit absorbs unrelated work") and was already implemented and
  marked `resolved` in this same round. The `WORKING_TREE_DIRTY` preflight
  (and the companion `TAG_EXISTS` preflight) the suggested fix asks for is
  already in place in the current tree:
  - `packages/core/src/commands/release.ts:221-229` runs
    `git.status(cwd)` before any mutation and throws
    `Object.assign(new Error(...), { code: "WORKING_TREE_DIRTY" })` on a
    non-empty porcelain output, with the dirty listing appended to the
    message. This matches the suggested-fix snippet in this issue almost
    line-for-line (uses `git.status(cwd)` from `infra/git.ts`, the exact
    helper this issue recommends).
  - `packages/core/src/commands/release.ts:230-238` additionally guards
    against `TAG_EXISTS`.
  - The function-level JSDoc at `release.ts:200-214` documents both
    preflight failure modes and the post-preflight push/release recovery
    instructions, so the failure semantics are surfaced to callers.
  - `packages/core/__tests__/unit/commands/release.test.ts:302-324` already
    covers the dirty-tree branch end-to-end: it dirties a temp repo, asserts
    `applyRelease` rejects with `{ code: "WORKING_TREE_DIRTY" }`, and verifies
    `package.json`, `CHANGELOG.md`, and `.gitwise/release-*.md` were not
    written — exactly the regression this issue worries about. The
    `TAG_EXISTS` branch is covered at lines 326-355.
- Why this duplicate slipped through: round 002 appears to have collected two
  manual review notes about `applyRelease` preflight (`issue_006` and this
  one). `issue_006` was fixed first and the resolved fix already covers all
  of `issue_010`'s "Suggested fix" content for the in-scope file
  (`packages/core/src/commands/release.ts`). No additional change to that
  file is warranted.
- CLI mapping note (out of batch scope): The "Suggested fix" also asks for a
  friendly `p.cancel("Working tree is dirty …")` mapping in
  `packages/cli/src/commands/release.ts` based on the `WORKING_TREE_DIRTY`
  error code. That file is not listed in `<batch_scope>` (only
  `packages/core/src/commands/release.ts` is in scope), and the issue itself
  defers the pattern to a separate "CLI error-matching issue". So this
  remediation belongs to that other issue, not here.
- Fix: none required — the underlying defect is already remediated and
  tested in the current working tree. Closing as invalid (duplicate).
