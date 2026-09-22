import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliSubprocessProvider } from "./cli-subprocess.js";
import type { CliProviderSpec, ModelConfig } from "./types.js";

const COMMON_CLAUDE_PATHS = [
  // Native installs (Homebrew, manual) — preferred over npm
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  path.join(os.homedir(), ".claude", "local", "claude"),
  // npm global installs — fallback
  path.join(os.homedir(), ".npm-global", "bin", "claude"),
];

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveClaudeBinary(customPath?: string): string | null {
  if (customPath) {
    if (isExecutable(customPath)) return customPath;
    return null;
  }

  // 1. Check known native install paths first (Homebrew, manual)
  for (const candidate of COMMON_CLAUDE_PATHS) {
    if (isExecutable(candidate)) return candidate;
  }

  // 2. Fall back to PATH lookup (may find nvm/npm version)
  try {
    const found = execSync("which claude", { stdio: "pipe" }).toString().trim();
    if (found && isExecutable(found)) return found;
  } catch {
    // not in PATH
  }

  // 3. Check nvm installations as last resort
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    const versions = fs.readdirSync(nvmDir);
    for (const version of versions) {
      const candidate = path.join(nvmDir, version, "bin", "claude");
      if (isExecutable(candidate)) return candidate;
    }
  } catch {
    // nvm not installed
  }

  return null;
}

export const claudeCodeSpec: CliProviderSpec = {
  toolName: "Claude Code CLI",
  installHint: "Re-run `gw config` to reconfigure.",
  defaultCommand: "claude",
  foldSystemPrompt: false,
  resolveBinary: resolveClaudeBinary,

  buildArgs({ prompt, systemPrompt, modelId, large }) {
    return [
      "-p",
      ...(large ? [] : [prompt]),
      "--system-prompt",
      systemPrompt,
      "--model",
      modelId,
      "--output-format",
      "json",
    ];
  },

  parseOutput(stdout) {
    const parsed = JSON.parse(stdout);

    if (parsed.is_error) {
      throw new Error(`Claude CLI returned error: ${parsed.result}`);
    }

    return {
      content: parsed.result ?? "",
      tokens: {
        input: parsed.usage?.input_tokens ?? 0,
        output: parsed.usage?.output_tokens ?? 0,
      },
    };
  },

  formatExitError(code, stdout, stderr) {
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.is_error) return `Claude CLI error: ${parsed.result}`;
      } catch {
        // stdout wasn't valid JSON
      }
    }
    const filteredStderr = stderr.replace(/Warning: no stdin data.*\n?/g, "").trim();
    return `Claude CLI exited with code ${code}${filteredStderr ? `: ${filteredStderr}` : ""}`;
  },
};

export class ClaudeCodeProvider extends CliSubprocessProvider {
  constructor(models: ModelConfig, claudeCliPath?: string) {
    super(claudeCodeSpec, models, claudeCliPath);
  }
}
