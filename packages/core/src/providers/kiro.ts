import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CliProviderSpec } from "./types.js";

// CLI contract, verified 2026-09-22 without a live Kiro account (spec
// assumption: no paid subscription, so tests use mocked subprocess I/O):
// - Installed kiro-cli 2.23.0 `kiro-cli chat --help`: `chat [OPTIONS] [INPUT]`,
//   `--no-interactive`, `--model <MODEL>`, `--trust-tools=` (trust no tools),
//   `--wrap never` (raw output), `--output-format text|stream-json`.
// - https://kiro.dev/docs/cli/headless/ : the prompt is the positional INPUT,
//   or, "When stdin is piped and no positional argument is given, Kiro reads
//   the full stream as the instruction" (used for large prompts).
// - Neither source documents a token-usage field for text output, so tokens
//   are always null. The docs also leave the text-mode stdout shape and the
//   error channel unspecified, so ANSI styling is stripped defensively, and a
//   failure surfaces stderr verbatim, or stdout when stderr is empty.
// - Kiro has no system-prompt flag, so the system prompt is folded in.

const COMMON_KIRO_PATHS = [
  // macOS app bundle and the installer's symlink location — preferred
  "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli",
  path.join(os.homedir(), ".local", "bin", "kiro-cli"),
  "/opt/homebrew/bin/kiro-cli",
  "/usr/local/bin/kiro-cli",
];

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Same precedence pattern as resolveClaudeBinary: explicit path → common
// install paths → PATH lookup → nvm-managed bins.
export function resolveKiroBinary(customPath?: string): string | null {
  if (customPath) return isExecutable(customPath) ? customPath : null;

  for (const candidate of COMMON_KIRO_PATHS) {
    if (isExecutable(candidate)) return candidate;
  }

  try {
    const found = execSync("which kiro-cli", { stdio: "pipe" }).toString().trim();
    if (found && isExecutable(found)) return found;
  } catch {
    // not in PATH
  }

  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    for (const version of fs.readdirSync(nvmDir)) {
      const candidate = path.join(nvmDir, version, "bin", "kiro-cli");
      if (isExecutable(candidate)) return candidate;
    }
  } catch {
    // nvm not installed
  }

  return null;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;?]*[A-Za-z]/g;

export const kiroSpec: CliProviderSpec = {
  toolName: "Kiro CLI",
  installHint: "Install it from https://kiro.dev/docs/cli/ or re-run `gw provider` to choose another provider.",
  defaultCommand: "kiro-cli",
  foldSystemPrompt: true,
  resolveBinary: resolveKiroBinary,

  buildArgs({ prompt, modelId, large }) {
    return [
      "chat",
      "--no-interactive",
      "--trust-tools=",
      "--wrap",
      "never",
      "--model",
      modelId,
      ...(large ? [] : [prompt]),
    ];
  },

  parseOutput(stdout) {
    return { content: stdout.replace(ANSI_PATTERN, "").trim(), tokens: null };
  },

  formatExitError(code, stdout, stderr) {
    const detail = stderr.trim() || stdout.replace(ANSI_PATTERN, "").trim();
    return `Kiro CLI exited with code ${code}${detail ? `: ${detail}` : ""}`;
  },
};
