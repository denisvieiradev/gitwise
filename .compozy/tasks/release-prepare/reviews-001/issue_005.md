---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/core/src/commands/release.ts
line: 906
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Workspace propagation hardcodes `packages/` and stages too aggressively

## Review Comment

Two related concerns in the workspace-propagation path:

1. **Disagreement with workspace detection.** `detectWorkspaceRoot`
   (`packages/cli/src/commands/release.ts:27-53` and a duplicate in
   `packages/skills/scripts/release.ts:38-63`) considers a repo to be a
   workspace root when `package.json.workspaces` is a non-empty array *or*
   when there is a `packages/*/package.json` on disk. Once detection
   succeeds it enables propagation, but `propagateVersionToWorkspaces`
   (`packages/core/src/commands/release.ts:906-933`) only ever walks
   `<cwd>/packages/*`. For a repo whose workspaces array is
   `["apps/*", "libs/*"]` and contains no `packages/` directory,
   `detectWorkspaceRoot` could still flip true (via the `package.json`
   probe), but the propagation step then walks a directory that doesn't
   exist and silently does nothing — the version stays stale in every
   workspace package. Either read `package.json.workspaces` directly and
   expand the globs (e.g. with `glob` or `fast-glob` against
   `${pattern}/package.json`), or narrow `detectWorkspaceRoot` to only
   return true when a `packages/` directory exists, and document the
   constraint explicitly.

2. **Overly broad staging in github-flow finish.** Right after
   propagation, the github-flow finish path does
   (`release.ts:681-687`):

   ```ts
   if (workspacePropagation) {
     try { await git.add(cwd, ["packages"]); }
     catch { /* No packages/ directory */ }
   }
   ```

   `git add packages` stages every modification under `packages/` — not
   just the manifests `propagateVersionToWorkspaces` actually touched. Any
   untracked, non-gitignored file the user happened to leave under
   `packages/` (build artefacts, generated docs, half-finished work) gets
   pulled into the release commit. The earlier dirty check
   (`release.ts:583-604`) doesn't catch this because the work was already
   present when finish started — the dirty filter only allow-lists
   `.gitwise/*` and `.gitignore`, and a clean tree at finish-start is
   precisely the precondition for `git add packages` to act as expected,
   *except* the propagation step itself can interact with
   gitignored-but-modified manifests.

   Stage the manifests explicitly instead — `propagateVersionToWorkspaces`
   already knows the exact list of files it modified, so either return
   that list to the caller or rebuild it: `packages/*/package.json` and
   `packages/*/plugin.json` (filtered by `fileExists`).

Same hardcoded `packages/` assumption exists in the CLI/skill detectors,
so a single source of truth for "workspaces in this repo" would help.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed both bugs by reading `packages/core/src/commands/release.ts`
    (the `propagateVersionToWorkspaces` helper around what is now line ~972) and
    `packages/cli/src/commands/release.ts` (`detectWorkspaceRoot`).
    `detectWorkspaceRoot` returns `true` either when `package.json.workspaces`
    is a non-empty array OR when a `packages/*/package.json` exists; the
    propagation step inside core only ever walks `<cwd>/packages/*`, so the two
    decisions can disagree (workspaces `["apps/*", "libs/*"]` with no
    `packages/`).
  - Also confirmed the staging concern at `finishRelease` (current lines
    704-710): `git.add(cwd, ["packages"])` stages every change under
    `packages/`, not just the manifests propagation wrote. Even though the
    dirty-tree precondition normally excludes unrelated edits, this is a
    needless future footgun: propagation already knows exactly which files it
    touched, so the safer contract is to return that list to the caller and
    stage it explicitly.
  - Fix approach (scope: `packages/core/src/commands/release.ts` only):
    1. Make `propagateVersionToWorkspaces` read `package.json.workspaces`
       (array or yarn-style `{ packages: [...] }`) and expand the glob
       patterns with a tiny in-repo segment-walker (no new dependency).
       Fall back to `["packages/*"]` when the field is missing or empty so
       existing repos that only had a `packages/` directory keep working.
    2. Return the list of `package.json` / `plugin.json` paths actually
       modified (cwd-relative) instead of `void`.
    3. In `finishRelease`'s github-flow branch, capture the returned paths
       and append them to the single `git.add(...)` stage list — drop the
       broad `git.add(cwd, ["packages"])` + try/catch.
    4. Add regression tests:
       - `workspaces: ["apps/*"]` (no `packages/` directory) propagates to
         every `apps/*/package.json`.
       - Yarn-style `workspaces: { packages: ["libs/*"] }` propagates to
         every `libs/*/package.json`.
       - With workspace propagation on, an untracked / gitignored throwaway
         file under a workspace package does NOT land in the release commit
         (only the manifests propagation touched do).
  - Out-of-scope per `<batch_scope>`: the duplicated `detectWorkspaceRoot`
    helpers in `packages/cli/src/commands/release.ts` and
    `packages/skills/scripts/release.ts`. Centralising those is a separate
    refactor; this fix makes the core path correct regardless of which
    detector enabled the flag.
