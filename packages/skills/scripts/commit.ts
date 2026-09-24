#!/usr/bin/env node
/**
 * gitwise-skills: commit runner
 * Usage: node scripts/commit.js [intent] [--split auto|never|always] [--apply] [--push]
 */

import { isInvokedDirectly } from "./invoked-directly.js";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  buildProviderConfig,
  commit,
  applyCommitPlan,
  git,
  formatTokens,
} from "@denisvieiradev/gitwise-core";

export async function runCommitSkill(
  rawArgs: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  const args = [...rawArgs];

  // Parse flags
  const applyIdx = args.indexOf("--apply");
  const apply = applyIdx !== -1;
  if (apply) args.splice(applyIdx, 1);

  const pushIdx = args.indexOf("--push");
  const push = pushIdx !== -1;
  if (push) args.splice(pushIdx, 1);

  const splitIdx = args.indexOf("--split");
  let splitMode: "auto" | "never" | "always" = "auto";
  if (splitIdx !== -1) {
    const val = args[splitIdx + 1];
    if (val === "never" || val === "always" || val === "auto") splitMode = val;
    args.splice(splitIdx, 2);
  }

  // Remaining positional: intent string
  const intent = args.join(" ").trim();

  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider(buildProviderConfig(config, apiKey));

  const result = await commit({ prompt: intent, split: splitMode, provider, cwd });
  if (result.kind === "alternatives") throw new Error("Unexpected alternatives result from commit()");
  const plan = result;

  // Emit markdown plan
  if (plan.kind === "single") {
    const c = plan.commits[0];
    if (!c) throw new Error("commit() returned a single plan with no commits");
    process.stdout.write(`## Commit Plan\n\n**Message:** ${c.message}\n\n`);
    if (c.files && c.files.length > 0) {
      process.stdout.write(`**Files:** ${c.files.join(", ")}\n\n`);
    }
  } else {
    process.stdout.write(`## Commit Plan (split into ${plan.commits.length} commits)\n\n`);
    for (let i = 0; i < plan.commits.length; i++) {
      const c = plan.commits[i];
      if (!c) continue;
      process.stdout.write(`### Commit ${i + 1}\n**Message:** ${c.message}\n`);
      if (c.files && c.files.length > 0) {
        process.stdout.write(`**Files:** ${c.files.join(", ")}\n`);
      }
      process.stdout.write("\n");
    }
  }

  process.stdout.write(
    `**Tokens used:** ${formatTokens(plan.tokens, plan.tokensAvailable)}\n\n`
  );

  if (!apply && !push) {
    process.stdout.write(
      "_Run with `--apply` to stage files and commit._\n"
    );
    return;
  }

  await applyCommitPlan(plan, { cwd });

  if (push) {
    await git.push(cwd, "origin", "HEAD");
  }

  process.stdout.write("**Done.** Commits applied.\n");
}

// Only execute the runner when this module is invoked directly (i.e. `node
// dist/scripts/commit.js`). Skipping the auto-run when the file is imported
// keeps `runCommitSkill` testable without triggering side effects.
const invokedDirectly = isInvokedDirectly(import.meta.url);

if (invokedDirectly) {
  runCommitSkill(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  });
}
