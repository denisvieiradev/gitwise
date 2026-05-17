# `devflow-cli` deprecation banner

This document captures the **final** notice that the last `devflow-cli` release prints whenever it is invoked. The goal is to give existing users a single, copy-pasteable pointer to `gitwise` and a one-paragraph explanation of what changed, so the rename does not feel like an abandonment.

The text below is the canonical source — copy it verbatim into the `devflow-cli` repo when cutting that final release.

## Banner text (verbatim)

```
devflow-cli is deprecated and will receive no further updates.

It has been refactored and renamed to gitwise — a focused AI git toolbelt
(commit / review / pr / release). The pipeline parts (prd, techspec, tasks,
run-tasks, test, done, status, init) are intentionally not part of gitwise:
the new product is a toolbelt, not a workflow.

Install the replacement:

    npm uninstall -g @denisvieiradev/devflow-cli
    npm install  -g @denisvieiradev/gitwise

Then use gw commit / gw review / gw pr / gw release.

Migration guide: https://github.com/denisvieiradev/gitwise/blob/main/docs/migrating-from-devflow.md
```

The banner is intentionally **one paragraph + one snippet + one link**. No emoji, no marketing copy, no chalk colors — readable in any terminal (including `NO_COLOR` setups) and quotable in changelogs.

## Where to put it in `devflow-cli`

The final release of `devflow-cli` should print this banner **on every invocation**, before any command output. Two placement options, in priority order:

### 1. Top-of-CLI guard (preferred)

Add a single `console.warn` to `src/cli/index.ts` (or the equivalent entry point) before commander parses argv. Write to **stderr** so piping `devflow` into another tool does not pollute stdout, and apply a one-time guard so subprocess re-entry does not double-print:

```ts
// devflow-cli/src/cli/index.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const BANNER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../DEPRECATION.txt");

if (!process.env.DEVFLOW_DEPRECATION_NOTICE_SHOWN) {
  process.stderr.write(readFileSync(BANNER_PATH, "utf8"));
  process.stderr.write("\n");
  process.env.DEVFLOW_DEPRECATION_NOTICE_SHOWN = "1";
}
```

Ship `DEPRECATION.txt` in the package (`files` field in `package.json`) with the banner content above. The env-var guard prevents re-entrant CLI subprocesses (e.g. the Claude Code provider spawning `claude`) from re-printing the banner.

### 2. `postinstall` hook (fallback / supplement)

Add a `postinstall` script that prints the same banner once at install time. Useful for users who install the package programmatically (e.g. CI) and never invoke the binary directly:

```jsonc
// devflow-cli/package.json
{
  "scripts": {
    "postinstall": "node -e \"console.warn(require('fs').readFileSync('DEPRECATION.txt','utf8'))\""
  }
}
```

Keep the per-invocation top-of-CLI banner regardless — `postinstall` runs once; the CLI guard reminds users every time they reach for `devflow`.

## What NOT to do

- **Do not** silently alias `devflow` to `gw`. The rename is meant to be visible; aliasing hides the deprecation and risks shipping behavior changes (gitwise has dropped commands) under the old name.
- **Do not** print the banner from inside individual subcommands. Centralize it at the entry point so the message is impossible to miss.
- **Do not** ship a banner that requires color or interactive output. Many users run `devflow` non-interactively or with `NO_COLOR=1`.
- **Do not** include a Slack / Discord / email link in the banner. The README link in the new repo is the single authoritative source of truth for migration help.

## After the final release

1. Mark `@denisvieiradev/devflow-cli` as deprecated on npm:

    ```bash
    npm deprecate @denisvieiradev/devflow-cli "Renamed to @denisvieiradev/gitwise. See: https://github.com/denisvieiradev/gitwise/blob/main/docs/migrating-from-devflow.md"
    ```

2. Archive the `github.com/denisvieiradev/devflow-cli` repository through the repository settings.

3. Add a pinned issue on the archived repo pointing to the gitwise migration guide for users who land on the GitHub page after the npm deprecation notice.

The banner content here, the npm deprecation message, and the pinned issue link should all reference the same URL: `https://github.com/denisvieiradev/gitwise/blob/main/docs/migrating-from-devflow.md`.

## References

- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](../.compozy/tasks/refactor-idea/adrs/adr-001.md) — Implementation Notes section requires this banner.
- [PRD: gitwise — AI Git Toolbelt](../.compozy/tasks/refactor-idea/_prd.md) — Risks and Mitigations note about devflow-cli users.
- [`docs/migrating-from-devflow.md`](migrating-from-devflow.md) — the migration guide the banner links to.
