import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import type { ChangedFile } from "../../infra/git.js";

interface SingleCommit {
  type: "single";
  message: string;
}

interface CommitPlan {
  type: "plan";
  commits: Array<{ message: string; description?: string; files: string[] }>;
}

type CommitResponse = SingleCommit | CommitPlan;

function tryParseJson(text: string): CommitResponse | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.type === "plan" && Array.isArray(parsed.commits)) return parsed;
    if (parsed.type === "single" && parsed.message) return parsed;
  } catch { /* not valid JSON */ }
  return null;
}

function parseCommitResponse(raw: string): CommitResponse {
  // Strategy 1: try parsing the whole response (pure JSON)
  const direct = tryParseJson(raw);
  if (direct) return direct;

  // Strategy 2: extract content between markdown code fences
  const fenceMatch = raw.match(/```json?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    const fromFence = tryParseJson(fenceMatch[1]);
    if (fromFence) return fromFence;
  }

  // Strategy 3: extract first JSON object by matching braces
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const fromBraces = tryParseJson(raw.slice(start, end + 1));
    if (fromBraces) return fromBraces;
  }

  return { type: "single", message: raw.trim() };
}

function statusCategory(file: ChangedFile): string {
  if (file.indexStatus === "?" && file.workTreeStatus === "?") return "Untracked";
  if (file.workTreeStatus === "D" || file.indexStatus === "D") return "Deleted";
  if (file.indexStatus === "A") return "Added";
  if (file.indexStatus === "R") return "Renamed";
  if (file.workTreeStatus === "M" || file.indexStatus === "M") return "Modified";
  return "Changed";
}

function coloredStatus(category: string): string {
  switch (category) {
    case "Untracked": return chalk.green(category);
    case "Modified": return chalk.yellow(category);
    case "Deleted": return chalk.red(category);
    case "Added": return chalk.green(category);
    case "Renamed": return chalk.cyan(category);
    default: return chalk.dim(category);
  }
}

function buildChangesSummary(files: ChangedFile[]): string {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const cat = statusCategory(f).toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const parts: string[] = [];
  if (counts.modified) parts.push(chalk.yellow(`${counts.modified} modified`));
  if (counts.added) parts.push(chalk.green(`${counts.added} added`));
  if (counts.deleted) parts.push(chalk.red(`${counts.deleted} deleted`));
  if (counts.renamed) parts.push(chalk.cyan(`${counts.renamed} renamed`));
  if (counts.untracked) parts.push(chalk.green(`${counts.untracked} untracked`));
  if (counts.changed) parts.push(chalk.dim(`${counts.changed} changed`));
  return `${parts.join(", ")} (${files.length} file${files.length !== 1 ? "s" : ""} total)`;
}

async function selectAndStageFiles(cwd: string, files: ChangedFile[]): Promise<void> {
  const groups: Record<string, { value: string; label: string }[]> = {};
  for (const f of files) {
    const category = coloredStatus(statusCategory(f));
    if (!groups[category]) groups[category] = [];
    groups[category].push({ value: f.file, label: f.file });
  }

  const selected = await p.groupMultiselect({
    message: "Select files to stage:",
    options: groups,
  });
  if (p.isCancel(selected)) {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }
  const selectedFiles = (selected as string[]).filter((s) => typeof s === "string");
  if (selectedFiles.length === 0) {
    p.cancel("No files selected.");
    process.exit(0);
  }
  await git.add(cwd, selectedFiles);
}

const MAX_DIFF_CHARS = 80_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large for context window]";
}

const SYSTEM_PROMPT = `You are a developer writing commit messages. Analyze the git diff and the list of staged files to determine if the changes span one or multiple contexts.

Rules for commit messages:
- Format: type(scope): description
- Types: feat, fix, refactor, test, chore, style, docs
- Description must be imperative, lowercase, max 72 chars
- Scope is optional but recommended
- Do NOT mention AI, Claude, generated, LLM, or copilot

Response format (JSON only, no extra text):

If all changes belong to a SINGLE context, return:
{"type": "single", "message": "type(scope): description"}

If changes span MULTIPLE distinct contexts (e.g., a bug fix AND a new feature, or docs AND refactoring), return:
{"type": "plan", "commits": [{"message": "type(scope): short title", "description": "brief explanation of what and why", "files": ["file1.ts"]}, {"message": "type(scope): short title", "description": "brief explanation of what and why", "files": ["file3.ts"]}]}

Rules for plan:
- "message" is the commit title (max 72 chars, imperative, lowercase)
- "description" is a brief one-line explanation of the change purpose
- "files" lists only the files belonging to that commit
- Only return a plan when there are clearly separate concerns. Do not split for minor differences.`;

async function handleSingleCommit(
  cwd: string,
  commitMessage: string,
  options: { push?: boolean },
): Promise<void> {
  p.log.info(`Commit message: ${chalk.green(commitMessage)}`);
  const confirm = await p.confirm({
    message: "Proceed with this commit message?",
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }
  await git.commit(cwd, commitMessage);
  p.log.success("Committed.");
  await pushIfRequested(cwd, options);
}

async function handleCommitPlan(
  cwd: string,
  plan: CommitPlan,
  stagedFilesList: string[],
  options: { push?: boolean },
): Promise<void> {
  p.log.info(chalk.bold("Commit plan:\n"));
  for (const [i, c] of plan.commits.entries()) {
    const desc = c.description ? `\n     ${chalk.dim(c.description)}` : "";
    p.log.message(
      `  ${chalk.cyan(`${i + 1}.`)} ${chalk.green(c.message)}${desc}`,
    );
  }

  const action = await p.select({
    message: "How would you like to proceed?",
    options: [
      { value: "split", label: "Split into separate commits (recommended)" },
      { value: "single", label: "Commit all as a single commit" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }

  if (action === "single") {
    const combined = plan.commits
      .map((c) => c.description ? `${c.message}\n\n${c.description}` : c.message)
      .join("\n\n");
    await git.commit(cwd, combined);
    p.log.success("Committed all changes as a single commit.");
  } else {
    const stagedSet = new Set(stagedFilesList);

    const validGroups = plan.commits
      .map((group) => ({
        ...group,
        files: group.files.filter((f) => stagedSet.has(f)),
      }))
      .filter((group) => group.files.length > 0);

    const assignedFiles = new Set(validGroups.flatMap((g) => g.files));
    const unassigned = stagedFilesList.filter((f) => !assignedFiles.has(f));
    const lastGroup = validGroups[validGroups.length - 1];
    if (unassigned.length > 0 && lastGroup) {
      lastGroup.files.push(...unassigned);
    }

    if (validGroups.length === 0) {
      const combined = plan.commits
        .map((c) => c.description ? `${c.message}\n\n${c.description}` : c.message)
        .join("\n\n");
      await git.commit(cwd, combined);
      p.log.success("Committed all changes as a single commit.");
    } else {
      await git.resetStaged(cwd);
      for (const group of validGroups) {
        await git.add(cwd, group.files);
        const msg = group.description
          ? `${group.message}\n\n${group.description}`
          : group.message;
        await git.commit(cwd, msg);
        p.log.success(`Committed: ${chalk.green(group.message)}`);
      }
    }
  }

  await pushIfRequested(cwd, options);
}

async function pushIfRequested(
  cwd: string,
  options: { push?: boolean },
): Promise<void> {
  if (options.push) {
    const branch = await git.getBranch(cwd);
    const spinner = ora();
    spinner.start("Pushing...");
    await git.push(cwd, "origin", branch);
    spinner.stop();
    p.log.success(`Pushed to origin/${branch}`);
  }
}

export function makeCommitCommand(): Command {
  return new Command("commit")
    .description("Generate intelligent commit message from staged changes")
    .option("--push", "Push after committing")
    .action(async (options: { push?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow commit");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      let diff = await git.getStagedDiff(cwd);

      if (!diff) {
        let unstaged: ChangedFile[];
        try {
          unstaged = await git.getUnstagedFiles(cwd);
        } catch (err) {
          p.cancel(
            `Failed to read git status: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
        if (unstaged.length === 0) {
          p.cancel("Nothing to commit (working tree clean).");
          process.exit(1);
        }

        p.log.info(`Changes detected:\n  ${buildChangesSummary(unstaged)}`);

        const action = await p.select({
          message: "No staged changes found. How would you like to proceed?",
          options: [
            { value: "all", label: "Add all changes to stage" },
            { value: "select", label: "Select specific files" },
          ],
        });
        if (p.isCancel(action)) {
          p.cancel("Commit cancelled.");
          process.exit(0);
        }

        if (action === "all") {
          await git.add(cwd, ["-A"]);
        } else {
          await selectAndStageFiles(cwd, unstaged);
        }

        diff = await git.getStagedDiff(cwd);
        if (!diff) {
          p.cancel("No staged changes after staging. Nothing to commit.");
          process.exit(1);
        }
      } else {
        const stagedFiles = await git.getStagedFiles(cwd);
        p.log.info(
          `Staged: ${buildChangesSummary(stagedFiles)}\n${stagedFiles.map((f) => `  ${f.file}`).join("\n")}`,
        );

        const unstaged = await git.getUnstagedFiles(cwd);
        if (unstaged.length > 0) {
          p.log.info(
            `Unstaged: ${buildChangesSummary(unstaged)}`,
          );
          const action = await p.select({
            message: "You have staged changes. What would you like to do?",
            options: [
              { value: "continue", label: "Continue with current staged changes" },
              { value: "add", label: "Add more files to stage" },
            ],
          });
          if (p.isCancel(action)) {
            p.cancel("Commit cancelled.");
            process.exit(0);
          }

          if (action === "add") {
            await selectAndStageFiles(cwd, unstaged);
            diff = await git.getStagedDiff(cwd);
          }
        }
      }

      const stagedFilesList = await git.getStagedFilesList(cwd);

      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("commit");
      const spinner = ora();
      let response;
      try {
        spinner.start("Analyzing changes...");
        response = await provider.chat({
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Staged files:\n${stagedFilesList.join("\n")}\n\nDiff:\n${truncateDiff(diff)}`,
            },
          ],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      const parsed = parseCommitResponse(response.content);

      if (parsed.type === "plan") {
        await handleCommitPlan(cwd, parsed, stagedFilesList, options);
      } else {
        await handleSingleCommit(cwd, parsed.message, options);
      }

      p.outro("Done.");
    });
}
