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
} from "@denisvieiradev/gitwise-core";
import type { SplitMode, LLMProvider } from "@denisvieiradev/gitwise-core";
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
  if (code === "SENSITIVE_FILE_STAGED") {
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
      } catch {
        console.error(chalk.red("Error: Could not load gitwise config. Run `gw config` to set up."));
        process.exit(1);
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

      const runCommit = () =>
        commit({
          prompt: augmentedIntent,
          split: splitMode,
          provider,
          cwd,
        });

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
          p.cancel(formatCommitErrorCancel(err));
          process.exit(1);
        }
        spinner.stop("No staged changes");
        const staged = await promptInteractiveStage(cwd);
        if (staged !== "staged") {
          p.cancel(formatCommitErrorCancel(err));
          process.exit(1);
        }
        const retrySpinner = p.spinner();
        retrySpinner.start("Analyzing staged changes…");
        try {
          plan = await runCommit();
          retrySpinner.stop(opts.message ? "Ready" : "Analysis complete");
        } catch (retryErr: unknown) {
          retrySpinner.stop("Failed");
          p.cancel(formatCommitErrorCancel(retryErr));
          process.exit(1);
        }
      }

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
      if (!opts.message) {
        console.log(chalk.dim(`\n  Tokens: ${plan.tokens.input} in / ${plan.tokens.output} out`));
      }

      let confirmed = skipConfirm;
      if (!confirmed) {
        const answer = await p.confirm({ message: "Apply this commit plan?" });
        if (p.isCancel(answer) || !answer) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        confirmed = true;
      }

      const applySpinner = p.spinner();
      applySpinner.start("Committing…");

      try {
        await applyCommitPlan(plan, { cwd });
      } catch (err: unknown) {
        applySpinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        p.cancel(`Commit failed: ${msg}`);
        process.exit(1);
      }

      if (opts.push) {
        applySpinner.message("Pushing…");
        try {
          await git.push(cwd, "origin", "HEAD");
        } catch {
          applySpinner.stop("Committed (push failed — check remote)");
          p.outro(chalk.yellow("Committed but push failed. Run `git push` manually."));
          return;
        }
      }

      applySpinner.stop("Done");
      p.outro(chalk.green("Committed successfully!"));
    });
}
