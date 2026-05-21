#!/usr/bin/env node
/**
 * gitwise-skills: release runner
 *
 * Usage:
 *   node scripts/release.js [--bump <type>] [--apply] [--no-gh-release]
 *   node scripts/release.js prepare [--bump <type>]
 *   node scripts/release.js finish [--no-gh-release] [--no-workspace-propagation] [--no-delete-branch]
 *   node scripts/release.js abort [--delete-branch]
 *
 * The first positional argument selects the lifecycle phase. When absent, the
 * script keeps the legacy one-shot UX (plan then optional `--apply`). Each
 * phase forwards to the corresponding core function (`prepareRelease`,
 * `finishRelease`, `abortRelease`) and surfaces typed `error.code` values on
 * failure so the Claude Code skill can react.
 */

import { fileURLToPath } from "node:url";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  release,
  applyRelease,
  prepareRelease,
  finishRelease,
  abortRelease,
  detectWorkspaceRoot,
} from "@denisvieiradev/gitwise-core";
import type {
  LLMProvider,
  PersistedReleasePlan,
} from "@denisvieiradev/gitwise-core";
import { parseReleaseArgs, UnknownPhaseError } from "./release-args.js";
import type { ParsedReleaseArgs } from "./release-args.js";

function writeError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const prefix = code ? `Error [${code}]` : "Error";
  process.stderr.write(`${prefix}: ${message}\n`);
}

function renderPlan(plan: PersistedReleasePlan): void {
  process.stdout.write(`## Release Plan\n\n`);
  process.stdout.write(
    `**Version:** ${plan.currentVersion} → ${plan.newVersion} (${plan.suggestedBump} bump, strategy: ${plan.strategy})\n\n`,
  );
  if (plan.releaseBranchCreated) {
    process.stdout.write(`**Release branch:** ${plan.targetBranch}\n\n`);
  }
  process.stdout.write(`### Changelog\n\n${plan.changelog}\n\n`);
  process.stdout.write(`### Release Notes\n\n${plan.notes}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${plan.tokens.input} in / ${plan.tokens.output} out\n\n`,
  );
}

async function loadProvider(cwd: string): Promise<LLMProvider> {
  const config = await getMergedConfig({ cwd });
  const apiKey = await getApiKey();
  return createProvider({
    kind: config.provider,
    models: config.models,
    apiKey,
    claudeCliPath: config.claudeCliPath,
  });
}

async function runLegacy(parsed: ParsedReleaseArgs, cwd: string): Promise<void> {
  const provider = await loadProvider(cwd);
  const plan = await release({ bump: parsed.bump, provider, cwd });

  process.stdout.write(`## Release Plan\n\n`);
  process.stdout.write(
    `**Version:** ${plan.newVersion} (${plan.suggestedBump})\n\n`,
  );
  process.stdout.write(`### Changelog\n\n${plan.changelog}\n\n`);
  process.stdout.write(`### Release Notes\n\n${plan.notes}\n\n`);
  process.stdout.write(
    `**Tokens used:** ${plan.tokens.input} in / ${plan.tokens.output} out\n\n`,
  );

  if (!parsed.apply) {
    process.stdout.write(
      "_Run with `--apply` to tag, update CHANGELOG.md, and create a release._\n",
    );
    return;
  }

  const workspacePropagation = parsed.noWorkspacePropagation
    ? false
    : await detectWorkspaceRoot(cwd);
  await applyRelease(plan, {
    cwd,
    createGhRelease: !parsed.noGhRelease,
    workspacePropagation,
  });
  process.stdout.write(`**Done.** Released ${plan.newVersion}.\n`);
}

async function runPrepare(parsed: ParsedReleaseArgs, cwd: string): Promise<void> {
  const provider = await loadProvider(cwd);
  const plan = await prepareRelease({ bump: parsed.bump, provider, cwd });
  renderPlan(plan);
  const next = plan.releaseBranchCreated
    ? `_Edit \`.gitwise/release-${plan.newVersion}.md\` if needed, then run \`gw release finish\` from \`${plan.targetBranch}\`._\n`
    : `_Edit \`.gitwise/release-${plan.newVersion}.md\` if needed, then run \`gw release finish\`._\n`;
  process.stdout.write(next);
}

async function runFinish(parsed: ParsedReleaseArgs, cwd: string): Promise<void> {
  const workspacePropagation = parsed.noWorkspacePropagation
    ? false
    : await detectWorkspaceRoot(cwd);
  await finishRelease({
    cwd,
    createGhRelease: !parsed.noGhRelease,
    workspacePropagation,
    deleteReleaseBranch: parsed.deleteReleaseBranch,
  });
  process.stdout.write("**Done.** Release finished.\n");
}

async function runAbort(parsed: ParsedReleaseArgs, cwd: string): Promise<void> {
  await abortRelease({ cwd, deleteBranch: parsed.deleteBranch === true });
  process.stdout.write("**Done.** Release plan discarded.\n");
}

export async function runReleaseSkill(
  parsed: ParsedReleaseArgs,
  cwd: string = process.cwd(),
): Promise<void> {
  switch (parsed.phase) {
    case "prepare":
      return runPrepare(parsed, cwd);
    case "finish":
      return runFinish(parsed, cwd);
    case "abort":
      return runAbort(parsed, cwd);
    case undefined:
      return runLegacy(parsed, cwd);
  }
}

async function main(): Promise<void> {
  let parsed: ParsedReleaseArgs;
  try {
    parsed = parseReleaseArgs(process.argv.slice(2));
  } catch (err) {
    writeError(err);
    process.exit(err instanceof UnknownPhaseError ? 2 : 1);
  }
  await runReleaseSkill(parsed);
}

// Only execute the runner when this module is invoked directly (i.e. `node
// dist/scripts/release.js`). Skipping the auto-run when the file is imported
// keeps `runReleaseSkill` testable without triggering side effects.
const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err: unknown) => {
    writeError(err);
    process.exit(1);
  });
}
