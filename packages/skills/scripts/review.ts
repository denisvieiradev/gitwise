#!/usr/bin/env node
/**
 * gitwise-skills: review runner
 * Usage: node scripts/review.js [--base <branch>] [--prompt "<text>"]
 */

import {
  getMergedConfig,
  createProvider,
  review,
} from "@denisvieiradev/gitwise-core";

const args = process.argv.slice(2);

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

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = await getMergedConfig({ cwd });
  const provider = createProvider(config);

  const result = await review({ base, extraPrompt, provider, cwd });

  // Emit sections
  process.stdout.write("## Code Review\n\n");

  if (result.critical.length > 0) {
    process.stdout.write("### Critical\n\n");
    for (const f of result.critical) {
      process.stdout.write(`- **${f.file ?? ""}** ${f.message}\n`);
    }
    process.stdout.write("\n");
  }

  if (result.suggestions.length > 0) {
    process.stdout.write("### Suggestions\n\n");
    for (const f of result.suggestions) {
      process.stdout.write(`- **${f.file ?? ""}** ${f.message}\n`);
    }
    process.stdout.write("\n");
  }

  if (result.nitpicks.length > 0) {
    process.stdout.write("### Nitpicks\n\n");
    for (const f of result.nitpicks) {
      process.stdout.write(`- **${f.file ?? ""}** ${f.message}\n`);
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
    `**Tokens used:** ${result.tokens.input} in / ${result.tokens.output} out\n`
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
