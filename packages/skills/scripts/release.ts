#!/usr/bin/env node
/**
 * gitwise-skills: release runner
 * Usage: node scripts/release.js [--bump major|minor|patch] [--apply] [--no-gh-release]
 */

import {
  getMergedConfig,
  getApiKey,
  createProvider,
  release,
  applyRelease,
} from "@denisvieiradev/gitwise-core";
import type { BumpType } from "@denisvieiradev/gitwise-core";

const args = process.argv.slice(2);

// Parse flags
const applyIdx = args.indexOf("--apply");
const apply = applyIdx !== -1;
if (apply) args.splice(applyIdx, 1);

const noGhIdx = args.indexOf("--no-gh-release");
const noGhRelease = noGhIdx !== -1;
if (noGhRelease) args.splice(noGhIdx, 1);

const bumpIdx = args.indexOf("--bump");
let forceBump: BumpType | undefined;
if (bumpIdx !== -1) {
  const val = args[bumpIdx + 1];
  if (val === "major" || val === "minor" || val === "patch") forceBump = val;
  args.splice(bumpIdx, 2);
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

  const plan = await release({ bump: forceBump, provider, cwd });

  // Emit plan
  process.stdout.write(`## Release Plan\n\n`);
  process.stdout.write(`**Version:** ${plan.newVersion} (${plan.suggestedBump})\n\n`);
  process.stdout.write(`### Changelog\n\n${plan.changelog}\n\n`);
  process.stdout.write(`### Release Notes\n\n${plan.notes}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${plan.tokens.input} in / ${plan.tokens.output} out\n\n`
  );

  if (!apply) {
    process.stdout.write("_Run with `--apply` to tag, update CHANGELOG.md, and create a release._\n");
    return;
  }

  await applyRelease(plan, { cwd, createGhRelease: !noGhRelease });

  process.stdout.write(`**Done.** Released ${plan.newVersion}.\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
