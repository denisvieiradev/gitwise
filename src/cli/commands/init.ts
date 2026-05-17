import { Command } from "commander";
import * as p from "@clack/prompts";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { readConfig, writeConfig } from "../../core/config.js";
import { initState } from "../../core/state.js";
import { scanProject } from "../../core/scanner.js";
import { fileExists } from "../../infra/filesystem.js";
import { DEFAULT_CONFIG, type ContextMode, type Language, type CommitConvention, type DevflowConfig } from "../../core/types.js";
import { writeEnvVar } from "../../infra/env.js";
import { resolveClaudeBinary, validateClaudeCli } from "../../providers/claude-code.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

async function hasGhCli(): Promise<boolean> {
  try {
    await exec("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function isInGitignore(projectRoot: string, entry: string): Promise<boolean> {
  const gitignorePath = join(projectRoot, ".gitignore");
  if (!(await fileExists(gitignorePath))) return false;
  const content = await readFile(gitignorePath, "utf-8");
  return content.split("\n").some((line) => line.trim() === entry);
}

export function makeInitCommand(): Command {
  return new Command("init")
    .description("Initialize devflow in current project")
    .option("--force", "Overwrite existing config")
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow init");
      if (!(await isGitRepo(cwd))) {
        p.cancel("Not a git repository. Run `git init` first.");
        process.exit(1);
      }
      const existingConfig = await readConfig(cwd);
      if (existingConfig && !options.force) {
        p.cancel("Config already exists. Use --force to overwrite.");
        process.exit(1);
      }
      const scan = await scanProject(cwd);
      p.log.info(
        `Detected: ${scan.language}${scan.framework ? ` (${scan.framework})` : ""}, ${scan.testFramework ?? "no tests"}, ${scan.hasCI ? "CI found" : "no CI"}`,
      );
      const provider = await p.select({
        message: "LLM Provider",
        options: [
          { value: "claude-code-api-key" as const, label: "Claude (API Key)", hint: "requires Anthropic API key" },
          { value: "claude-code-cli" as const, label: "Claude Code (CLI)", hint: "uses your Claude Code subscription" },
        ],
      });
      if (p.isCancel(provider)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }
      const contextMode = await p.select({
        message: "Context mode",
        options: [
          { value: "normal" as const, label: "Normal", hint: "full documents, best quality" },
          { value: "light" as const, label: "Light", hint: "chunked context, lower cost" },
        ],
      });
      if (p.isCancel(contextMode)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }
      const language = await p.select({
        message: "Output language",
        options: [
          { value: "en" as const, label: "English" },
          { value: "pt-br" as const, label: "Português (Brasil)" },
          { value: "es" as const, label: "Español" },
          { value: "fr" as const, label: "Français" },
          { value: "de" as const, label: "Deutsch" },
          { value: "zh" as const, label: "中文 (简体)" },
          { value: "ja" as const, label: "日本語" },
          { value: "ko" as const, label: "한국어" },
        ],
      });
      if (p.isCancel(language)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      const commitConvention = await p.select({
        message: "Commit convention",
        options: [
          { value: "conventional" as const, label: "Conventional Commits", hint: "feat:, fix:, chore:, etc." },
          { value: "gitmoji" as const, label: "Gitmoji", hint: "emoji-based commits" },
          { value: "angular" as const, label: "Angular", hint: "feat, fix, docs, style, refactor, test, chore" },
          { value: "kernel" as const, label: "Kernel", hint: "subsystem: description" },
          { value: "custom" as const, label: "Custom", hint: "no enforced format" },
        ],
      });
      if (p.isCancel(commitConvention)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }

      let apiKey: string | undefined;
      let claudeCliPath: string | undefined;
      if (provider === "claude-code-cli") {
        const resolved = resolveClaudeBinary();
        if (resolved) {
          p.log.success(`Claude Code CLI detected at ${resolved}`);
          claudeCliPath = resolved;
        } else {
          p.log.warn("Claude Code CLI not found in PATH or common locations.");
          const customPath = await p.text({
            message: "Enter the full path to the claude binary",
            placeholder: "/path/to/claude",
          });
          if (p.isCancel(customPath) || !customPath) {
            p.cancel(
              "Claude Code CLI is required.\nInstall it: npm install -g @anthropic-ai/claude-code\nOr switch to API provider: devflow init --force",
            );
            process.exit(1);
          }
          try {
            execSync(`"${customPath}" --version`, { stdio: "pipe" });
            claudeCliPath = customPath;
            p.log.success(`Claude Code CLI verified at ${customPath}`);
          } catch {
            p.cancel(`Could not run claude at "${customPath}". Check the path and try again.`);
            process.exit(1);
          }
        }
      } else {
        const existingKey = process.env.ANTHROPIC_API_KEY;
        if (existingKey) {
          const masked = existingKey.length > 8
            ? `${existingKey.slice(0, 7)}...${existingKey.slice(-4)}`
            : "****";
          const keepKey = await p.confirm({
            message: `ANTHROPIC_API_KEY already set (${masked}). Keep it?`,
          });
          if (p.isCancel(keepKey)) {
            p.cancel("Init cancelled.");
            process.exit(0);
          }
          if (!keepKey) {
            const newKey = await p.password({
              message: "Anthropic API Key",
            });
            if (p.isCancel(newKey)) {
              p.cancel("Init cancelled.");
              process.exit(0);
            }
            apiKey = newKey;
          }
        } else {
          const wantsKey = await p.confirm({
            message: "Configure Anthropic API Key now?",
            initialValue: true,
          });
          if (p.isCancel(wantsKey)) {
            p.cancel("Init cancelled.");
            process.exit(0);
          }
          if (wantsKey) {
            const newKey = await p.password({
              message: "Anthropic API Key",
            });
            if (p.isCancel(newKey)) {
              p.cancel("Init cancelled.");
              process.exit(0);
            }
            apiKey = newKey;
          }
        }
      }
      const config = {
        ...DEFAULT_CONFIG,
        provider: provider as DevflowConfig["provider"],
        ...(claudeCliPath ? { claudeCliPath } : {}),
        contextMode: contextMode as ContextMode,
        language: language as Language,
        commitConvention: commitConvention as CommitConvention,
        project: scan,
      };
      await writeConfig(cwd, config);
      await initState(cwd);
      if (apiKey) {
        await writeEnvVar(cwd, "ANTHROPIC_API_KEY", apiKey);
        process.env.ANTHROPIC_API_KEY = apiKey;
        p.log.success("API key saved to .devflow/.env");
      }
      if (!(await hasGhCli())) {
        p.log.warn("GitHub CLI (gh) not found. `devflow pr` will not work until installed.");
      }
      if (!(await isInGitignore(cwd, ".devflow/.env"))) {
        p.log.warn("Add .devflow/.env to .gitignore to avoid committing secrets.");
      }
      p.outro("Config saved to .devflow/config.json");
    });
}
