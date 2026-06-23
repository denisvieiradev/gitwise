import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  commit,
  applyCommitPlan,
  git,
  GitwiseError,
} from "@denisvieiradev/gitwise-core";
import type { SplitMode, LLMProvider, CommitPlan, CommitAlternatives } from "@denisvieiradev/gitwise-core";
import os from "node:os";

interface CommitCommandOptions {
  split: string;
  push: boolean;
  apply?: boolean;
  confirm: boolean;
  message?: string;
  base?: string;
}

/**
 * Maps a thrown commit() error to the friendly text shown via `p.cancel`.
 * Exported for unit testing — production callers in the action below pass the
 * caught error directly. Branches on the structured `.code` property set by
 * core (see packages/core/src/commands/commit.ts); message-substring matching
 * is unreliable because the human-readable messages don't echo the code.
 */
export function formatCommitErrorCancel(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "NOTHING_STAGED") {
    return "No staged changes. Use `git add` to stage files first.";
  }
  if (code === "SENSITIVE_FILE_BLOCKED") {
    return `Sensitive file detected: ${msg}`;
  }
  return `Error: ${msg}`;
}

/**
 * Interactive fallback when `git diff --cached` is empty. Lists changed files
 * and offers to stage them — either all (`git add -A`) or a multiselect subset.
 * Returns "staged" if files were added, null if the user cancelled or there
 * were no changed files to stage at all.
 *
 * Kept local to this command because it's specific to the commit prompt UX.
 */
async function promptInteractiveStage(cwd: string): Promise<"staged" | null> {
  const changed = await git.parseStatus(cwd);
  if (changed.length === 0) return null;

  const action = await p.select<"add-all" | "pick" | "cancel">({
    message: "No staged changes. What would you like to do?",
    options: [
      { value: "add-all", label: `Add all changes (${changed.length} file${changed.length === 1 ? "" : "s"})` },
      { value: "pick", label: "Select files to stage" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") return null;

  if (action === "add-all") {
    await git.add(cwd, ["-A"]);
    return "staged";
  }

  const choices = changed.map((f) => ({
    value: f.file,
    label: `${f.indexStatus}${f.workTreeStatus} ${f.file}`,
  }));
  const picked = await p.multiselect<string>({
    message: "Select files to stage (space to toggle, enter to confirm)",
    options: choices,
    required: true,
  });
  if (p.isCancel(picked) || !Array.isArray(picked) || picked.length === 0) return null;

  await git.add(cwd, picked);
  return "staged";
}

function displayPlan(plan: CommitPlan): void {
  if (plan.kind === "single") {
    const [c] = plan.commits;
    console.log(chalk.bold("\nProposed commit:"));
    console.log(chalk.cyan(`  ${c!.message}`));
    if (c!.description) console.log(chalk.dim(`  ${c!.description}`));
  } else {
    console.log(chalk.bold(`\nProposed ${plan.commits.length} commits:`));
    plan.commits.forEach((c, i) => {
      console.log(chalk.cyan(`  ${i + 1}. ${c.message}`));
    });
  }
  console.log(chalk.dim(`\n  Tokens: ${plan.tokens.input} in / ${plan.tokens.output} out`));
}

function alternativeToPlan(alts: CommitAlternatives, index: number): CommitPlan {
  const message = alts.options[index] ?? alts.options[0]!;
  return {
    kind: "single",
    commits: [{ message, files: [] }],
    tokens: alts.tokens,
  };
}

async function runRefinementLoop(
  initialPlan: CommitPlan,
  runCommit: (opts?: { feedbackHint?: string; generateAlternatives?: boolean; split?: SplitMode }) => Promise<CommitPlan | CommitAlternatives>,
): Promise<CommitPlan | null> {
  let plan: CommitPlan = initialPlan;

  while (true) {
    displayPlan(plan);

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "apply", label: "Apply this commit plan" },
        { value: "think", label: "Think again" },
        { value: "describe", label: "Describe what I want" },
        { value: "cancel", label: "Cancel" },
      ],
    });

    if (p.isCancel(action) || action === "cancel") return null;
    if (action === "apply") return plan;

    if (action === "describe") {
      const hint = await p.text({ message: "Describe what you want in the commit message:" });
      if (p.isCancel(hint) || !hint) return null;
      const spinner = p.spinner();
      spinner.start("Generating new suggestion…");
      try {
        const result = await runCommit({ feedbackHint: String(hint) });
        spinner.stop("Done");
        plan = result.kind === "alternatives"
          ? alternativeToPlan(result as CommitAlternatives, 0)
          : (result as CommitPlan);
      } catch {
        spinner.stop("Failed");
        throw new Error("Failed to generate new suggestion");
      }
      continue;
    }

    if (action === "think") {
      const thinkMode = await p.select({
        message: "How would you like to reconsider?",
        options: [
          { value: "single", label: "Find the best single commit message" },
          { value: "split", label: "Split into contextual commits" },
        ],
      });

      if (p.isCancel(thinkMode)) return null;

      if (thinkMode === "single") {
        const spinner = p.spinner();
        spinner.start("Thinking of alternatives…");
        let alts: CommitAlternatives;
        try {
          const result = await runCommit({ generateAlternatives: true });
          spinner.stop("Done");
          if (result.kind !== "alternatives") {
            plan = result as CommitPlan;
            continue;
          }
          alts = result as CommitAlternatives;
        } catch {
          spinner.stop("Failed");
          throw new Error("Failed to generate alternatives");
        }

        console.log(chalk.bold("\nAlternatives:"));
        alts.options.forEach((opt, i) => {
          console.log(chalk.cyan(`  ${i + 1}. ${opt}`));
        });
        console.log(chalk.dim(`\n  Tokens: ${alts.tokens.input} in / ${alts.tokens.output} out`));

        const pickOptions = [
          ...alts.options.map((opt, i) => ({ value: `pick:${i}`, label: `Use: ${opt}` })),
          { value: "describe", label: "Describe what I want" },
          { value: "think", label: "Try again" },
          { value: "cancel", label: "Cancel" },
        ];

        const pick = await p.select({ message: "Pick an option:", options: pickOptions });
        if (p.isCancel(pick) || pick === "cancel") return null;

        if (typeof pick === "string" && pick.startsWith("pick:")) {
          plan = alternativeToPlan(alts, parseInt(pick.slice(5), 10));
          continue;
        }

        if (pick === "describe") {
          const hint = await p.text({ message: "Describe what you want in the commit message:" });
          if (p.isCancel(hint) || !hint) return null;
          const s2 = p.spinner();
          s2.start("Generating new suggestion…");
          try {
            const result = await runCommit({ feedbackHint: String(hint) });
            s2.stop("Done");
            plan = result.kind === "alternatives"
              ? alternativeToPlan(result as CommitAlternatives, 0)
              : (result as CommitPlan);
          } catch {
            s2.stop("Failed");
            throw new Error("Failed to generate new suggestion");
          }
          continue;
        }

        // pick === "think": loop back
        continue;
      }

      if (thinkMode === "split") {
        const spinner = p.spinner();
        spinner.start("Analyzing how to split commits…");
        try {
          const result = await runCommit({ split: "always" });
          spinner.stop("Done");
          plan = result.kind === "alternatives"
            ? alternativeToPlan(result as CommitAlternatives, 0)
            : (result as CommitPlan);
        } catch (err) {
          spinner.stop("Failed");
          if ((err as { code?: string })?.code === "NO_SPLIT_POSSIBLE") {
            console.log(chalk.yellow("\n  Changes are within a single context — cannot split further."));
          } else {
            throw err;
          }
        }
        continue;
      }
    }
  }
}

export function makeCommitCommand(): Command {
  return new Command("commit")
    .description("Generate intelligent commit message from staged changes")
    .argument("[intent]", "Optional description of what the changes are for")
    .option("--message <m>", "Use this commit message directly and skip the LLM")
    .option("--base <branch>", "Target merge-base branch (passed to the LLM as context)")
    .option("--split <mode>", "Split mode: auto | never | always (default: auto)", "auto")
    .option("--push", "Push after committing")
    .option("--no-confirm", "Skip the confirmation prompt and apply immediately")
    .option("--apply", "Alias for --no-confirm (kept for backward compatibility)")
    .action(async (intent: string | undefined, opts: CommitCommandOptions) => {
      const cwd = process.cwd();
      const homeDir = os.homedir();
      const skipConfirm = opts.apply === true || opts.confirm === false;

      let config;
      try {
        config = await getMergedConfig({ cwd, homeDir });
      } catch (err) {
        throw new GitwiseError({
          code: "CONFIG_INVALID",
          message: "Could not load gitwise config. Run `gw config` to set up.",
          cause: err,
        });
      }

      // --message bypasses the LLM by stubbing the provider with a fixed single-commit
      // response. Routing through commit() keeps the "nothing staged" and
      // "sensitive file" guards intact for the preset-message path.
      let provider: LLMProvider;
      if (opts.message) {
        const presetMessage = opts.message;
        provider = {
          async chat() {
            return {
              content: JSON.stringify({ type: "single", message: presetMessage }),
              tokens: { input: 0, output: 0 },
            };
          },
        };
      } else {
        const apiKey = await getApiKey(homeDir);
        if (config.provider === "api" && !apiKey) {
          throw new GitwiseError({
            code: "API_KEY_MISSING",
            message:
              "ANTHROPIC_API_KEY is not configured. Set it in the environment or run `gw config` to add it to ~/.gitwise/.env.",
          });
        }
        provider = createProvider({
          kind: config.provider,
          models: config.models,
          apiKey,
          claudeCliPath: config.claudeCliPath,
        });
      }

      let splitMode: SplitMode = (["auto", "never", "always"].includes(opts.split) ? opts.split : "auto") as SplitMode;
      if (opts.message && splitMode === "always") {
        console.log(chalk.yellow("Note: --message implies a single commit; ignoring --split=always."));
        splitMode = "never";
      }

      const augmentedIntent = opts.base
        ? [intent, `Target merge base: ${opts.base}`].filter(Boolean).join("\n")
        : intent;

      p.intro(chalk.bold("gitwise commit"));

      const spinner = p.spinner();
      spinner.start(opts.message ? "Preparing commit…" : "Analyzing staged changes…");

      const runCommit = (refinement?: { feedbackHint?: string; generateAlternatives?: boolean; split?: SplitMode }) => {
        const { split: refinementSplit, ...rest } = refinement ?? {};
        return commit({
          prompt: augmentedIntent,
          split: refinementSplit ?? splitMode,
          provider,
          cwd,
          ...rest,
        });
      };

      let plan;
      try {
        plan = await runCommit();
        spinner.stop(opts.message ? "Ready" : "Analysis complete");
      } catch (err: unknown) {
        const code = (err as { code?: unknown } | null)?.code;
        const canPromptStage =
          code === "NOTHING_STAGED" && !skipConfirm && process.stdin.isTTY === true;
        if (!canPromptStage) {
          spinner.stop("Failed");
          throw err;
        }
        spinner.stop("No staged changes");
        const staged = await promptInteractiveStage(cwd);
        if (staged !== "staged") {
          throw err;
        }
        const retrySpinner = p.spinner();
        retrySpinner.start("Analyzing staged changes…");
        try {
          plan = await runCommit();
          retrySpinner.stop(opts.message ? "Ready" : "Analysis complete");
        } catch (retryErr: unknown) {
          retrySpinner.stop("Failed");
          throw retryErr;
        }
      }

      let resolvedPlan: CommitPlan;
      if (skipConfirm) {
        resolvedPlan = plan as CommitPlan;
        if (!opts.message) displayPlan(resolvedPlan);
      } else {
        const refined = await runRefinementLoop(plan as CommitPlan, runCommit);
        if (!refined) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        resolvedPlan = refined;
      }

      const applySpinner = p.spinner();
      applySpinner.start("Committing…");

      try {
        await applyCommitPlan(resolvedPlan, { cwd });
      } catch (err: unknown) {
        applySpinner.stop("Failed");
        throw err;
      }

      if (opts.push) {
        applySpinner.message("Pushing…");
        try {
          await git.push(cwd, "origin", "HEAD");
        } catch (pushErr: unknown) {
          const reason = pushErr instanceof Error ? pushErr.message : String(pushErr);
          applySpinner.stop("Committed (push failed)");
          p.outro(chalk.yellow(`Committed but push failed: ${reason}\nRun \`git push\` manually.`));
          return;
        }
        applySpinner.stop("Committed and pushed");
        p.outro(chalk.green("Committed and pushed successfully!"));
        return;
      }

      applySpinner.stop("Done");
      p.outro(chalk.green("Committed successfully!"));
    });
}
