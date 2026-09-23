import { readUserConfig, writeUserConfig, writeApiKey } from "@denisvieiradev/gitwise-core";
import * as p from "@clack/prompts";
import os from "node:os";
import { join } from "node:path";
import { fileExists } from "@denisvieiradev/gitwise-core";
import type { UserConfig } from "@denisvieiradev/gitwise-core";
import { detectAvailableProviders } from "./detect-providers.js";
import type { DetectedProvider } from "./detect-providers.js";

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

const CLI_PATH_KEYS = {
  "claude-code": "claudeCliPath",
  codex: "codexCliPath",
  copilot: "copilotCliPath",
  kiro: "kiroCliPath",
} as const;

/**
 * The config fields to persist for a chosen CLI-based provider: the provider
 * kind plus its resolved binary path. Shared with `gw provider` so both write
 * config identically (CFG-02).
 */
export function cliProviderConfigUpdate(chosen: DetectedProvider): Partial<UserConfig> {
  if (chosen.kind === "api") return { provider: "api" };
  const update: Partial<UserConfig> = { provider: chosen.kind };
  if (chosen.binaryPath) update[CLI_PATH_KEYS[chosen.kind]] = chosen.binaryPath;
  return update;
}

/**
 * Run the first-run provider setup wizard.
 * Writes ~/.gitwise/config.json and (if api mode) ~/.gitwise/.env.
 */
export async function runFirstRun(opts: FirstRunOptions = {}): Promise<void> {
  const { apiKey, homeDir } = opts;
  const home = homeDir ?? os.homedir();

  p.intro("Welcome to gitwise! Let's set up your AI provider.");

  if (apiKey) {
    // Non-interactive: --api-key flag provided
    await writeApiKey(apiKey, home);
    await writeUserConfig({ provider: "api" }, home);
    p.outro("Configuration saved with API provider.");
    return;
  }

  // CFG-03: offer every detected CLI (in detection order), not just the first.
  const detectedClis = detectAvailableProviders().filter((d) => d.kind !== "api" && d.detected);

  if (detectedClis.length > 0) {
    const choice = await p.select({
      message: "Which AI provider do you want to use?",
      options: [
        ...detectedClis.map((d) => ({
          value: d.kind,
          label: d.label,
          hint: d.binaryPath ?? undefined,
        })),
        { value: "api", label: "Anthropic API key" },
      ],
    });

    if (p.isCancel(choice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const chosen = detectedClis.find((d) => d.kind === choice);
    if (chosen) {
      await writeUserConfig(cliProviderConfigUpdate(chosen), home);
      p.outro(`Configuration saved with ${chosen.label} provider.`);
      return;
    }
  } else {
    p.log.info("No supported AI CLI (Claude Code, Codex, Copilot, Kiro) found in PATH.");
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

  await writeApiKey(key as string, home);
  await writeUserConfig({ provider: "api" }, home);
  p.outro("Configuration saved with API provider.");
}
