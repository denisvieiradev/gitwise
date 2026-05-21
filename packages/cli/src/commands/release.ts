import type { Command as CommanderCommand } from "commander";
import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  prepareRelease,
  finishRelease,
  abortRelease,
  loadReleasePlan,
  runReleaseInProcess,
  detectWorkspaceRoot,
} from "@denisvieiradev/gitwise-core";
import type {
  BumpType,
  PersistedReleasePlan,
} from "@denisvieiradev/gitwise-core";
import os from "node:os";
import { formatReleaseError } from "./release-errors.js";

function exitWithReleaseError(err: unknown, fallbackPrefix = "Error"): never {
  const { message, hint } = formatReleaseError(err);
  p.cancel(`${fallbackPrefix}: ${message}\n  Hint: ${hint}`);
  process.exit(1);
}

function renderPlan(plan: PersistedReleasePlan): void {
  console.log(
    chalk.bold("\nVersion:"),
    chalk.cyan(`${plan.currentVersion} → ${plan.newVersion}`),
    chalk.dim(`(${plan.suggestedBump} bump, strategy: ${plan.strategy})`),
  );
  if (plan.releaseBranchCreated) {
    console.log(chalk.bold("Release branch:"), chalk.cyan(plan.targetBranch));
  }
  console.log(chalk.bold("\nChangelog entry:"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(plan.changelog);
  console.log(chalk.dim("─".repeat(60)));
  console.log(chalk.bold("\nRelease notes:"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(plan.notes);
  console.log(chalk.dim("─".repeat(60)));
  console.log(
    chalk.dim(`\n  Tokens: ${plan.tokens.input} in / ${plan.tokens.output} out`),
  );
}

function normalizeBump(input?: string): BumpType | undefined {
  return input === "major" || input === "minor" || input === "patch"
    ? input
    : undefined;
}

interface ReleaseRootOpts {
  bump?: string;
  apply: boolean;
  ghRelease: boolean;
  workspacePropagation: boolean;
}

async function loadProvider(cwd: string, homeDir: string) {
  let config;
  try {
    config = await getMergedConfig({ cwd, homeDir });
  } catch {
    console.error(chalk.red("Error: Could not load gitwise config."));
    process.exit(1);
  }
  const apiKey = await getApiKey(homeDir);
  const provider = createProvider({
    kind: config.provider,
    models: config.models,
    apiKey,
    claudeCliPath: config.claudeCliPath,
  });
  return provider;
}

export function makeReleaseCommand(): Command {
  const release = new Command("release")
    .description("Versioned release with changelog and release notes")
    .option("--bump <type>", "Override version bump type: major | minor | patch")
    .option("--apply", "Skip confirmation and apply release immediately")
    .option("--no-gh-release", "Skip creating a GitHub release (tag only)")
    .option(
      "--no-workspace-propagation",
      "Skip propagating the new version to packages/*/package.json (auto-detected for workspace roots)",
    )
    .action(async (opts: ReleaseRootOpts) => {
      await runReleaseRoot(opts);
    });

  release
    .command("prepare [version]")
    .description("Plan a release and persist .gitwise/release-plan.json (no tag, no push)")
    .option("--bump <type>", "Override version bump type: major | minor | patch")
    .action(async (_version: string | undefined, _opts: unknown, cmd: CommanderCommand) => {
      // optsWithGlobals merges parent opts (the root `release` command also
      // declares `--bump`, which commander otherwise hoists to the parent
      // and leaves this subcommand's own opts empty).
      const merged = cmd.optsWithGlobals() as { bump?: string };
      await runPrepare({ bump: merged.bump });
    });

  release
    .command("finish")
    .description("Apply the persisted release plan: bump, commit, merge, tag, push")
    .option("--no-gh-release", "Skip creating a GitHub release (tag only)")
    .option(
      "--no-workspace-propagation",
      "Skip propagating the new version to packages/*/package.json (auto-detected for workspace roots)",
    )
    .option("--no-delete-branch", "Keep the release branch after merging (gitflow only)")
    .action(async (_opts: unknown, cmd: CommanderCommand) => {
      const merged = cmd.optsWithGlobals() as {
        ghRelease?: boolean;
        workspacePropagation?: boolean;
        deleteBranch?: boolean;
      };
      await runFinish({
        ghRelease: merged.ghRelease !== false,
        workspacePropagation: merged.workspacePropagation !== false,
        deleteBranch: merged.deleteBranch !== false,
      });
    });

  release
    .command("abort")
    .description("Discard the persisted release plan (optionally delete the release branch)")
    .action(async () => {
      await runAbort();
    });

  return release;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function runReleaseRoot(opts: ReleaseRootOpts): Promise<void> {
  const cwd = process.cwd();
  const homeDir = os.homedir();
  const provider = await loadProvider(cwd, homeDir);
  const bump = normalizeBump(opts.bump);

  p.intro(chalk.bold("gitwise release"));

  const spinner = p.spinner();
  spinner.start("Analyzing commits and planning release…");

  const workspacePropagation =
    opts.workspacePropagation === false ? false : await detectWorkspaceRoot(cwd);

  try {
    const plan = await runReleaseInProcess({
      cwd,
      provider,
      bump,
      confirm: async (preparedPlan) => {
        spinner.stop("Release plan ready");
        renderPlan(preparedPlan);
        if (opts.apply) return true;
        const answer = await p.confirm({
          message: `Apply release ${preparedPlan.newVersion}?`,
        });
        if (p.isCancel(answer)) return false;
        return answer === true;
      },
      // When the user declines on a gitflow plan, prepare has already
      // created `release/<version>` and committed the version bump. Mirror
      // the dedicated `gw release abort` UX (see `runAbort`) and ask whether
      // to also drop the branch — without this the user is left stranded on
      // an orphan branch with no plan file to abort against.
      confirmAbortDeletesBranch: async (preparedPlan) => {
        if (!preparedPlan.releaseBranchCreated) return false;
        const answer = await p.confirm({
          message: `Also delete the release branch "${preparedPlan.targetBranch}"?`,
          initialValue: false,
        });
        if (p.isCancel(answer)) return false;
        return answer === true;
      },
      finishOptions: {
        createGhRelease: opts.ghRelease,
        workspacePropagation,
      },
    });

    if (!plan) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    p.outro(chalk.green(`Released ${plan.newVersion} successfully!`));
  } catch (err) {
    spinner.stop("Failed");
    exitWithReleaseError(err, "Release failed");
  }
}

async function runPrepare(opts: { bump?: string }): Promise<void> {
  const cwd = process.cwd();
  const homeDir = os.homedir();
  const provider = await loadProvider(cwd, homeDir);
  const bump = normalizeBump(opts.bump);

  p.intro(chalk.bold("gitwise release prepare"));

  const spinner = p.spinner();
  spinner.start("Analyzing commits and planning release…");

  let plan: PersistedReleasePlan;
  try {
    plan = await prepareRelease({ cwd, provider, bump });
  } catch (err) {
    spinner.stop("Failed");
    exitWithReleaseError(err, "Prepare failed");
  }

  spinner.stop("Release plan saved");
  renderPlan(plan);

  const next = plan.releaseBranchCreated
    ? `Edit .gitwise/release-${plan.newVersion}.md if needed, then run \`gw release finish\` from ${plan.targetBranch}.`
    : `Edit .gitwise/release-${plan.newVersion}.md if needed, then run \`gw release finish\`.`;
  p.outro(chalk.green(next));
}

async function runFinish(opts: {
  ghRelease: boolean;
  workspacePropagation: boolean;
  deleteBranch: boolean;
}): Promise<void> {
  const cwd = process.cwd();

  p.intro(chalk.bold("gitwise release finish"));

  const workspacePropagation =
    opts.workspacePropagation === false ? false : await detectWorkspaceRoot(cwd);

  const spinner = p.spinner();
  spinner.start("Applying saved release plan…");

  try {
    await finishRelease({
      cwd,
      createGhRelease: opts.ghRelease,
      deleteReleaseBranch: opts.deleteBranch !== false,
      workspacePropagation,
    });
  } catch (err) {
    spinner.stop("Failed");
    exitWithReleaseError(err, "Finish failed");
  }

  spinner.stop("Done");
  p.outro(chalk.green("Release finished."));
}

async function runAbort(): Promise<void> {
  const cwd = process.cwd();

  p.intro(chalk.bold("gitwise release abort"));

  // Peek at the plan first so we can decide whether to ask about the branch.
  // Re-doing the read in `abortRelease` is fine — it's a JSON file read.
  let releaseBranchCreated = false;
  let targetBranch = "";
  try {
    const plan = await loadReleasePlan(cwd);
    if (plan) {
      releaseBranchCreated = plan.releaseBranchCreated;
      targetBranch = plan.targetBranch;
    }
  } catch {
    // fall through — abortRelease will surface NO_RELEASE_PLAN or schema errors
  }

  let deleteBranch = false;
  if (releaseBranchCreated) {
    const answer = await p.confirm({
      message: `Also delete the release branch "${targetBranch}"?`,
      initialValue: false,
    });
    if (p.isCancel(answer)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    deleteBranch = answer === true;
  }

  try {
    await abortRelease({ cwd, deleteBranch });
  } catch (err) {
    exitWithReleaseError(err, "Abort failed");
  }

  p.outro(chalk.green("Release plan discarded."));
}
