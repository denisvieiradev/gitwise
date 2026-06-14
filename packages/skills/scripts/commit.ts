#!/usr/bin/env node
/**
 * gitwise-skills: commit runner
 * Usage: node scripts/commit.js [intent] [--split auto|never|always] [--apply] [--push]
 */

import {
  getMergedConfig,
  getApiKey,
  createProvider,
  commit,
  applyCommitPlan,
  git,
} from "@denisvieiradev/gitwise-core";

const args = process.argv.slice(2);

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

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

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
    `**Tokens used:** ${plan.tokens.input} in / ${plan.tokens.output} out\n\n`
  );

  if (!apply) {
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
