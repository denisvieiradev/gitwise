#!/usr/bin/env node
/**
 * gitwise-skills: pr runner
 * Usage: node scripts/pr.js [--base <branch>] [--apply] [--prompt "<text>"]
 */

import {
  getMergedConfig,
  getApiKey,
  createProvider,
  pr,
  applyPr,
} from "@denisvieiradev/gitwise-core";

const args = process.argv.slice(2);

// Parse flags
const applyIdx = args.indexOf("--apply");
const apply = applyIdx !== -1;
if (apply) args.splice(applyIdx, 1);

const baseIdx = args.indexOf("--base");
let base: string | undefined;
if (baseIdx !== -1) {
  base = args[baseIdx + 1];
  args.splice(baseIdx, 2);
}

const promptIdx = args.indexOf("--prompt");
let extraPrompt: string | undefined;
if (promptIdx !== -1) {
  extraPrompt = args[promptIdx + 1];
  args.splice(promptIdx, 2);
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

  const draft = await pr({ baseBranch: base, prompt: extraPrompt, provider, cwd });

  // Emit plan
  process.stdout.write(`## PR Draft\n\n`);
  process.stdout.write(`**Title:** ${draft.title}\n\n`);
  process.stdout.write(`**Body:**\n\n${draft.body}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${draft.tokens.input} in / ${draft.tokens.output} out\n\n`
  );

  if (!apply) {
    process.stdout.write("_Run with `--apply` to create or update the GitHub PR._\n");
    return;
  }

  const result = await applyPr(draft, { cwd });

  if (result.url) {
    process.stdout.write(`**PR:** ${result.url}\n`);
  } else {
    process.stdout.write("**Done.** PR applied (no URL returned — gh may be unavailable).\n");
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
