import { readUserConfig, writeUserConfig, writeApiKey } from "@denisvieiradev/gitwise-core";
import { resolveClaudeBinary } from "@denisvieiradev/gitwise-core";
import * as p from "@clack/prompts";
import os from "node:os";
import { join } from "node:path";
import { fileExists } from "@denisvieiradev/gitwise-core";

export interface FirstRunOptions {
  apiKey?: string;
  homeDir?: string;
}

/**
 * Returns true if first-run wizard is needed (no config.json found).
 */
export async function needsFirstRun(homeDir?: string): Promise<boolean> {
  const home = homeDir ?? os.homedir();
  const configPath = join(home, ".gitwise", "config.json");
  return !(await fileExists(configPath));
}

/**
 * Run the first-run provider setup wizard.
 * Writes ~/.gitwise/config.json and (if api mode) ~/.gitwise/.env.
 */
export async function runFirstRun(opts: FirstRunOptions = {}): Promise<void> {
  const { apiKey, homeDir } = opts;
  const home = homeDir ?? os.homedir();

  p.intro("Welcome to gitwise! Let's set up your AI provider.");

  // Detect claude binary
  const claudePath = resolveClaudeBinary();

  let provider: "api" | "claude-code";

  if (apiKey) {
    // Non-interactive: --api-key flag provided
    provider = "api";
    await writeApiKey(apiKey, home);
    await writeUserConfig({ provider }, home);
    p.outro("Configuration saved with API provider.");
    return;
  }

  if (claudePath) {
    p.log.info(`Claude Code CLI detected at: ${claudePath}`);
    const useClaudeCode = await p.confirm({
      message: "Use Claude Code CLI as the AI provider? (Recommended — no API key needed)",
      initialValue: true,
    });

    if (p.isCancel(useClaudeCode)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (useClaudeCode) {
      provider = "claude-code";
      await writeUserConfig({ provider, claudeCliPath: claudePath }, home);
      p.outro("Configuration saved with Claude Code provider.");
      return;
    }
  } else {
    p.log.info("Claude Code CLI not found in PATH. You can install it with: npm install -g @anthropic-ai/claude-code");
  }

  // Fall back to API key
  const key = await p.password({
    message: "Enter your Anthropic API key (starts with sk-ant-...):",
    validate: (v) => {
      if (!v || v.trim().length < 10) return "Please enter a valid API key";
      return undefined;
    },
  });

  if (p.isCancel(key)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  provider = "api";
  await writeApiKey(key as string, home);
  await writeUserConfig({ provider }, home);
  p.outro("Configuration saved with API provider.");
}
