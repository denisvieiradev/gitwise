---
provider: manual
pr:
round: 2
round_created_at: 2026-05-20T19:54:20Z
status: resolved
file: packages/skills/scripts/release.ts
line: 122
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Skill legacy one-shot never propagates workspace versions

## Review Comment

The skill runner's legacy one-shot path (`runLegacy`,
`packages/skills/scripts/release.ts:101-124`) calls `applyRelease` without
threading `workspacePropagation`:

```ts
await applyRelease(plan, { cwd, createGhRelease: !parsed.noGhRelease });
```

`applyRelease` defaults `workspacePropagation` to `false`
(`packages/core/src/commands/release.ts:431`), so a workspace repo using
the Claude Code skill's legacy invocation (`node release.js --apply`) ships
a release commit that bumps **only** the root `package.json`. Every
workspace package's `package.json` (and any sibling `plugin.json`) keeps
the previous version — exactly the drift `propagateVersionToWorkspaces`
exists to prevent.

The CLI path is correct: `runReleaseRoot`
(`packages/cli/src/commands/release.ts:185-186`) calls
`detectWorkspaceRoot(cwd)` and forwards the result through
`runReleaseInProcess.finishOptions.workspacePropagation`. The skill
runner's `runPrepare` / `runFinish` also handle this correctly — only
`runLegacy` is missing the wiring.

Two consequences:

1. Any monorepo user who invokes the release skill the "easy" way
   (legacy one-shot, no `prepare`/`finish`) silently publishes mismatched
   versions across workspace packages.
2. `parseReleaseArgs` already accepts `--no-workspace-propagation`
   (`packages/skills/scripts/release-args.ts:90-92`) and the parsed flag
   is dropped on the floor in `runLegacy`. The flag is documented as a
   `finish`-only flag in `packages/skills/skills/release.md:40` but the
   argv parser silently allows it on every phase, deepening the
   inconsistency.

Suggested fix: mirror what `runFinish` already does. Either:

```ts
async function runLegacy(parsed: ParsedReleaseArgs, cwd: string): Promise<void> {
  const provider = await loadProvider(cwd);
  const plan = await release({ bump: parsed.bump, provider, cwd });
  // … print plan …
  if (!parsed.apply) return;

  const workspacePropagation = parsed.noWorkspacePropagation
    ? false
    : await detectWorkspaceRoot(cwd);
  await applyRelease(plan, {
    cwd,
    createGhRelease: !parsed.noGhRelease,
    workspacePropagation,
  });
}
```

Add a unit/integration test that runs the legacy phase against a fixture
workspace repo and asserts that every workspace `package.json` lands at
the new version in the release commit. Also update `release.md` so the
`--no-workspace-propagation` flag is listed for the legacy phase too.

## Triage

- Decision: `VALID`
- Root cause: `runLegacy` in `packages/skills/scripts/release.ts` calls
  `applyRelease(plan, { cwd, createGhRelease: !parsed.noGhRelease })` without
  forwarding `workspacePropagation`. `applyRelease` defaults that option to
  `false` (`packages/core/src/commands/release.ts:431`), so the legacy
  one-shot path on a workspace repo bumps only the root `package.json` and
  silently ships a release commit with mismatched workspace package versions.
  `runPrepare` / `runFinish` already detect and forward the flag via
  `detectWorkspaceRoot`; only the legacy path is missing the wiring. The
  parsed `--no-workspace-propagation` flag is also accepted by
  `parseReleaseArgs` for every phase but currently dropped on the floor in
  `runLegacy`, and `release.md` documents the flag as `finish`-only.
- Fix approach: mirror `runFinish`'s workspace detection inside `runLegacy`
  (auto-detect when `--no-workspace-propagation` is not set), forward
  `workspacePropagation` to `applyRelease`, and update `release.md` so the
  flag is listed for the legacy one-shot as well. Add an integration test
  for the built `dist/scripts/release.js --apply` path that runs against a
  fixture workspace repo and asserts every `packages/*/package.json` lands
  at the new version in the release commit.
