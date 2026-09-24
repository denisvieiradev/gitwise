#!/usr/bin/env node
/**
 * gitwise-skills: review runner
 * Usage: node scripts/review.js [--base <branch>] [--prompt "<text>"]
 */

import { isInvokedDirectly } from "./invoked-directly.js";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  buildProviderConfig,
  review,
  formatTokens,
} from "@denisvieiradev/gitwise-core";

export async function runReviewSkill(
  rawArgs: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  const args = [...rawArgs];

  // Parse flags
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

  const result = await review({ baseBranch: base, prompt: extraPrompt, provider, cwd });

  // Emit sections
  process.stdout.write("## Code Review\n\n");

  if (result.critical.length > 0) {
    process.stdout.write("### Critical\n\n");
    for (const f of result.critical) {
      const prefix = f.file ? `**${f.file}** ` : "";
      process.stdout.write(`- ${prefix}${f.description}\n`);
    }
    process.stdout.write("\n");
  }

  if (result.suggestions.length > 0) {
    process.stdout.write("### Suggestions\n\n");
    for (const f of result.suggestions) {
      const prefix = f.file ? `**${f.file}** ` : "";
      process.stdout.write(`- ${prefix}${f.description}\n`);
    }
    process.stdout.write("\n");
  }

  if (result.nitpicks.length > 0) {
    process.stdout.write("### Nitpicks\n\n");
    for (const f of result.nitpicks) {
      const prefix = f.file ? `**${f.file}** ` : "";
      process.stdout.write(`- ${prefix}${f.description}\n`);
    }
    process.stdout.write("\n");
  }

  if (
    result.critical.length === 0 &&
    result.suggestions.length === 0 &&
    result.nitpicks.length === 0
  ) {
    process.stdout.write("_No findings. Looks good!_\n\n");
  }

  process.stdout.write(
    `**Tokens used:** ${formatTokens(result.tokens, result.tokensAvailable)}\n`
  );
}

// Only execute the runner when this module is invoked directly (i.e. `node
// dist/scripts/review.js`). Skipping the auto-run when the file is imported
// keeps `runReviewSkill` testable without triggering side effects.
const invokedDirectly = isInvokedDirectly(import.meta.url);

if (invokedDirectly) {
  runReviewSkill(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  });
}
