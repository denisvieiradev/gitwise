#!/usr/bin/env node
/**
 * gitwise-skills: pr runner
 * Usage: node scripts/pr.js [--base <branch>] [--apply] [--prompt "<text>"]
 */

import { fileURLToPath } from "node:url";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  buildProviderConfig,
  pr,
  applyPr,
  formatTokens,
} from "@denisvieiradev/gitwise-core";

export async function runPrSkill(
  rawArgs: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  const args = [...rawArgs];

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

  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  const provider = createProvider(buildProviderConfig(config, apiKey));

  const draft = await pr({ baseBranch: base, prompt: extraPrompt, provider, cwd });

  // Emit plan
  process.stdout.write(`## PR Draft\n\n`);
  process.stdout.write(`**Title:** ${draft.title}\n\n`);
  process.stdout.write(`**Body:**\n\n${draft.body}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${formatTokens(draft.tokens, draft.tokensAvailable)}\n\n`
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

// Only execute the runner when this module is invoked directly (i.e. `node
// dist/scripts/pr.js`). Skipping the auto-run when the file is imported keeps
// `runPrSkill` testable without triggering side effects.
const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runPrSkill(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  });
}
