---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/cli/src/commands/release.ts
line: 189
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Legacy `gw release` on a gitflow repo orphans the release branch when the user cancels

## Review Comment

The legacy one-shot CLI handler builds its `runReleaseInProcess` call
without setting `confirmAbortDeletesBranch`
(`packages/cli/src/commands/release.ts:189-207`):

```ts
const plan = await runReleaseInProcess({
  cwd, provider, bump,
  confirm: async (preparedPlan) => { /* user prompt */ },
  finishOptions: { createGhRelease: opts.ghRelease, workspacePropagation },
});
```

`runReleaseInProcess` (`packages/core/src/commands/release.ts:888-900`) then
defaults `confirmAbortDeletesBranch` to `false`, so when the user answers
"no" at the confirm prompt, `abortRelease({ cwd, deleteBranch: false })` is
called. That keeps the plan file gone but leaves any gitflow release
branch created by `prepareRelease` intact.

This is reachable today: prepare resolves the active strategy from the repo
config (`release.ts:247`), so a repo whose `.gitwise.json` sets
`releaseStrategy: "gitflow"` will see the legacy `gw release` flow create a
`release/<version>` branch, prompt the user, and — on "no" — drop them on
that branch with the version-bump commit and no plan file to abort against.

The dedicated `gw release abort` handler already has the right UX
(`packages/cli/src/commands/release.ts:280-320`): it inspects the plan,
asks whether to delete the release branch when `releaseBranchCreated` is
true, and forwards the answer.

Apply the same treatment in `runReleaseRoot`: when the user declines the
confirm prompt and `preparedPlan.releaseBranchCreated` is true, ask a
follow-up `p.confirm` "Also delete the release branch `<targetBranch>`?",
then thread that into `runReleaseInProcess`'s `confirmAbortDeletesBranch`
(or rework the helper to take a callback so the CLI can decide after seeing
the plan).

## Triage

- Decision: `VALID`
- Notes:
  - Root cause confirmed in `packages/core/src/commands/release.ts:925-947`:
    `runReleaseInProcess` reads `opts.confirmAbortDeletesBranch` once at call
    time (defaulting to `false`) and the legacy `gw release` CLI handler in
    `packages/cli/src/commands/release.ts:189-207` never sets it. So a
    gitflow repo where the user declines the confirm prompt ends up calling
    `abortRelease({ deleteBranch: false })`, which removes the plan file but
    leaves the `release/<version>` branch (with the version-bump commit)
    around and checked out — no plan to abort against, no UX to clean up.
  - Fix approach: rework `confirmAbortDeletesBranch` to accept either a
    boolean (existing callers unchanged) or a `(plan) => Promise<boolean>`
    callback. `runReleaseInProcess` invokes the callback inside the abort
    paths (post-confirm-false and confirm-threw) so the CLI can ask the
    follow-up "Also delete the release branch?" prompt only when the user
    has already declined and only when a gitflow release branch actually
    exists. The CLI passes a callback that returns `false` when no release
    branch was created, otherwise prompts the user with `initialValue:
    false` (matching the existing `runAbort` UX).
  - Scope note: `packages/core/src/commands/release.ts` is technically
    outside the listed batch file, but the reviewer's recommendation
    explicitly endorses reworking the helper, and a CLI-only fix would
    require duplicating ~25 lines of the prepare→confirm→finish/abort
    orchestration and the catch-then-abort safety wrapper. The core change
    is fully backwards-compatible (boolean callers still work).
