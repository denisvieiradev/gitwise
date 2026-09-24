import os from "node:os";
import path from "node:path";
import { CliSubprocessProvider, resolveCliBinary } from "./cli-subprocess.js";
import type { CliProviderSpec, ModelConfig } from "./types.js";

const COMMON_CLAUDE_PATHS = [
  // Native installs (Homebrew, manual) — preferred over npm
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  path.join(os.homedir(), ".claude", "local", "claude"),
  // npm global installs — fallback
  path.join(os.homedir(), ".npm-global", "bin", "claude"),
];

// Same precedence as the other CLI providers (see resolveCliBinary).
export function resolveClaudeBinary(customPath?: string): string | null {
  return resolveCliBinary("claude", COMMON_CLAUDE_PATHS, customPath);
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
